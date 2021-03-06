"use 'esversion: 6'";
"use strict";
/* jslint node: true */

/** 
 * @file AFD WebUI Server - Part of AFD, an automatic file distribution program.
 * @projectname afd-webui
 * @version 0.1
 * @copyright (c) 2020 Alexander Maul
 * @author Alexander Maul <alexander.maul@dwd.de>
 * @license GPL-2.0-or-later -- 
 *  This program is free software; you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation; either version 2 of the License, or
 *  (at your option) any later version.
 * 
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 * 
 *  You should have received a copy of the GNU General Public License
 *  along with this program; if not, write to the Free Software
 *  Foundation, Inc., 675 Mass Ave, Cambridge, MA 02139, USA.
 */

/*

/ + /ui	: http/https -> index.html.
/view	: http/https, view file from archive.
/ctrl	: ws/wss, afd_ctrl.
/log	: ws/wss, show_log page.

All ctrl:
{ user:	"", class: "", action:"", command: "", alias: [""], text: "", data: {} }

Log request:
{ class: "log", context: "system|event|transfer|transfer-debug|input|output|delete",
action: "list|info", filter: { file: int, level: "", paramSet: {K:V} }

Log response:
{ class: "log", context: "system|event|transfer|transfer-debug|input|output|delete",
action: "list|info", append: bool, lines: [ "" ], data: {} }

*/

const process = require("process");
const yargs = require("yargs");
const fs = require("fs");
const glob = require("glob");
const path = require("path");
const WebSocket = require("ws");
const url = require('url');
const winston = require('winston');
const express = require('express');
const session = require('express-session');
const basicAuth = require('express-basic-auth');
const ejs = require('ejs');
const { execFile, execFileSync } = require("child_process");
const { spawn } = require("child_process");

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
const WEBUI_DIR = __dirname; // path.dirname(process.argv[1]);
const AFD_WORK_DIR = argv.afd_work_dir;
const WEBUI_PID = "webui.pid";
const WEBUI_LOG = "webui.log";
const WEBUI_USERS = "webui.users";

/* ****************************************************************************
 * Setup logging.
 */
