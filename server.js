"use 'esversion: 6'";
"use strict";
/* jslint node: true */

/******************************************************************************
	AFD WebUI Server
	================

Bound URL paths
---------------
/ + /ui	: http/https -> index.html.
/view	: http/https, view file from archive.
/ctrl	: ws/wss, afd_ctrl.
/log	: ws/wss, show_log page.


All communication between WebUI server and client is done by exchanging JSON 
via Websocket.

The messages have these attributes:
-----------------------------------
user:		string:			? user profile.
class:		string:			<fsa|alias|afd|...>.
action:		string:			depends on class.
command:	string:			optional, only some actions have commands,
							eg. read|save|start|stop.
alias: 		[string, ...]:	optional, all alias related actions expect a list
							of alias names.
text: 		string:			optional, if plain text is send/received, eg. the
							text for INFO.
data: 		{}:				optional, general object for data. 


For log window the messages are different:
------------------------------------------
Request
^^^^^^^
class: 		string:	"log".
context:	string: "system|event|transfer|transfer-debug|input|output|delete".
action:		string:	"list|info".
filter: 	{}:
	file:		number:	the file number for file-organized logs.
	level:		string: Regex of log-level letter <I|C|W|E|O|D>.
	paramSet...	{}:		Object with filter parameter, the names reflect
						classes/names in html.


Response
^^^^^^^^
class:		string:		"log">.
context: 	string: 	"system|event|transfer|transfer-debug|input|output|delete".
action:		string:		"list|info".
append: 	bool:		true|false, if the lines/text should be appended to
						existing log lines.
lines:		[ string ]:	log data.
data:		{}:			optional, object with file info details.

******************************************************************************/

const process = require("process");
const yargs = require("yargs");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const url = require('url');
const winston = require('winston');
const express = require('express');
const session = require('express-session');
const basicAuth = require('express-basic-auth');
const ejs = require('ejs');
const { execFile, execFileSync } = require("child_process");

/*
 * Parse command line arguments. It's done this early to set correct path to
 * static pages.
 */
const argv = yargs
	.command("start", "Start WebUI server.", {
		port: {
			alias: "p",
			type: "number",
			default: 8040,
			description: "Bind server to this local port."
		},
		pid: {
			alias: "P",
			type: "string",
			description: "PID file."
		},
		no_tls: {
			type: "boolean",
			default: false,
			description: "Do not use TLS. Start as unsecured HTTP-server."
		},
		cert: {
			type: "string",
			description: "Path to SSL/TLS certificate/keys files."
		},
	})
	.command("stop", "Stop WebUI server.", {
		pid: {
			alias: "P",
			type: "string",
			description: "Stop server with PID in file.",
		}
	})
	.option("afd_work_dir", {
		alias: "w",
		type: "string",
		description: "AFD work directory, per instance.",
	})
	.option("verbose", {
		alias: "v",
		type: "boolean",
		default: false
	})
	.option("mock", {
		type: "boolean",
		default: false
	})
	.help()
	.alias("help", "h")
	.argv;

let MOCK = argv.mock;
if (MOCK) {
	console.debug(argv);
}

/* ****************************************************************************
 * Set afd-work-dir.
 */
if (!("afd_work_dir" in argv) || argv.afd_work_dir === "") {
	console.error("'-w AFD_WORK_DIR' is required!");
	process.exit(1);
}
const AFD_WEBUI_DIR = __dirname; // path.dirname(process.argv[1]);
const AFD_WORK_DIR = argv.afd_work_dir;

/* ****************************************************************************
 * Setup logging.
 */
const logger = (function setup_logging() {
	var logLevel = "info";
	var logTransport = [new winston.transports.File({
		filename: path.join(AFD_WORK_DIR, "log", "webui.log")
	})];
	if (argv.verbose) {
		logLevel = "debug";
		logTransport.push(new winston.transports.Console());
	}
	return winston.createLogger({
		level: logLevel,
		format: winston.format.printf(
			entry => `${new Date().toISOString()} ${entry.level}: ${entry.message}`
		),
		transports: logTransport
	});
})();

/* ****************************************************************************
 * Handle start and stop command, pid file, and set signal handlers.
 */
(function start_or_stop() {
	let pid_file_name;
	if (argv.pid) {
		pid_file_name = argv.pid;
	}
	else {
		pid_file_name = path.join(AFD_WORK_DIR, "fifodir", "afdweb.pid");
	}
	if ("stop".indexOf(argv._) != -1) {
		/* stop server with pid found in pid-file. */
		logger.info("Stopping AFD web-UI ...");
		try {
			let data = fs.readFileSync(pid_file_name, { encoding: "utf-8" });
			let pid = int_or_str(data);
			logger.debug(`PID from file: ${pid}`);
			process.kill(pid, "SIGTERM");
			fs.unlinkSync(pid_file_name);
			process.exit(0);
		}
		catch (e) {
			logger.error(`Can't read PID file '${pid_file_name}'!`);
			process.exit(1);
		}
	}
	else {
		/* execute the rest of this code file. */
		logger.info("Starting AFD web-UI ...");
		let pid = `${process.pid}`;
		logger.debug(`With PID: ${pid}`);
		fs.writeFile(pid_file_name, pid, { encoding: "utf-8" }, () => { });
	}
	function handle_exit(signal) {
		logger.info(`Caught signal ${signal}`);
		process.exit(0);
	}
	process.on('SIGINT', handle_exit);
	process.on('SIGTERM', handle_exit);
	process.on("exit", () => { logger.info(`Exit AFD web-UI server.`); });
})();

/* ****************************************************************************
 * Some global constants.
 */
const AFDCMD_ARGS = {
	start: ["-t", "-q"],
	stop: ["-T", "-Q"],
	able: ["-X"],
	debug: ["-d"],
	trace: ["-c"],
	fulltrace: ["-C"],
	switch: ["-s"],
	retry: ["-r"],
};

const AFDLOG_FILES = {
	system: "SYSTEM_LOG.",
	receive: "RECEIVE_LOG.",
	transfer: "TRANSFER_LOG.",
	transfer_debug: "TRANS_DB_LOG."
};

const CONTENT_TYPE = {
	OCTET: "application/octet-stream",
	PLAIN: "text/plain",
	HTML: "text/html",
};

const STATUS = {
	ok: 200,
	ok_accepted: 202,
	ok_no_content: 204,
	forbidden: 403,
	not_found: 404,
	method_not_allowed: 405,
	not_acceptable: 406,
	conflict: 409,
	precondition_failed: 412,
	not_satisfyable: 416,
	error: 500,
};

/** Holds interval object sending fsa-status to all ws-connections. */
var fsaLoopInterval = null;
/** Heartbeat interval time and timeout. */
const HEARTBEAT_INTERVAL_TIME = 10000;

/**
 * Some details from AFD_CONFIG file we use in WebUI server.
 *
 * If a key can occur more than one time in AFD_CONFIG, the values are
 * stored as a list of strings instead of as a string.
 */
const AFD_CONFIG = {};
const VIEW_DATA = { named: {}, filter: {} };
/**
 * Read AFD_CONFIG.
 */