const logger = (function setup_logging() {
	var logLevel = "info";
	var logTransport = [new winston.transports.File({
		filename: path.join(AFD_WORK_DIR, "log", WEBUI_LOG)
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
		pid_file_name = path.join(AFD_WORK_DIR, "fifodir", WEBUI_PID);
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
	payload_too_large: 413,
	not_satisfyable: 416,
	error: 500,
};

/* Holds interval object sending fsa-status to all ws-connections. */
var fsaLoopInterval = null;
/** Interval time [ms] for FSA update. [2000ms] */
const FSA_LOOP_INTERVAL_TIME = 2000;

/** Heartbeat interval time and timeout. [10000ms] */
const HEARTBEAT_INTERVAL_TIME = 10000;

/*
 * Some details from AFD_CONFIG file we use in WebUI server.
 *
 * If a key can occur more than one time in AFD_CONFIG, the values are
 * stored as a list of strings instead of as a string.
 */
const AFD_CONFIG = {};

/* Holds the commands with filter/pattern for Output-Log/View. */
const VIEW_DATA = { named: {}, filter: {} };

/* */
const COLLECTED_PROTOCOLS = {};

/*
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
				path.join(AFD_WORK_DIR, "etc", WEBUI_USERS),
				{ encoding: "latin1" }
			)),
		challenge: true,
		realm: "AFD"
	}));
	app.use("/ui", express.static(path.join(WEBUI_DIR, "public")));
	app.use("/$", express.static(path.join(WEBUI_DIR, "public")));
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
	fs.readdir(path.join(WEBUI_DIR, "templates"), (err, template_files) => {
		if (!err) {
			for (const fn of template_files) {
				if (fn.endsWith(".html")) {
					fs.readFile(path.join(WEBUI_DIR, "templates", fn),
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
		http_options["cert"] = fs.readFileSync(path.join(WEBUI_DIR, "certs", "public-cert.pem"));
		http_options["key"] = fs.readFileSync(path.join(WEBUI_DIR, "certs", "private-key.pem"));
	}
})();
/*
 * Create server objects.
 */
const server = http_module.createServer(http_options, app);
const wss_ctrl = new WebSocket.Server({ noServer: true, clientTracking: true });
const wss_log = new WebSocket.Server({ noServer: true, clientTracking: true });

/*
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

/*
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

/*
 *
 */
function fsaLoopStop() {
	logger.debug("fsa loop stop");
	if (wss_ctrl.clients.size == 0) {
		clearInterval(fsaLoopInterval);
		fsaLoopInterval = null;
	}
}

/*
 * Create Interval sending status to clients.
 */
function fsaLoopStart() {
	logger.debug("start fsa loop.");
	if (fsaLoopInterval === null) {
		fsaLoopInterval = setInterval(() => {
			exec_cmd("fsa_view",
				[],
				{ with_awd: true, appendable: false },
				(exitcode, stdout, stderr) => {
					if (exitcode === 0 && stdout !== null) {
						const fsa = parse_fsa(stdout);
						for (const ws_instance of wss_ctrl.clients) {
							ws_instance.send(JSON.stringify(fsa));
						}
					}
					else if (exitcode) {
						logger.error(stderr);
						throw Error("Without fsa_view there's no point!");
					}
				});
		}, FSA_LOOP_INTERVAL_TIME);
	}
}

/*
 * Parses FSA from text-output of fsa_view.
 *
 * The created JSON object holds all status info for afd_ctrl window.
 */
function parse_fsa(text) {
	const fsa = {
		"class": "fsa",
		"data": []
	};
	const re_head = /===> (\S+) .(\d+). <===/;
	let field_values = null;
	text.split("\n").forEach((line) => {
		if (!line.length || line[0] === " ") {
			return;
		}
		if (line[0] === "-") {
			return;
		}
		if (line[0] === "=") {
			if (field_values !== null) {
				fsa.data.push(field_values);
			}
			field_values = { host_status: [], jobs: [] };
			const hlm = re_head.exec(line);
			field_values.alias = hlm[1];  // hostname
			field_values.ord = parseInt(hlm[2]);
		}
		if (line.indexOf("|") != -1) {
			let le = line.split("|").map(x => x.trim());
			switch (le[0]) {
				case "Connect status":
					le.slice(1).forEach((je, ji) => {
						field_values.jobs[ji].connect_status = je;
					});
					break;
				case "Number of files":
					le.slice(1).forEach((je, ji) => {
						field_values.jobs[ji].number_of_files = parseInt(je);
					});
					break;
			}
		}
		else {
			let le = line.split(":").map(x => x.trim());
			if (le.length < 2) {
				return;
			}
			switch (le[0]) {
				case "Real hostname 1":
					field_values.real1 = le[1];
					break;
				case "Real hostname 2":
					field_values.real2 = le[1];
					break;
				case "Hostname (display)":
					field_values.display = le[1].slice(1, -1);
					break;
				case "Direction":
					field_values.direction = "";
					if (le[1].indexOf("RETRIEVE") != -1) {
						field_values.direction += "R";
					}
					if (le[1].indexOf("SEND") != -1) {
						field_values.direction += "S";
					}
					break;
				case "Debug mode":
					if (le[1] == "OFF") {
						field_values.debug_mode = null;
					}
					else {
						field_values.debug_mode = le[1];
					}
					break;
				case "Error counter":
					field_values.error_count = parseInt(le[1]);
					break;
				case "Total file counter":
					field_values.file_count = parseInt(le[1]);
					break;
				case "Total file size":
					field_values.file_size = parseInt(le[1]);
					break;
				case "Active transfers":
					field_values.transfers = parseInt(le[1]);
					break;
				case "Allowed transfers":
					let at = parseInt(le[1]);
					for (let i = 0; i < at; i++) {
						field_values.jobs.push({ "job_num": i });
					}
					break;
			}
			if (le[0].startsWith("Protocol")) {
				field_values.protocol = le[1].split(" ").map(x => x.trim());
				COLLECTED_PROTOCOLS[field_values.hostname] = field_values.protocol;
			}
			else if (le[0].startsWith("Host status")
				|| le[0].startsWith("Special flag")) {
				field_values.host_status = field_values.host_status.concat(le[1].split(" "));
			}
		}
	});
	if (field_values !== null) {
		fsa.data.push(field_values);
	}
	return fsa;
}

/*
 * Dispatch to AFD controlling functions.
 *
 * @param {Object} message - received JSON message.
 * @param {Websocket.Server} ws - connection Object.
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
			switch (message.command) {
				case "update":
					cmd = "udc";
					cmd_opt = "";
					break;
				case "list":
					list_editable_files(ws, message);
					break;
				case "read":
					read_editable_file(ws, message);
					break;
				case "save":
					save_editable_file(ws, message);
					break;
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
		exec_cmd(cmd, cmd_opt, { with_awd: true, appendable: true }, () => { });
	}
}

/*
 * Dispatch to alias/host related functions.
 *
 * @param {Object} message - received JSON message.
 * @param {Websocket.Server} ws - connection Object.
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
				logger.debug(`call get_dc_data for alias ${message.alias}`);
				exec_cmd("get_dc_data",
					["-h", alias],
					{ with_awd: true, appendable: false },
					(exitcode, stdout, stderr) => {
						logger.debug(`EXEC-> ${exitcode}, ${stdout}, ${stderr}`);
						if (exitcode === 0) {
							const msg = {
								class: "alias",
								action: "config",
								alias: alias,
								text: stdout
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
					"afdcmd",
					AFDCMD_ARGS[message.action].concat(message.alias),
					{ with_awd: true, appendable: true },
					(exitcode, stdout, stderr) => {
						if (exitcode) {
							message["status"] = STATUS.error;
							ws.send(JSON.stringify(message));
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

/* *****************************************************************************
 * Alias/host related functions.
 * ************************************************************************** */

/*
 * Collect information for one host. Details are inserted in rendered html
 * template, which is send via callback.
 * 
 * @param {string} host - Hostname/alias.
 * @param {returnHostInfoTemplate} callback.
 *
 * @callback returnHostInfoTemplate
 * @param {string} alias - Hostname/alias.
 * @param {string} html - MIME:text/html.
 */
function collect_host_info(host, callback) {
	let field_values = {
		HOST_ONE: "",
		HOST_TWO: "",
		info_text: "No information available."
	};
	exec_cmd("fsa_view", [host], { with_awd: true, appendable: true }, (exitcode, raw, _) => {
		if (exitcode === null) {
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
		}
		else if (exitcode === 0) {
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
		}
	});
}

function search_host(action, form_json) {
	let host_list = [];

	function test_protocol(host) {
		let ok = false;
		const pl = COLLECTED_PROTOCOLS[host];
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

	// AH - Alias hostname
	["alias", null, "", 0, -1],
	// HN1 - Real hostname 1
	["host_name_real1", null, "", 1, -1],
	// HN2 - Real hostname 2
	["host_name_real2", null, "", 2, -1],
	// HT - Host toggle enable
	["host_switch_enable", null, "no", 3, -2],
	// HT - Host toggle character 1
	["host_switch_char1", null, "", 3, -2],
	// HT - Host toggle character 2
	["host_switch_char2", null, "", 3, -2],
	// HT - Automatic host switching: yes={}, no=[]
	["host_switch_auto", null, "no", 3, -2],
	// PXY - Proxy name
	["proxy_name", null, "", 4, -1],
	// AT - Allowed transfers
	["max_parallel_transfer", null, "3", 5, -1],
	// ME - Max. errors
	["max_errors", null, "10", 6, -1],
	// RI - Retry interval
	["retry_interval", null, "120", 7, -1],
	// TB - Transfer block size
	["transfer_block_size", null, "4 KB", 8, -1],
	// SR - Successful retries
	["successful_retries", null, "0", 9, -1],
	// FSO - File size offset
	["filesize_offset_for_append", null, "null", 10, -1],
	// TT - Transfer timeout
	["transfer_timeout", null, "60", 11, -1],
	// NB - Number of no bursts
	["no_burst", null, "0", 12, -1],
	// HS - Mostly irrelevant for HC-edit page!
	["host_status", null, "0", 13, -1],
	// HS:5 - Error status offline
	["ignore_error_warning", null, "no", 13, 4],
	// HS:16 - Do not delete files due age-limit and 'delete queued files'
	["do_not_delete", null, "no", 13, 15],
	// SF:1 - FTP passive mode
	["ftp_mode_passive", null, "no", 14, 0],
	// SF:2 - Set FTP idle time to transfer timeout
	["ftp_idle_time", null, "no", 14, 1],
	// SF:3 - Send STAT command to keep control connection alive.
	["ftp_keep_alive", null, "no", 14, 2],
	// SF:4 - Combine RNFR and RNTO to one command.
	["ftp_fast_rename", null, "no", 14, 3],
	// SF:5 - Do not do a cd, always use absolute path.
	["ftp_fast_cd", null, "no", 14, 4],
	// SF:6 - Do not send TYPE I command.
	["ftp_no_type_i", null, "no", 14, 5],
	// SF:7 - Use extended active or extended passive mode.
	["ftp_mode_epsv", null, "no", 14, 6],
	// SF:8 - If set bursting is disabled.
	["disable_burst", null, "no", 14, 7],
	// SF:9 - If set FTP passive mode allows to be redirected to another address.
	["ftp_allow_redirect", null, "no", 14, 8],
	// SF:10 - When set it will replace the given scheme with file if the 
	// hostname matches local hostname or one in local_interface.list.
	["use_local_scheme", null, "no", 14, 9],
	// SF:11 - Set TCP keepalive.
	["tcp_keep_alive", null, "no", 14, 10],
	// SF:12 - Set sequence locking.
	["sequence_locking", null, "no", 14, 11],
	// SF:13 - Enable compression.
	["enable_compress", null, "no", 14, 12],
	// SF:14 - Keep time stamp of source file.
	["keep_timestamp", null, "no", 14, 13],
	// SF:15 - Sort file names.
	["sort_names", null, "no", 14, 14],
	// SF:16 - No ageing jobs.
	["no_ageing_jobs", null, "no", 14, 15],
	// SF:17 - Check if local and remote size match.
	["check_local_remote_match_size", null, "no", 14, 16],
	// SF:18 - Timeout transfer.
	["is_timeout_transfer", null, "no", 14, 17],
	// SF:19 - Keep connected no fetching.
	["keep_connected_direction", "send", "no", 14, 18],
	// SF:20 - Keep connected no sending.
	["keep_connected_direction", "fetch", "no", 14, 19],
	// SF:21 - FTPS Clear Control Connection.
	["ftps_clear_ctrlcon", null, "no", 14, 20],
	// SF:22 - Use FTP LIST for directory listing.
	["ftp_use_list", null, "no", 14, 21],
	// SF:23 - TLS uses strict verification of host.
	["tls_strict_verification", null, "no", 14, 22],
	// SF:24 - Disables FTP MLST for directory listing.
	["ftp_disable_mlst", null, "no", 14, 23],
	// SF:25 - Disconnect after given keep  connected time.
	["keep_connected_disconnect", null, "no", 14, 24],
	// TRL - Transfer rate limit
	["transfer_rate_limit", null, "0", 15, -1],
	// TTL - TCP time-to-live
	["time_to_live", null, "0", 16, -1],
	// SSB - Socket send buffer
	["socket_send_buffer", null, "0", 17, -1],
	// SRB - Socket receive uffer
	["socket_receive_buffer", null, "0", 18, -1],
	// DT - Duplicate check timeout
	["dupcheck_timeout", null, "0", 19, -1],
	// DF:1 - Only do CRC checksum for filename.
	["dupcheck_type", "name", "no", 20, 0],
	// DF:2 - Only do CRC checksum for file content.
	["dupcheck_type", "content", "no", 20, 1],
	// DF:3 - Checksum for ilename and content.
	["dupcheck_type", "name-content", "no", 20, 2],
	// DF:4 - Checksum of lename without last ffix.
	["dupcheck_type", "name-no-suffix", "no", 20, 3],
	// DF:5 - Checksum of filename and size.
	["dupcheck_type", "name-size", "no", 20, 4],
	// DF:16 - Do a CRC32 checksum.
	["dupcheck_crc", "crc32", "no", 20, 15],
	// DF:17 - Do a CRC32C checksum.
	["dupcheck_crc", "crc32c", "no", 20, 16],
	// DF:24 - Delete the file.
	["dupcheck_delete", null, "yes", 20, 23],
	// DF:25 - Store the duplicate file.
	["dupcheck_store", null, "no", 20, 24],
	// DF:26 - Warn in SYSTEM_LOG.
	["dupcheck_warn", null, "no", 20, 25],
	// DF:31 - Timeout is fixed, ie. not cumulative.
	["dupcheck_timeout_fixed", null, "no", 20, 30],
	// DF:32 - Use full recipient as reference instead of alias name.
	["dupcheck_reference", "recipient", "no", 20, 31],
	// KC - Keep connected
	["keep_connected", null, "0", 21, -1],
	// WT - Warn time [secs]
	["warn_time", null, "0", 22, -1],
];

var HC_COMMENT = "";
fs.readFile(
	path.join(WEBUI_DIR, "templates", "host_config.txt"),
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

/*
 * Read HOST_CONFIG data.
 * 
 * alias===null : an object representing the whole HOST_CONFIG is returned.
 *
 * alias==="" (empty string) : only the data for the first host is returned.
 *
 * alias===(non-empty string) : Host_config data for the named host is returned.
 */
function read_hostconfig(alias = null) {
	// TODO change to async.
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

	function get_proto_classes(host) {
		if (host in COLLECTED_PROTOCOLS) {
			return COLLECTED_PROTOCOLS[host].map(v => PROTO_SCHEME[v]).join(" ");
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

/*
 * Save HOST_CONFIG.
 */
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

/* 
 * 
 */
function list_editable_files(ws, message) {
	const data = {
		class: "afd",
		action: "dc",
		context: message.context,
		command: "list",
		filename: [],
	};
	let fcol = ["group.list"];
	if ("RENAME_RULE_NAME" in AFD_CONFIG) {
		fcol = fcol.concat(AFD_CONFIG.RENAME_RULE_NAME);
	}
	else {
		fcol.push("rename.rule");
	}
	fcol = fcol.concat(AFD_CONFIG.DIR_CONFIG_NAME);
	glob("{" + fcol.join(",") + "}",
		{ cwd: path.join(AFD_WORK_DIR, "etc") },
		(err, files) => {
			if (err) {
				logger.warn(err);
			}
			data.filename = files;
			ws.send(JSON.stringify(data));
		}
	);
}

/*
 *
 */
function read_editable_file(ws, message) {
	const data = {
		class: "afd",
		action: "dc",
		command: "read",
		context: message.context,
		filename: message.filename,
	};
	fs.readFile(
		path.join(AFD_WORK_DIR, "etc", message.filename),
		{ encoding: "latin1" },
		(err, content) => {
			data.text = content;
			ws.send(JSON.stringify(data));
		}
	);
}

/*
 *
 */
function save_editable_file(ws, message) {
	try {
		const fn = path.join(AFD_WORK_DIR, "etc", message.filename);
		fs.writeFile(fn, message.text, { encoding: "utf-8" }, () => { });
	}
	catch (e) {
		logger.error(e);
		ws.send(JSON.stringify({
			class: message.class,
			command: message.command,
			action: message.action,
			context: message.context,
			errno: STATUS.error,
			error: `${e.name}: ${e.message}`
		}));
	}
}

/*******************************************************************************
 * Functions for retrieving log-data.
 ******************************************************************************/

/*
 */
function log_from_file(message, ws) {
	let file_number = message.filter.file == "all" ? "*" : message.filter.file;
	// TODO: statt exec: datei selbst filtern und ausgabe als tr/td aufbereiten.
	const data = {
		class: "log",
		context: message.context,
		action: "list",
		append: false,
		text: ""
	};
	exec_cmd("grep", [
		"-shP",
		"'<(" + message.filter.level + ")>'",
		path.join(AFD_WORK_DIR, "log", AFDLOG_FILES[message.context] + file_number)
	],
		{ with_awd: false, appendable: true, total_size_limit: 5 },
		(exitcode, stdout, _) => {
			if (!exitcode) {
				data.text = stdout;
				ws.send(JSON.stringify(data));
			}
			data.append = true;
		}
	);
}

function log_from_alda(message, ws) {
	let alda_output_format = {
		input: ["-o", "\"<tr jid='%Uj,' fnl='%IF' uu='%IU' sz='%ISB' dti='%ITy/%ITm/%ITd %ITH:%ITM:%ITS'>"
			+ "<td class='clst-dd'>%ITm.%ITd.</td>"
			+ "<td class='clst-hh'>%ITH:%ITM:%ITS</td><td>%IF</td>"
			+ "<td class='clst-fs'>%ISB</td></tr>\""],
		output: ["-o", "\"<tr jid='%OJ' fnl='%Of' fnr='%OF' uu='%OU' sz='%OSB' trt='%ODA'"
			+ " dto='%OTy/%OTm/%OTd %OTH:%OTM:%OTS' arc='|%OA/%xOZu_%xOU_%xOL_%Of|'>"
			+ "<td class='clst-dd'>%OTm.%OTd.</td><td class='clst-hh'>"
			+ "%OTH:%OTM:%OTS</td><td>%Of</td><td class='clst-hn'>%OH</td>"
			+ "<td class='clst-tr'>%OP</td><td class='clst-fs'>%OSB</td>"
			+ "<td class='clst-tt'>%ODA</td><td class='clst-aa'>|N|</td>"
			+ "</tr>\""],
		delete: ["-o", "\"<tr jid='%DJ' fnl='%DF' uu='%DU' dtd='%DTy/%DTm/%DTd %DTH:%DTM:%DTS'>"
			+ "<td class='clst-dd'>%DTm.%DTd.</td>"
			+ "<td class='clst-hh'>%DTH:%DTM:%DTS</td><td>%DF</td>"
			+ "<td class='clst-fs'>%DSB</td><td class='clst-hn'>%DH</td>"
			+ "<td class='clst-rn'>%DR</td><td class='clst-pu'>%DW</td>"
			+ "</tr>\""]
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
			par_lst.push(par_tr[key], rl);
		}
		else if (key == "output-filename-remote" && ["on", "yes", "true"].indexOf(val) >= 0) {
			alda_output_line[1] = alda_output_line[1].replace("%Of", "%OF");
		}
		else if (key in par_tr && val == "true") {
			par_lst.push(par_tr[key]);
		}
		else if (key in par_tr) {
			par_lst.push(par_tr[key], val);
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
		exec_cmd(
			"alda",
			cmd_par,
			{ with_awd: true, appendable: true, total_size_limit: 3 },
			(exitcode, stdout, stderr) => {
				if (stdout !== null) {
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
				}
				else {
					data.lines = [];
				}
				if (exitcode === 0) {
					data.errno = exitcode;
				}
				else if (exitcode !== null) {
					data.errno = exitcode;
					data.error = stderr;
				}
				else {
					data.errno = null;
				}
				ws.send(JSON.stringify(data));
				data.append = true;
			});
	}
	else {
		exec_cmd(
			"alda",
			cmd_par,
			{ with_awd: true, appendable: true, total_size_limit: 3 },
			(exitcode, stdout, stderr) => {
				if (stdout !== null) {
					data.lines = stdout.split("\n");
				}
				else {
					data.lines = [];
				}
				if (exitcode === 0) {
					data.errno = exitcode;
				}
				else if (exitcode !== null) {
					data.errno = exitcode;
					data.error = stderr;
				}
				else {
					data.errno = null;
				}
				ws.send(JSON.stringify(data));
				data.append = true;
			});
	}
}

/*
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
					.map(d => parseInt(d).toString(16));
				break;
			case "output":
			case "delete":
				cmd = "jid_view";
				cmd_args = [parseInt(felem.jid).toString(16)];
				break;
			default:
				return;
		}
		exec_cmd(cmd, cmd_args, { with_awd: true, appendable: false },
			(exitcode, stdout, stderr) => {
				if (!exitcode) {
					console.log(exitcode, stdout, stderr);
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

/*
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
						view_cmd, view_args, { with_awd: false, appendable: false },
						(exitcode, stdout, _) => {
							if (exitcode) {
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

/*
 * Send file to REST webservice by http/post and give the response to a callback.

	TODO: als Platzhalter für Dateiinhalt %S statt %s ?  

 */
function webservice_send_file(rest_url, params, dataReadStream, callback) {
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

function exec_cmd(cmd, args = [], opts = {}, callback) {
	try {
		if (MOCK) {
			exec_cmd_mock(cmd, args, opts, callback);
		} else {
			exec_cmd_real(cmd, args, opts, callback);
		}
	}
	catch (e) {
		logger.error("exec_cmd");
		logger.error(`${cmd}, ${opts}, ${args}`);
		logger.error(e);
	}
}

function exec_cmd_mock(cmd, args = [], opts = {}, callback) {
	logger.debug(`Mock command: ${cmd} ${args}`);
	const mock_text = fs.readFileSync("mock/dummy." + cmd + ".txt", { encoding: "utf8" });
	callback(appendable, undefined, mock_text, undefined);
}

/*
 * Execute 'cmd' with arguments.
 * 
 * @param {string} cmd - command.
 * @param {[string]} args - command's parameter list.
 * @param {Object} opts - options.
 * @param {processSpawnCallback} callback - processing sub-process output/status.
 * 
 * @callback processSpawnCallback
 * @param {int} exitcode - sub-process exit code.
 * @param {string} stdout - sub-process stdout.
 * @param {string} stderr - sub-process stderr.
 *
 * Options:
 * - with_awd : prepends option list with "-w $AFD_WORK_DIR".
 * - appendable : true= exec callback with junks from stdout, false= collect all stdout.
 * - total_size_limit : stop/kill sub-process if stdout>limit*MByte.
 */
function exec_cmd_real(
	cmd,
	args = [],
	opts = {},
	callback
) {
	let { with_awd = true, appendable = true, total_size_limit = 1 } = opts;
	let largs = with_awd ? ["-w", AFD_WORK_DIR].concat(args) : args;
	logger.debug(`exec_cmd prepare command (appnd=${appendable}): ${cmd} ${largs}`);
	if (total_size_limit == null) {
		total_size_limit = 1;
	}
	if (total_size_limit > 10) {
		total_size_limit = 10;
	}
	const spawned_process = spawn(cmd, largs, { shell: true });

	function test_n_kill(sz) {
		if (sz > total_size_limit * 1024 * 1024 && !spawned_process.killed) {
			logger.warn(`stdout from '${cmd}' too large (> ${opts.limit} MB), killing spawn.`);
			callback(STATUS.payload_too_large, null, "Too much data! Reduce with filter.");
			spawned_process.killed = spawned_process.kill();
		}
	}

	if (appendable) {
		let next_out_buf = "";
		let next_err_buf = "";
		let data_buf;
		let data_sum = 0;
		spawned_process.stdout.on("data", (data) => {
			const data_str = data.toString();
			const last_cr = data_str.lastIndexOf("\n");
			data_buf = next_out_buf + data_str.substring(0, last_cr);
			data_sum += data_buf.length;
			next_out_buf = data_str.substring(last_cr + 1);
			callback(null, data_buf, null);
			test_n_kill(data_sum);
		});
		spawned_process.stderr.on("data", (data) => {
			const data_str = data.toString();
			const last_cr = data_str.lastIndexOf("\n");
			data_buf = next_err_buf + data_str.substring(0, last_cr);
			next_err_buf = data_str.substring(last_cr + 1);
			callback(null, null, data_buf);
		});
		spawned_process.on("close", (code, signal) => {
			if (signal) {
				logger.debug(`Caught signal ${signal} for spawn '${cmd}'`)
			}
			logger.debug(`Exitcode ${code} for spawn '${cmd}'`);
			callback(
				code,
				next_out_buf == "" ? null : next_out_buf,
				next_err_buf == "" ? null : next_err_buf
			);
		});
	}
	else {
		let buf_out = "";
		let buf_err = "";
		spawned_process.stdout.on("data", (data) => {
			buf_out += data.toString();
			test_n_kill(buf_out.length);
		});
		spawned_process.stderr.on("data", (data) => {
			buf_err += data.toString();
		});
		spawned_process.on("close", (code, signal) => {
			if (signal) {
				logger.debug(`Caught signal ${signal} for spawn '${cmd}'`)
			}
			logger.debug(`Exitcode ${code} for spawn '${cmd}'`);
			if (code !== 0) {
				callback(code, null, buf_err);
			}
			else {
				callback(code, buf_out, null);
			}
		});
	}
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