fs.readFile(
	path.join(AFD_WORK_DIR, "etc", "AFD_CONFIG"),
	{ encoding: "latin1" },
	function parse_afd_config(err, data) {
		if (!err) {
			const re_no = /^(?:$|#|\s+)/;
			const re_kv = /(\S+)\s+(.*)/;
			for (const line of data.split("\n")) {
				if (re_no.test(line)) {
					continue;
				}
				let m = re_kv.exec(line);
				if (m[1] in AFD_CONFIG) {
					let buf = AFD_CONFIG[m[1]];
					if (buf !== undefined) {
						if ((typeof buf) === "string") {
							buf = [buf];
						}
						buf.push(m[2].trim());
						AFD_CONFIG[m[1]] = buf;
					}
				}
				else {
					AFD_CONFIG[m[1]] = m[2].trim();
				}
			}
		}
		else {
			throw Error("Can't read AFD_CONFIG!");
		}
		const re_a = /(\*|\?)/g;
		if ("VIEW_DATA_PROG" in AFD_CONFIG) {
			for (const p of AFD_CONFIG.VIEW_DATA_PROG) {
				let i = p.lastIndexOf(" ");
				VIEW_DATA.filter[
					p.substring(i + 1).replace(re_a, ".$1")
				] = p.substring(0, i)
					.replace("--with-show_cmd \"", "")
					.replace(/\"$/, "");
			}
		}
		if ("VIEW_DATA_NO_FILTER_PROG" in AFD_CONFIG) {
			for (const p of AFD_CONFIG.VIEW_DATA_NO_FILTER_PROG) {
				let i = p.indexOf(" ");
				VIEW_DATA.named[p.substring(0, i)] = p.substring(i + 1)
					.replace("--with-show_cmd \"", "")
					.replace(/\"$/, "");
			}
		}
		logger.info("AFD_CONFIG parsed.");
	}
);

/* ***************************************************************************
 * Setup server.
 * ***************************************************************************
 *
 * First, instantiate express and add midleware.
 */
var http_module;
let http_options = {};
const app = express();
var templates = {};

(function setup_middleware() {
	app.disable('x-powered-by');
	/*
	 * User authentication.
	 */
	/* TODO: write proper validation! */
	app.use(basicAuth({
		users: JSON.parse(
			fs.readFileSync(
				path.join(AFD_WORK_DIR, "etc", "webui.users"),
				{ encoding: "latin1" }
			)),
		challenge: true,
		realm: "AFD"
	}));
	app.use("/ui", express.static(path.join(AFD_WEBUI_DIR, "public")));
	app.use("/$", express.static(path.join(AFD_WEBUI_DIR, "public")));
	/*
	 * Prepare session context handler.
	 */
	const sessionParser = session({
		saveUninitialized: false,
		secret: "$eCuRiTy",
		resave: false
	});
	app.use(sessionParser);
	/**
	 * Set dynamic routing for content-view.
	 *
	 * The worker function needs to send the response object 'res'.
	 *
	 * GET "/view/<mode>/<path:arcfile>"
	 */
	app.get('/view/:mode/:arc([a-zA-Z0-9.,_/-]+)', function(req, res) {
		view_content(res, req.params.arc, req.params.mode);
	});
	/*
	 * Setup template engine.
	 */
	app.set('view engine', 'ejs');
	fs.readdir(path.join(AFD_WEBUI_DIR, "templates"), (err, template_files) => {
		if (!err) {
			for (const fn of template_files) {
				if (fn.endsWith(".html")) {
					fs.readFile(path.join(AFD_WEBUI_DIR, "templates", fn),
						{ encoding: "utf8" },
						(err, data) => {
							if (!err) {
								logger.debug(`Load template ${fn}`);
								templates[fn] = ejs.compile(data);
							}
						}
					);
				}
			}
		}
	});
	/* 
	 * If SSL/TLS is requested, load HTTPS module and secure the server. Otherwise 
	 * load unsecure HTTP module.
	 */
	if (argv.no_tls) {
		logger.info("Start unsecured HTTP server.")
		http_module = require("http");
	}
	else {
		http_module = require("https");
		/*
		cert: /etc/pki/tls/certs
		key:  /etc/pki/tls/private
		*/
		http_options["cert"] = fs.readFileSync(path.join(AFD_WEBUI_DIR, "certs", "public-cert.pem"));
		http_options["key"] = fs.readFileSync(path.join(AFD_WEBUI_DIR, "certs", "private-key.pem"));
	}
})();
/*
 * Create server objects.
 */
const server = http_module.createServer(http_options, app);
const wss_ctrl = new WebSocket.Server({ noServer: true, clientTracking: true });
const wss_log = new WebSocket.Server({ noServer: true, clientTracking: true });

/**
 * Handle upgrade to Websocket connection.
 * 
 * Use seperate ws-server for ctrl and log.
 */
server.on('upgrade', function upgrade2ws(request, socket, head) {
	const pathname = url.parse(request.url).pathname;

	if (pathname === '/ctrl') {
		wss_ctrl.handleUpgrade(request, socket, head, function done(ws) {
			wss_ctrl.emit('connection', ws, request);
		});
	} else if (pathname === '/log') {
		wss_log.handleUpgrade(request, socket, head, function done(ws) {
			wss_log.emit('connection', ws, request);
		});
	} else {
		socket.destroy();
	}
});

/*
 * When Websocket-Server establishes an incoming connection ...
 */
wss_ctrl.on("connection", function connection_ctrl(ws, req) {
	const ip = req.socket.remoteAddress;
	logger.info(`Connection ctrl open from ${ip}`);
	ws.isAlive = true;
	ws.on('pong', heartbeat);
	/*
     * Evaluate incoming message, dispatch actions to functions.
     */
	ws.on("message", function incoming(message_raw) {
		const message = JSON.parse(message_raw);
		logger.debug(`CTRL RCVD: ${ip}, ${message_raw}`);
		/* */
		switch (message.class) {
			case "fsa":
				/* About sending status to client. */
				switch (message.action) {
					case "start":
						fsaLoopStart();
						break;
					case "stop":
						fsaLoopStop();
						break;
				}
				break;
			case "afd":
				/* All actions controlling AFD itself. */
				action_afd(message, ws);
				break;
			case "alias":
				/* All alias/host related actions. */
				action_alias(message, ws);
				break;
			default:
				logger.warn("unknown class ...");
		}
	});

	/*
     * When a connection is closed by the client ...
     */
	ws.on("close", () => {
		fsaLoopStop();
		heartbeatStop();
		logger.info(`Connection ctrl close from ${ip}`);
	});

	/*
     * In case of any error, cutting a connection ...
     */
	// TODO: ???
});

/**
 * 
 */
function heartbeatStop() {
	if (wss_ctrl.clients.size == 0) {
		logger.debug("clear heartbeat interval");
		clearInterval(heartbeat_interval);
		heartbeat_interval = null;
	}
}

function heartbeat() {
	this.isAlive = true;
}

var heartbeat_interval = setInterval(() => {
	wss_ctrl.clients.forEach((ws) => {
		if (ws.isAlive === false) {
			logger.info(`Connection ctrl cut from ${ws}`);
			return ws.terminate();
		}
		ws.isAlive = false;
		ws.ping(() => { });
	});
}, HEARTBEAT_INTERVAL_TIME);

/*
 * When Websocket-Server establishes an incoming connection ...
 */
wss_log.on("connection", function connection_log(ws, req) {
	const ip = req.socket.remoteAddress;
	logger.info(`Connection log open from ${ip}`);
	/*
     * Evaluate incoming message, dispatch actions to functions.
     */
	ws.on("message", function incoming(message_raw) {
		const message = JSON.parse(message_raw);
		logger.debug(`LOG RCVD: ${ip}, ${message_raw}`);
		/* */
		if (message.class !== "log") {
			logger.warn(`unknown class: ${message.class}!`);
			return;
		}
		if (message.action === "list") {
			switch (message.context) {
				/* Handeled by route-mapper (express).
				case "view":
					break;
				*/
				case "system":
				case "receive":
				case "transfer":
				case "transfer_debug":
					log_from_file(message, ws);
					break;
				default:
					log_from_alda(message, ws);
					break;
			}
		}
		else if (message.action === "info") {
			switch (message.context) {
				case "input":
				case "output":
					view_file_info(
						message.context,
						message.filter,
						(info_set) => {
							const msg = {
								class: "log",
								context: message.context,
								action: "info",
								data: info_set
							};
							ws.send(JSON.stringify(msg));
						});
					break;
			}
		}
		else {
			logger.warn(`unknown action: ${message.action}!`);
			return;
		}
	});

	/*
     * When a connection is closed by the client ...
     */
	ws.on("close", () => {
		logger.info(`Connection log close from ${ip}`);
	});

	/*
     * In case of any error, cutting a connection ...
     */
	// TODO:
});


/** */
function fsaLoopStart() {
	if (MOCK) {
		return fsaLoopStartMock();
	} else {
		return fsaLoopStartReal();
	}
}

/** */
function fsaLoopStop() {
	logger.debug("fsa loop stop");
	if (wss_ctrl.clients.size == 0) {
		clearInterval(fsaLoopInterval);
		fsaLoopInterval = null;
	}
}

/**
 * Setup Interval: read and prepare fsa_view output.
 */
function fsaLoopStartReal() {
	logger.debug("start fsa loop with real data.");
	if (fsaLoopInterval === null) {
		fsaLoopInterval = setInterval(() => {
			execFile("fsa_view_json",
				["-w", AFD_WORK_DIR],
				{ encoding: "latin1" },
				(error, stdout, stderr) => {
					if (error) {
						logger.error(stderr);
						throw error;
					}
					else {
						for (const ws_instance of wss_ctrl.clients) {
							ws_instance.send('{"class":"fsa","data":' + stdout + "}");
						}
					}
				}
			);
		}, 2000);
	}
}

function fsaLoopStartMock() {
	let counter = 0;
	logger.debug("read fsa.json");
	let data = JSON.parse(fs.readFileSync(AFD_WEBUI_DIR + "/mock/fsa.json"));
	data.counter = counter;
	logger.debug(`start fsa loop with mocked data.`);
	if (fsaLoopInterval === null) {
		fsaLoopInterval = setInterval(() => {
			logger.debug(`fsa send #${counter} to ${wss_ctrl.clients.size}`);
			data.counter = counter;
			for (const ws_instance of wss_ctrl.clients) {
				ws_instance.send(JSON.stringify(data));
			}
			counter++;
		}, 2000);
	}
}

/**
 * Dispatch to AFD controlling functions.
 */
function action_afd(message, ws) {
	let cmd = null;
	let cmd_opt = "";
	switch (message.action) {
		case "amg":
			if (message.command == "toggle") {
				cmd = "afdcmd";
				cmd_opt = "-Y";
			}
			break;
		case "fd":
			if (message.command == "toggle") {
				cmd = "afdcmd";
				cmd_opt = "-Z";
			}
			break;
		case "dc":
			if (message.command == "update") {
				cmd = "udc";
				cmd_opt = "";
			}
			break;
		case "hc":
			try {
				switch (message.command) {
					case "read":
						const hc_data = read_hostconfig(message.alias[0]);
						ws.send(JSON.stringify(hc_data));
						break;
					case "save":
						save_hostconfig(message.data);
						break;
					case "update":
						cmd = "uhc";
						cmd_opt = "";
						break;
				}
			}
			catch (e) {
				logger.error(e);
				ws.send(JSON.stringify({
					class: message.class,
					command: message.command,
					action: message.action,
					status: STATUS.not_satisfyable,
					message: `${e.name}: ${e.message}`
				}));
			}
			break;
		case "afd":
			switch (message.command) {
				case "start":
					cmd = "afd";
					cmd_opt = "-a";
					break;
				case "stop":
					cmd = "afd"
					cmd_opt = "-s"
					break;
				default:
					logger.warn(`Unclear command '${message.command}'!`);
			}
			break;
		default:
			logger.warn(`Unclear action '${message.action}'!`);
	}
	if (cmd !== null) {
		exec_cmd(cmd, true, cmd_opt,
			(error, stdout, stderr) => {
				if (error) {
					logger.warn(`${cmd} ${cmd_opt} -> <${error}> ${stderr}`);
				}
				else {
					logger.debug(`${cmd} ${cmd_opt} -> ${stdout}`);
				}
			}
		);
	}
}

/**
 * Dispatch to alias/host related functions.
 */
function action_alias(message, ws) {
	switch (message.action) {
		case "select":
		case "deselect":
			const msg = {
				class: "alias",
				action: message.action,
				alias: search_host(message.action, message.data)
			};
			ws.send(JSON.stringify(msg));
			break;
		case "info":
			if (message.command === "read") {
				collect_host_info(message.alias, (alias, html) => {
					let reply = {
						class: "alias",
						action: "info",
						alias: alias,
						text: html
					};
					ws.send(JSON.stringify(reply));
				});
			}
			else if (message.command === "save") {
				let fn_info = path.join(AFD_WORK_DIR, "etc", "INFO-" + message.alias);
				fs.writeFile(
					fn_info,
					message.text,
					{ encoding: "latin1", flag: "w" },
					(err) => {
						if (err) {
							logger.error(`Error writing INFO file: ${err}`);
						}
					}
				);
			}
			break;
		case "config":
			for (const alias of message.alias) {
				exec_cmd("get_dc_data", true,
					["-h", alias],
					(error, dc_data, stderr) => {
						logger.debug(`EXEC-> ${error}, ${dc_data}, ${stderr}`);
						if (!error) {
							const msg = {
								class: "alias",
								action: "config",
								alias: alias,
								text: dc_data
							};
							ws.send(JSON.stringify(msg));
						}
					}
				);
			}
			break;
		default:
			if (message.action in AFDCMD_ARGS) {
				exec_cmd(
					"afdcmd", true,
					AFDCMD_ARGS[message.action].concat(message.alias),
					(error, stdout, stderr) => {
						if (error) {
							logger.warn(`afdcmd ${message.action} ${message.alias} -> ${stderr}`);
							message["status"] = STATUS.error;
							ws.send(JSON.stringify(message));
						}
						else {
							logger.debug(`afdcmd ${message.action} ${message.alias} -> ${stdout}`);
						}

					}
				);

			}
			else {
				message["status"] = STATUS.error;
				ws.send(JSON.stringify(message));
			}
	}
}

/*******************************************************************************
 * ALias/host realted functions.
 ******************************************************************************/

/**
 * Collect information for one host. Details are inserted in rendered html
 * template, which is send via callback.
 * 
 * callback: (alias, html)
 */
function collect_host_info(host, callback) {
	let field_values = {
		HOST_ONE: "",
		HOST_TWO: "",
		info_text: "No information available."
	};
	exec_cmd("fsa_view", true, [host], (err, raw, _) => {
		if (err) {
			logger.warn(err);
			return;
		}
		raw.split("\n").forEach((l) => {
			if (!l.length || l[0] == " ") {
				return;
			}
			if (l[0] == "-") {
				return;
			}
			if (l[0] == "=") {
				field_values["hostname"] = l.split(" ")[1];
				field_values["host1"] = field_values["hostname"];
				field_values["host2"] = field_values["hostname"];
			}
			let le = l.split(":").map(x => x.trim());
			if (le.length < 2) {
				return;
			}
			switch (le[0]) {
				case "Real hostname 1":
					field_values["real1"] = le[1];
					break;
				case "Real hostname 2":
					field_values["real2"] = le[1];
					break;
				case "Host toggle":
					field_values[le[1]] = "checked";
					break;
				case "Host toggle string":
					field_values["host1"] = field_values["hostname"] + le[1][1];
					field_values["host2"] = field_values["hostname"] + le[1][2];
					break;
				case "File counter done":
					field_values["filetransf"] = le[1];
					break;
				case "Bytes send":
					field_values["bytetransf"] = le[1];
					break;
				case "Last connection":
					field_values["lastcon"] = le.slice(1).join(":");
					break;
				case "Connections":
					field_values["connects"] = le[1];
					break;
				case "Total errors":
					field_values["toterr"] = le[1];
					break;
				case "Retry interval":
					field_values["retrint"] = le[1];
			}
			if (le[0].startsWith("Protocol")) {
				field_values["protocol"] = le[1].split(" ")[0];
			}
		});
		logger.debug(field_values);
		let fn_info = path.join(AFD_WORK_DIR, "etc", "INFO-" + field_values["hostname"])
		fs.readFile(fn_info, (err, data) => {
			if (err) {
				if (err.code === "ENOENT") {
					logger.error(`File does not exist: ${fn_info}`);
				}
				else {
					throw err;
				}
			}
			else {
				field_values["info_text"] = data;
			}
			callback(host, templates["host_info.html"](field_values))
		});
	});
}

function search_host(action, form_json) {
	let host_list = [];
	const proto_map = collect_protocols();

	function test_protocol(host) {
		let ok = false;
		const pl = proto_map[host];
		if (pl === undefined || pl.length == 0) {
			ok = true;
		}
		else {
			for (const p of pl) {
				if (form_json.modal_select_protocol.indexOf(p) >= 0) {
					ok = true
				}
			}
		}
		return ok;
	}

	let re_matcher;
	if ("modal_select_string" in form_json && form_json.modal_select_string != "*") {
		re_matcher = new RegExp(form_json.modal_select_string);
	}
	else {
		re_matcher = new RegExp(".*");
	}
	let hc_data = read_hostconfig(null)["data"];
	for (const hc_key in hc_data) {
		const hc_set = hc_data[hc_key];
		if (!test_protocol(hc_key)) {
			continue;
		}
		if (form_json.modal_select_where[0] == "info") {
			fn_info = path.join(afd_work_dir, "etc", "INFO-" + hc_key)
			try {
				fs.accessSync(fn_info);
				let info_text = fs.readFileSync(fn_info, { encoding: "utf8" });
				if (re_matcher.test(info_text)) {
					host_list = host_list.concat(hc_key)
				}
			}
			catch (e) {
				logger.warn(e);
			}
		}
		else {
			if (form_json.modal_select_hostname == "alias") {
				if (re_matcher.test(hc_set.alias)) {
					host_list = host_list.concat(hc_key)
				}
			}
			else {
				if (re_matcher.test(hc_set.host_name_real1) || re_matcher.test(hc_set.host_name_real2)) {
					host_list = host_list.concat(hc_key)
				}
			}
		}
	}
	return host_list;
}

/*******************************************************************************
 * Functions to read and write AFD configuration files.
 ******************************************************************************/


/*
 * These field names tuple represent the fields in HOST_CONFIG. Important is
 * their exact order! Fields for columns 3 (HostToggle) and 14 (SpecialFlag) and
 * 20 (duplicate-check) are flags, where the value of "bit" in the tuple denotes
 * the bit to set. If this field "bit" is set to a value >=0, then
 * bit-arithmetic is applied. For html-radio-input the column "radio-value" is
 * taken in, too. Special case: the fields "host_switch_*" are combined into one
 * column.
 */
const HC_FIELD_NAME = 0;
const HC_FIELD_RADIO = 1;
const HC_FIELD_DEFAULT = 2;
const HC_FIELD_COLUMN = 3;
const HC_FIELD_BIT = 4;
const HC_FIELDS = [
	/* field-name, radio-value, default, column, bit */
	["alias", null, "", 0, -1],  // AH - Alias hostname
	["host_name_real1", null, "", 1, -1],  // HN1 - Real hostname 1
	["host_name_real2", null, "", 2, -1],  // HN2 - Real hostname 2
	["host_switch_enable", null, "no", 3, -2],  // HT - Host toggle enable
	["host_switch_char1", null, "", 3, -2],  // HT - Host toggle character 1
	["host_switch_char2", null, "", 3, -2],  // HT - Host toggle character 2
	["host_switch_auto", null, "no", 3, -2],  // HT - Automatic host
	// switching: yes={}, no=[]
	["proxy_name", null, "", 4, -1],  // PXY - Proxy name
	["max_parallel_transfer", null, "3", 5, -1],  // AT - Allowed transfers
	["max_errors", null, "10", 6, -1],  // ME - Max. errors
	["retry_interval", null, "120", 7, -1],  // RI - Retry interval
	["transfer_block_size", null, "4 KB", 8, -1],  // TB - Transfer block size
	["successful_retries", null, "0", 9, -1],  // SR - Successful retries
	["filesize_offset_for_append", null, "null", 10, -1],  // FSO - File size
	// offset
	["transfer_timeout", null, "60", 11, -1],  // TT - Transfer timeout
	["no_burst", null, "0", 12, -1],  // NB - Number of no bursts
	["host_status", null, "0", 13, -1],  // HS - Mostly irrelevant for
	// HC-edit page!
	["ignore_error_warning", null, "no", 13, 4],  // HS:5 - Error status
	// offline
	["do_not_delete", null, "no", 13, 15],  // HS:16 - Do not delete files due
	// age-limit and 'delete queued
	// files'
	["ftp_mode_passive", null, "no", 14, 0],  // SF:1 - FTP passive mode
	["ftp_idle_time", null, "no", 14, 1],  // SF:2 - Set FTP idle time to
	// transfer timeout
	["ftp_keep_alive", null, "no", 14, 2],  // SF:3 - Send STAT command to keep
	// control connection alive.
	["ftp_fast_rename", null, "no", 14, 3],  // SF:4 - Combine RNFR and RNTO
	// to one command.
	["ftp_fast_cd", null, "no", 14, 4],  // SF:5 - Do not do a cd, always use
	// absolute path.
	["ftp_no_type_i", null, "no", 14, 5],  // SF:6 - Do not send TYPE I
	// command.
	["ftp_mode_epsv", null, "no", 14, 6],  // SF:7 - Use extended active or
	// extended passive mode.
	["disable_burst", null, "no", 14, 7],  // SF:8 - If set bursting is
	// disabled.
	["ftp_allow_redirect", null, "no", 14, 8],  // SF:9 - If set FTP passive
	// mode allows to be redirected
	// to another address.
	["use_local_scheme", null, "no", 14, 9],  // SF:10 - When set it will
	// replace the given scheme with
	// file if the hostname matches
	// local hostname or one in
	// local_interface.list.
	["tcp_keep_alive", null, "no", 14, 10],  // SF:11 - Set TCP keepalive.
	["sequence_locking", null, "no", 14, 11],  // SF:12 - Set sequence locking.
	["enable_compress", null, "no", 14, 12],  // SF:13 - Enable compression.
	["keep_timestamp", null, "no", 14, 13],  // SF:14 - Keep time stamp of
	// source file.
	["sort_names", null, "no", 14, 14],  // SF:15 - Sort file names.
	["no_ageing_jobs", null, "no", 14, 15],  // SF:16 - No ageing jobs.
	["check_local_remote_match_size", null, "no", 14, 16],  // SF:17 - Check if
	// local and remote
	// size match.
	["is_timeout_transfer", null, "no", 14, 17],  // SF:18 - Timeout transfer.
	["keep_connected_direction", "send", "no", 14, 18],  // SF:19 - Keep
	// connected no
	// fetching.
	["keep_connected_direction", "fetch", "no", 14, 19],  // SF:20 - Keep
	// connected no
	// sending.
	["ftps_clear_ctrlcon", null, "no", 14, 20],  // SF:21 - FTPS Clear
	// Control Connection.
	["ftp_use_list", null, "no", 14, 21],  // SF:22 - Use FTP LIST for
	// directory listing.
	["tls_strict_verification", null, "no", 14, 22],  // SF:23 - TLS uses
	// strict verification
	// of host.
	["ftp_disable_mlst", null, "no", 14, 23],  // SF:24 - Disables FTP MLST for
	// directory listing.
	["keep_connected_disconnect", null, "no", 14, 24],  // SF:25 - Disconnect
	// after given keep
	// connected time.
	["transfer_rate_limit", null, "0", 15, -1],  // TRL - Transfer rate limit
	["time_to_live", null, "0", 16, -1],  // TTL - TCP time-to-live
	["socket_send_buffer", null, "0", 17, -1],  // SSB - Socket send buffer
	["socket_receive_buffer", null, "0", 18, -1],  // SRB - Socket receive
	// buffer
	["dupcheck_timeout", null, "0", 19, -1],  // DT - Duplicate check timeout
	["dupcheck_type", "name", "no", 20, 0],  // DF:1 - Only do CRC checksum
	// for filename.
	["dupcheck_type", "content", "no", 20, 1],  // DF:2 - Only do CRC checksum
	// for file content.
	["dupcheck_type", "name-content", "no", 20, 2],  // DF:3 - Checksum for
	// filename and content.
	["dupcheck_type", "name-no-suffix", "no", 20, 3],  // DF:4 - Checksum of
	// filename without last
	// suffix.
	["dupcheck_type", "name-size", "no", 20, 4],  // DF:5 - Checksum of
	// filename and size.
	["dupcheck_crc", "crc32", "no", 20, 15],  // DF:16 - Do a CRC32 checksum.
	["dupcheck_crc", "crc32c", "no", 20, 16],  // DF:17 - Do a CRC32C checksum.
	["dupcheck_delete", null, "yes", 20, 23],  // DF:24 - Delete the file.
	["dupcheck_store", null, "no", 20, 24],  // DF:25 - Store the duplicate
	// file.
	["dupcheck_warn", null, "no", 20, 25],  // DF:26 - Warn in SYSTEM_LOG.
	["dupcheck_timeout_fixed", null, "no", 20, 30],  // DF:31 - Timeout is
	// fixed, ie. not
	// cumulative.
	["dupcheck_reference", "recipient", "no", 20, 31],  // DF:32 - Use full
	// recipient as
	// reference instead of
	// alias name.
	["keep_connected", null, "0", 21, -1],  // KC - Keep connected
	["warn_time", null, "0", 22, -1],  // WT - Warn time [secs]
];

var HC_COMMENT = "";
fs.readFile(
	path.join(AFD_WEBUI_DIR, "templates", "host_config.txt"),
	{ encoding: "latin1" },
	(err, data) => {
		if (!err) {
			HC_COMMENT = data;
		}
	}
);

const PROTO_SCHEME = {
	FTP: ".scheme-remote.scheme-ftp",
	SFTP: ".scheme-remote.scheme-sftp",
	SCP: ".scheme-remote.scheme-sftp",
	HTTP: ".scheme-remote",
	SMTP: ".scheme-remote",
	FILE: ".scheme-local",
	LOC: ".scheme-local",
	WMO: ".scheme-remote",
	EXEC: ".scheme-local",
	null: ""
};


function int_or_str(s) {
	const parsed = parseInt(s);
	if (isNaN(parsed)) {
		return s;
	}
	return parsed;
}

/**
 * Create a map host->[protocol, ...]
 */
function collect_protocols() {
	const proto_list = {};
	const re_head = /===> (\S+) .\d+. <===/;
	const fsa = exec_cmd_sync("fsa_view");
	let hlm = null;
	let a = null;
	for (const line of fsa.split("\n")) {
		if ((hlm = re_head.exec(line)) !== null) {
			proto_list[hlm[1]] = [];
			a = hlm[1];
		}
		else if (line.startsWith("Protocol")) {
			const pl = line.split(":")[1].trim().split(" ").map(x => x.trim());
			proto_list[a] = pl;
		}
	}
	return proto_list;
}

/**
 * Read HOST_CONFIG data.
 * 
 * alias===null : an object representing the whole HOST_CONFIG is returned.
 *
 * alias==="" (empty string) : only the data for the first host is returned.
 *
 * alias===(non-empty string) : Host_config data for the named host is returned.
 */
function read_hostconfig(alias = null) {
	const hc_order = [];
	const hc_data = {};
	//	let alias;
	//	if (aliasList === null) {
	//		alias = null;
	//	}
	//	else if (aliasList.length == 0) {
	//		alias = "";
	//	}
	//	else {
	//		alias = aliasList[0];
	//	}
	const proto_map = collect_protocols();

	function get_proto_classes(host) {
		if (host in proto_map) {
			return proto_map[host].map(v => PROTO_SCHEME[v]).join(" ");
		}
		else {
			return "";
		}
	}

	const hc_content = fs.readFileSync(
		path.join(AFD_WORK_DIR, "etc", "HOST_CONFIG"),
		{ encoding: "latin1" }
	);
	for (let line of hc_content.split("\n")) {
		if (/^\s*(?:$|#)/.test(line)) {
			continue;
		}
		line = line.trim();
		let line_data = line.split(":");
		hc_order.push(line_data[HC_FIELD_NAME]);
		if (alias === null
			|| (alias === "" && Object.keys(hc_data).length < 1)
			|| line_data[HC_FIELD_NAME] == alias) {
			hc_data[line_data[HC_FIELD_NAME]] = {};
			hc_data[line_data[HC_FIELD_NAME]]["protocol-class"] = get_proto_classes(line_data[HC_FIELD_NAME]);
			for (const hc_field of HC_FIELDS) {
				let value;
				if (hc_field[HC_FIELD_BIT] >= 0) {
					if (parseInt(line_data[hc_field[HC_FIELD_COLUMN]]) & (1 << hc_field[HC_FIELD_BIT])) {
						value = hc_field[HC_FIELD_RADIO] || "yes";
					}
					else {
						value = "no";
					}
				}
				else if (hc_field[HC_FIELD_BIT] == -2) {
					if (line_data[hc_field[HC_FIELD_COLUMN]] !== undefined && line_data[hc_field[HC_FIELD_COLUMN]] !== "") {
						hc_data[line_data[HC_FIELD_NAME]]["host_switch_enable"] = "yes";
						hc_data[line_data[HC_FIELD_NAME]]["host_switch_auto"] = line_data[hc_field[HC_FIELD_COLUMN]][0] == "{" ? "yes" : "no";
						hc_data[line_data[HC_FIELD_NAME]]["host_switch_char1"] = line_data[hc_field[HC_FIELD_COLUMN]][1];
						hc_data[line_data[HC_FIELD_NAME]]["host_switch_char2"] = line_data[hc_field[HC_FIELD_COLUMN]][2];
					}
					else {
						hc_data[line_data[HC_FIELD_NAME]]["host_switch_enable"] = "no";
						hc_data[line_data[HC_FIELD_NAME]]["host_switch_auto"] = "no";
						hc_data[line_data[HC_FIELD_NAME]]["host_switch_char1"] = "";
						hc_data[line_data[HC_FIELD_NAME]]["host_switch_char2"] = "";
					}
				}
				else {
					value = line_data[hc_field[HC_FIELD_COLUMN]];
				}
				if (!(hc_field[HC_FIELD_NAME] in hc_data[line_data[HC_FIELD_NAME]])
					|| ["no", hc_field[HC_FIELD_DEFAULT]].indexOf(
						hc_data[line_data[HC_FIELD_NAME]][hc_field[HC_FIELD_NAME]]
					) >= 0
				) {
					hc_data[line_data[HC_FIELD_NAME]][hc_field[HC_FIELD_NAME]] = int_or_str(value);
				}
			}
		}
	}
	return { class: "afd", action: "hc", alias: [alias], order: hc_order, data: hc_data };
}


function save_hostconfig(form_json) {
	const buffer = new ArrayBuffer(4);
	const abview = new DataView(buffer);
	/* Read current content of HOST_CONFIG */
	const hc = read_hostconfig(null);
	/* Replace the host order */
	hc.order = form_json.order;
	if ("data" in form_json) {
		/* Update values for all submitted host with those from the request.json */
		for (const alias in form_json.data) {
			const alias_data = form_json.data[alias];
			hc.data[alias] = {};
			for (const t of HC_FIELDS) {
				hc.data[alias][t[HC_FIELD_NAME]] = t[HC_FIELD_RADIO] || t[HC_FIELD_DEFAULT];
			}
			Object.assign(hc.data[alias], alias_data);
			/*
             * TODO: improve setting default-values without overriding
             * host-status.
             */
		}
	}
	/* Write a new HOST_CONFIG to a temporary file. */
	let hc_text = HC_COMMENT;
	for (const alias of hc.order) {
		const line_data = new Array(23).fill(null);
		const hc_toggle = {};
		for (const tuplevalue of HC_FIELDS) {
			const tuplevalue_field = tuplevalue[0];
			const tuplevalue_radio = tuplevalue[1];
			const tuplevalue_default = tuplevalue[2];
			const tuplevalue_column = tuplevalue[3];
			const tuplevalue_bit = tuplevalue[4];
			if (tuplevalue_bit >= 0) {
				let column_value = int_or_str(line_data[tuplevalue_column])
				if (column_value === null) {
					column_value = 0;
				}
				let f = (tuplevalue_field in hc.data[alias]) ? hc.data[alias][tuplevalue_field] : "no";
				if (f == "yes" || f == tuplevalue_radio) {
					column_value = column_value | (1 << tuplevalue_bit);
				}
				else {
					column_value = column_value & ~(1 << tuplevalue_bit);
				}
				abview.setUint32(0, column_value);
				line_data[tuplevalue_column] = "" + abview.getUint32(0);
			}
			else if (tuplevalue_bit === -1) {
				if (tuplevalue_field in hc.data[alias]) {
					line_data[tuplevalue_column] = hc.data[alias][tuplevalue_field];
				}
				else {
					line_data[tuplevalue_column] = tuplevalue_default;
				}
			}
			else if (tuplevalue_bit === -2) {
				hc_toggle[tuplevalue_field] = hc.data[alias][tuplevalue_field];
			}
		}
		if (hc_toggle["host_switch_enable"] === "yes") {
			if (hc_toggle["host_switch_auto"] === "yes") {
				line_data[3] = `{${hc_toggle.host_switch_char1}${hc_toggle.host_switch_char2}}`;
			}
			else {
				line_data[3] = `[${hc_toggle.host_switch_char1}${hc_toggle.host_switch_char2}]`;
			}
		}
		else {
			line_data[3] = "";
		}
		hc_text += line_data.join(":");
		hc_text += "\n";
	}
	const tmp_fn_hc = path.join(AFD_WORK_DIR, "etc", ".HOST_CONFIG");
	fs.writeFile(tmp_fn_hc,
		hc_text,
		{ encoding: "latin1" },
		(err) => {
			if (err) {
				logger.warn(err);
			}
			else {
				fs.rename(
					tmp_fn_hc,
					path.join(AFD_WORK_DIR, "etc", "HOST_CONFIG"),
					() => { logger.info("host_config updated."); }
				);
			}
		}
	);

}


/*******************************************************************************
 * Functions for retrieving log-data.
 ******************************************************************************/

/**
 */
function log_from_file(message, ws) {
	let file_number = message.filter.file == "all" ? "*" : message.filter.file;
	// TODO: statt exec: datei selbst filtern und ausgabe als tr/td aufbereiten.
	exec_cmd("grep", false, [
		"-shP",
		"<(" + message.filter.level + ")>",
		path.join(AFD_WORK_DIR, "log", AFDLOG_FILES[message.context] + file_number)
	],
		(error, stdout, stderr) => {
			if (error) {
				logger.warn(`${error}, ${stderr}`);
			}
			else {
				const data = {
					class: "log",
					context: message.context,
					action: "list",
					append: false,
					text: stdout, // lines: stdout.split("\n"),
				};
				ws.send(JSON.stringify(data));
			}
		}
	);
}

function log_from_alda(message, ws) {
	let alda_output_format = {
		input: ["-o", "<tr jid='%Uj,' fnl='%IF' uu='%IU' sz='%ISB' dti='%ITy/%ITm/%ITd %ITH:%ITM:%ITS'>"
			+ "<td class='clst-dd'>%ITm.%ITd.</td>"
			+ "<td class='clst-hh'>%ITH:%ITM:%ITS</td><td>%IF</td>"
			+ "<td class='clst-fs'>%ISB</td></tr>"],
		output: ["-o", "<tr jid='%OJ' fnl='%Of' fnr='%OF' uu='%OU' sz='%OSB' trt='%ODA'"
			+ " dto='%OTy/%OTm/%OTd %OTH:%OTM:%OTS' arc='|%OA/%xOZu_%xOU_%xOL_%Of|'>"
			+ "<td class='clst-dd'>%OTm.%OTd.</td><td class='clst-hh'>"
			+ "%OTH:%OTM:%OTS</td><td>%Of</td><td class='clst-hn'>%OH</td>"
			+ "<td class='clst-tr'>%OP</td><td class='clst-fs'>%OSB</td>"
			+ "<td class='clst-tt'>%ODA</td><td class='clst-aa'>|N|</td>"
			+ "</tr>"],
		delete: ["-o", "<tr jid='%DJ' fnl='%DF' uu='%DU' dtd='%DTy/%DTm/%DTd %DTH:%DTM:%DTS'>"
			+ "<td class='clst-dd'>%DTm.%DTd.</td>"
			+ "<td class='clst-hh'>%DTH:%DTM:%DTS</td><td>%DF</td>"
			+ "<td class='clst-fs'>%DSB</td><td class='clst-hn'>%DH</td>"
			+ "<td class='clst-rn'>%DR</td><td class='clst-pu'>%DW</td>"
			+ "</tr>"]
	};
	let par_tr = {
		start: "-t",
		end: "-T",
		directory: "-d",
		recipient: "-h",
		filesize: "-S",
		job_id: "-j",
		protocol: "-p",
		"trans-time": "-D",
		"delete-reason": null,
	};
	let par_lst = [];
	let fnam = null;
	let logtype;
	if (message.filter["received-only"]) {
		logtype = "R";
	}
	else {
		logtype = message.context[0].toUpperCase();
	}
	if (logtype === "I") {
		logtype += "U";
	}
	let archived_only;
	if (message.filter["archived-only"]) {
		archived_only = true;
	}
	else {
		archived_only = false;
	}
	let alda_output_line;
	if (message.context in alda_output_format) {
		alda_output_line = alda_output_format[message.context];
	}
	else {
		alda_output_line = [];
	}
	for (const key in message.filter) {
		let val = message.filter[key];
		if (key in par_tr && par_tr[key] === null) {
			continue;
		}
		else if (key == "filename") {
			fnam = val;
		}
		else if (key == "recipient") {
			let rl = val.split(",").map(v => "%" + v).join(",");
			par_lst.push(`${par_tr[key]}'${rl}'`);
		}
		else if (key == "output-filename-remote" && ["on", "yes", "true"].indexOf(val) >= 0) {
			alda_output_line[1] = alda_output_line[1].replace("%Of", "%OF");
		}
		else if (key in par_tr && val == "true") {
			par_lst.push(par_tr[key]);
		}
		else if (key in par_tr) {
			par_lst.push(par_tr[key]);
			par_lst.push(val);
		}
	}
	let cmd_par = ["-f", "-L", logtype].concat(par_lst).concat(alda_output_line);
	if (fnam) {
		cmd_par.push(fnam);
	}
	let data = {
		class: "log",
		context: message.context,
		action: "list",
		append: false,
		lines: [],
	};
	if (message.context == "output") {
		exec_cmd("alda", true, cmd_par, (error, stdout, stderr) => {
			if (error) {
				logger.warn(`${error}, ${stderr}`);
			}
			else {
				/* Parse each line, and set archive flag. */
				let new_data = [];
				for (const data_line of stdout.split("\n")) {
					if (!data_line) {
						continue;
					}
					let parts = data_line.split("|");
					if (parts[1][0] !== "/") {
						try {
							fs.accessSync(path.join(AFD_WORK_DIR, "archive", parts[1]));
							parts[parts.length - 2] = "Y";
						}
						catch (_) {
							parts[1] = "";
							parts[parts.length - 2] = "D";
						}
					}
					else {
						parts[1] = "";
						parts[parts.length - 2] = "N";
					}
					if (!archived_only || parts[parts.length - 2] == "Y") {
						new_data.push(parts.join(""));
					}
				}
				data.lines = new_data;
				console.debug("Lines from alda:" + data.lines.length);
				ws.send(JSON.stringify(data));
			}
		});
	}
	else {
		exec_cmd("alda", true, cmd_par,
			(error, stdout, stderr) => {
				if (error) {
					logger.warn(`${error}, ${stderr}`);
				}
				else {
					data.lines = stdout.split("\n");
					ws.send(JSON.stringify(data));
				}
			});
	}
}

/**
 * Log -> File Info.
 *
 * context: "input|output"
 * filter: [{file: string, jobid|sourceid: string}, ...]
 * callback: ( {file: string, jobid: string, text: string} )
 */
function view_file_info(context, filter, callback) {
	for (const felem of filter) {
		let info_set = {
			jid: felem.jid,
			fnl: felem.fnl,
			uu: felem.uu,
		};
		if ("fnr" in felem) {
			info_set.fnr = felem.fnr;
		}
		let cmd = null;
		let cmd_args = [];
		switch (context) {
			case "input":
				cmd = "jid_view";
				cmd_args = felem.jid
					.split(",")
					.map(d => {
						return parseInt(d).toString(16)
					});
				break;
			case "output":
			case "delete":
				cmd = "jid_view";
				cmd_args = [parseInt(felem.jid).toString(16)];
				break;
			default:
				return;
		}
		exec_cmd(cmd, true, cmd_args,
			(error, stdout, stderr) => {
				if (error) {
					logger.warn(error, stderr);
				}
				else {
					console.log(error, stdout, stderr);
					let text = `Local name : ${felem.fnl}\nRemote name: ${felem.fnr}\nFile size  : ${felem.sz} Bytes\n`;
					if ("dto" in felem) {
						text += `Output time: ${felem.dto}\nTrans time : ${felem.trt} sec\n`;
					}
					else if ("dti" in felem) {
						text += `Input time : ${felem.dti}\n`;
					}
					else if ("dtd" in felem) {
						text += `Delete time : ${felem.dtd}\n`;
					}
					const f = felem.fnl.replace(/\./g, "_").replace(/,/g, "_");
					info_set.text = templates["file_info.html"]({
						fileInfoBoxId: `${felem.uu}_${f}`,
						jid: felem.jid,
						filename: felem.fnl,
						info_text: text + stdout
					});
					callback(info_set);
				}
			});
	}
}

/**
 * Output-Log -> View File.
 *
 * Retrieve a file from AFD archive and apply a parser program if required.
 *
 * Send the (parsed/pretty'fied) file content to the response object.
 */
function view_content(response, arcfile, mode = "auto") {
	const arcfile_path = path.join(AFD_WORK_DIR, "archive", arcfile);
	logger.debug(`View: ${arcfile_path}`);
	let view_cmd;
	let view_args;
	let push_filename = true;
	fs.access(arcfile_path, () => {
		if (mode == "auto") {
			/* Test filename with all patterns. */
			for (const pat in VIEW_DATA.filter) {
				logger.debug(`Test with ${pat}`);
				if (RegExp(pat).test(arcfile)) {
					const i = VIEW_DATA.filter[pat].indexOf(" ");
					view_cmd = VIEW_DATA.filter[pat].substring(0, i);
					view_args = VIEW_DATA.filter[pat].substring(i + 1).split(" ");
					if (VIEW_DATA.filter[pat].indexOf("%s") != -1) {
						push_filename = false;
					}
					break;
				}
			}
		}
		else {
			/* Use program for selected mode. */
			if (mode in VIEW_DATA.named) {
				const i = VIEW_DATA.named[mode].indexOf(" ");
				view_cmd = VIEW_DATA.named[mode].substring(0, i);
				view_args = VIEW_DATA.named[mode].substring(i + 1).split(" ");
				if (VIEW_DATA.named[mode].indexOf("%s") != -1) {
					push_filename = false;
				}
			}
		}
		if (view_cmd) {
			/* With the selected/determined program we start some conversion
			 * and send the result to the response object.
			 */
			if (view_cmd.startsWith("http://") || view_cmd.startsWith("https://")) {
				/* Use HTTP/POST to send the file content to some webservice.
				 * As return we expect text/plain or text/html.
				 */
				try {
					webservice_send_file(
						view_cmd,
						view_args,
						fs.createReadStream(arcfile_path),
						(c) => { response.send(c) }
					);
				}
				catch (e) {
					logger.warn(`View with ${view_cmd}: ${e}`);
					response.sendStatus(500);
				}
			}
			else {
				if (push_filename) {
					view_args = view_args.map(v => v == "%s" ? arcfile_path : v);
				}
				else {
					view_args.push(arcfile_path);
				}
				try {
					exec_cmd(
						view_cmd, false, view_args,
						(error, stdout, stderr) => {
							if (error) {
								logger.warn(`${error}, ${stderr}`);
								response.sendStatus(404);
							}
							else {
								response.set("Content-Type", CONTENT_TYPE.PLAIN);
								response.send(stdout);
							}
						});
				}
				catch (e) {
					logger.warn(`View with ${view_cmd}: ${e}`);
					response.sendStatus(500);
				}
			}
		}
		else {
			/* If there is no program configured for pre-formatting, we send
			 * the file to the response object and leave it to the browser
			 * to display the file content properly.
			 */
			response.sendFile(arcfile_path);
		}
	});
}

/**
 * Send file to REST webservice by http/post and give the response to a callback.
 */
async function webservice_send_file(rest_url, params, dataReadStream, callback) {
	const request = require("request");
	const formData = {};
	logger.debug(`Connect webservice ${rest_url}`);
	for (const p of params) {
		const pe = p.split(":");
		if (pe[1] === "%s") {
			formData[pe[0]] = {
				value: dataReadStream,
				options: { contentType: CONTENT_TYPE.OCTET }
			};
		}
		else {
			formData[pe[0]] = pe[1];
		}
	}
	request.post(
		{
			url: rest_url,
			formData: formData
		},
		(err, _, body) => {
			if (err) {
				logger.warn(err);
				callback("Error");
			}
			else {
				callback(body);
			}
		}
	);
}

/*******************************************************************************
 * Execute command-line programs.
 ******************************************************************************/

function exec_cmd(cmd, with_awd, args, callback) {
	try {
		if (MOCK) {
			exec_cmd_mock(cmd, with_awd, args, callback);
		} else {
			exec_cmd_real(cmd, with_awd, args, callback);
		}
	}
	catch (e) {
		logger.error("exec_cmd");
		logger.error(`${cmd}, ${with_awd}, ${args}`);
		logger.error(e);
	}
}

function exec_cmd_sync(cmd, with_awd, args) {
	try {
		if (MOCK) {
			return exec_cmd_sync_mock(cmd, with_awd, args);
		} else {
			return exec_cmd_sync_real(cmd, with_awd, args);
		}
	}
	catch (e) {
		logger.error("exec_cmd_sync");
		logger.error(`${cmd}, ${with_awd}, ${args}`);
		logger.error(e);
	}
}
function exec_cmd_mock(cmd, with_awd, args = [], callback) {
	logger.debug(`Mock command: ${cmd} ${args}`);
	const mock_text = fs.readFileSync("mock/dummy." + cmd + ".txt", { encoding: "utf8" });
	callback(undefined, mock_text, undefined);
}
function exec_cmd_sync_mock(cmd, with_awd, args) {
	logger.debug(`Mock command (sync): ${cmd} ${args}`);
	const mock_text = fs.readFileSync("mock/dummy." + cmd + ".txt", { encoding: "utf8" });
	return mock_text;
}


/**
 * Execute 'cmd' with arguments.
 * 
 * Callback function is called with error, stdout, stderr as parameter.
 */
function exec_cmd_real(cmd, with_awd, args = [], callback) {
	let largs = with_awd ? ["-w", AFD_WORK_DIR].concat(args) : args;
	logger.debug(`exec_cmd prepare command: ${cmd} ${largs}`);
	execFile(cmd,
		largs,
		{ encoding: "latin1" },
		(error, stdout, stderr) => {
			logger.debug(`RAW: ${error} ${stdout} ${stderr}`);
			if (callback) {
				logger.debug(`cmd: ${cmd} -> len=${stdout.length}`);
				callback(error, stdout, stderr);
			}
			else if (error) {
				logger.error(`${error}, ${stderr}`);
			}
		}
	);
}

/**
 * Execute 'cmd' synchronous with arguments, stdout is returned.
 */
function exec_cmd_sync_real(cmd, with_awd, args = []) {
	let largs = with_awd ? ["-w", AFD_WORK_DIR].concat(args) : args;
	logger.debug(`exec_cmd_sync prepare command (sync): ${cmd} ${largs}`);
	const stdout = execFileSync(cmd,
		largs,
		{ encoding: "latin1" }
	);
	return stdout;
}

/*******************************************************************************
 * At last we start the server listener.
 */
(function start_listener() {
	logger.info(`Bind server to port ${argv.port}, start listening ...`);
	server.listen(argv.port);
})();

logger.info("AFD web-UI started.");

/* ***** END **************************************************************** */
