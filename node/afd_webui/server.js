"use 'esversion: 6'";
"use strict";
/* jslint node: true */

const MOCK = true;

/******************************************************************************
	AFD WebUI Server
	================
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
context:	string: <system|event|transfer|transfer-debug|input|output|delete>.
filter: 	{}:
	file:		number:	the file number for file-organized logs.
	level:		string: Regex of log-level letter <I|C|W|E|O|D>.
	paramSet...	{}:		Object with filter parameter, the names reflect
						classes/names in html.


Response
^^^^^^^^
class:		string:		"log">.
context: 	string: 	<system|event|transfer|transfer-debug|input|output|delete>.
append: 	bool:		true|false, if the lines/text should be appended to
						existing log lines.
lines:		[ string ]:	log data.

******************************************************************************/

const yargs = require("yargs");
const fs = require("fs");
const path = require("path");
const http = require("http");
const url = require('url');
const querystring = require('querystring');
const session = require('express-session');
const express = require('express');
const ejs = require('ejs');
const WebSocket = require("ws");
const { execFile, execFileSync, execSync } = require("child_process");

/*
 * Parse command line arguments. It's done this early to set correct path to
 * static pages.
 */
const argv = yargs
	.command("start", "Start WebUI server.", {
		port: {
			alias: "p",
			type: "number",
			description: "Bind server to this local port."
		},
		pid: {
			alias: "P",
			type: "string",
			description: "PID file."
		},
		log: {
			alias: "l",
			type: "string",
			description: "Log directory, if different from AFD log dir."
		}
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
	.help()
	.alias("help", "h")
	.argv;
const AFD_WEBUI_DIR = path.dirname(process.argv[1]);
const AFD_WORK_DIR = argv.afd_work_dir;
/*
 * TODO: currently only "start" is implemented, server automatically starts.
 * implement: - write PID in file - stop
 * 
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

const REST_URL = {
	bufr_decode: "http://informatix.dwd.de/cgi-bin/pytroll/bufr/decode.py"
};
const CONTENT_TYPE = {
	OCTET: "application/octet-stream",
	PLAIN: "text/plain",
	HTML: "text/html",
};
/**
 * Setup server.
 */
/*
 * TODO implement in server: - SSL/TLS - user authentication (Basic?)
 *
 * { cert: fs.readFileSync("/path/to/cert.pem"), key:
 * fs.readFileSync("/path/to/key.pem") },
 */
const app = express();
const map = new Map();
const sessionParser = session({
	saveUninitialized: false,
	secret: "$eCuRiTy",
	resave: false
});
app.set('view engine', 'ejs');
app.use("/static", express.static(path.join(AFD_WEBUI_DIR, "static")));
app.use(sessionParser);
const server = http.createServer(app);
const wss_ctrl = new WebSocket.Server({ noServer: true });
const wss_log = new WebSocket.Server({ noServer: true });

/**
 * Set dynamic routing for content-view.
 *
 * The worker function needs to send the response object 'res'.
 *
 * GET "/view/<mode>/<path:arcfile>"
 */
app.get('/view/:mode/:arc([a-zA-Z0-9.,_/-]+)', function(req, res) {
	console.log(req.params);
	view_content(res, req.params.arc, req.params.mode);
});

/**
 * Handle upgrade to Websocket connection.
 * 
 * Use seperate ws-server for ctrl and log.
 */
server.on('upgrade', function upgrade(request, socket, head) {
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
 * Setup template engine.
 */
var template_info = null;
fs.readFile(path.join(AFD_WEBUI_DIR, "templates", "info.html"),
	{ encoding: "utf8" },
	(err, data) => {
		if (!err) {
			template_info = ejs.compile(data);
		}
	}
);

/*
 * When Websocket-Server establishes an incoming connection ...
 */
wss_ctrl.on("connection", function connection_ctrl(ws, req) {
	let fsaLoop = null;
	const ip = req.socket.remoteAddress;
	console.log("connection ctrl open from %s.", ip);
	/*
     * Evaluate incoming message, dispatch actions to functions.
     */
	ws.on("message", function incoming(message_raw) {
		const message = JSON.parse(message_raw);
		console.debug("CTRL RCVD:", ip, message);
		/* */
		switch (message.class) {
			case "fsa":
				/* About sending status to client. */
				switch (message.action) {
					case "start":
						fsaLoop = fsaLoopStart(ws);
						break;
					case "stop":
						fsaLoop = fsaLoopStop(fsaLoop);
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
				console.warn("unknown class ...");
		}
	});

	/*
     * When a connection is closed by the client ...
     */
	ws.on("close", () => {
		fsaLoopStop(fsaLoop);
		console.log("connection ctrl close from %s", ip);
	});

	/*
     * In case of any error, cutting a connection ...
     */
	// TODO:
});

/*
 * When Websocket-Server establishes an incoming connection ...
 */
wss_log.on("connection", function connection_log(ws, req) {
	const ip = req.socket.remoteAddress;
	console.log("connection log open from %s.", ip);
	/*
     * Evaluate incoming message, dispatch actions to functions.
     */
	ws.on("message", function incoming(message_raw) {
		const message = JSON.parse(message_raw);
		console.debug("LOG RCVD:", ip, message);
		/* */
		if (message.class !== "log") {
			console.warn("unknown class ...");
			return;
		}
		switch (message.context) {
			case "view":
				// TODO ?
				break;
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
	});

	/*
     * When a connection is closed by the client ...
     */
	ws.on("close", () => {
		console.log("connection log close from %s", ip);
	});

	/*
     * In case of any error, cutting a connection ...
     */
	// TODO:
});


/** */
function fsaLoopStart(ws) {
	if (MOCK) {
		return fsaLoopStartMock(ws);
	} else {
		return fsaLoopStartReal(ws);
	}
}

/** */
function fsaLoopStop(fsaLoop) {
	console.log("fsa loop stop");
	clearInterval(fsaLoop);
}
/** */
function fsaLoopStartReal(ws) {
	console.log("start fsa loop with real data.");
	let fsaLoop = setInterval(() => {
		execFile("fsa_view_json",
			["-w", AFD_WORK_DIR],
			{ encoding: "latin1" },
			(error, stdout, stderr) => {
				if (error) {
					console.error(stderr);
					throw error;
				}
				else {
					ws.send('{"class":"fsa","data":' + stdout + "}");
				}
			}
		);
	}, 2000);
	return fsaLoop;
}

function fsaLoopStartMock(ws) {
	let counter = 0;
	console.log("read fsa.json");
	let data = JSON.parse(fs.readFileSync(AFD_WEBUI_DIR + "/fsa.json"));
	data.counter = counter;

	console.log("start fsa loop with %s", data);
	let fsaLoop = setInterval(() => {
		console.log("fsa send #%d", counter);
		data.counter = counter;
		ws.send(JSON.stringify(data));
		counter++;
	}, 2000);
	return fsaLoop;
}

/**
 * Dispatch to AFD controlling functions.
 */
function action_afd(message, ws) {
	let cmd = "afdcmd";
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
			switch (message.command) {
				case "read":
					const hc_data = read_hostconfig(message.alias);
					ws.send(JSON.stringify(hc_data));
					return;
				case "save":
					try {
						save_hostconfig(message.data);
					}
					catch (e) {
						console.error(e);
						ws.send(JSON.stringify({
							class: message.class,
							command: message.command,
							action: message.action,
							status: 500,
							message: `${e.name}: ${e.message}`
						}));
						return;
					}
				case "update":
					cmd = "uhc";
					cmd_opt = "";
					break;
			}
			break;
		case "afd":
			switch (message.command) {
				case "start":
					cmd = "afd";
					cmd_opt = " -a";
					break;
				case "stop":
					cmd = "afd"
					cmd_opt = "-s"
					break;
				default:
					console.log("Command unclear?");
			}
			break;
		default:
			console.log("Command unclear?");
	}
	exec_cmd(cmd, cmd_opt,
		(error, stdout, stderr) => {
			if (error) {
				console.warn(error, stderr);
			}
			else {
				console.debug("%s %s :: %s", cmd, cmd_opt, stdout);
			}
		}
	);
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
				collect_info(message.alias, (alias, html) => {
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
							console.error("Error writing INFO file: %s", err);
						}
					}
				);
			}
			break;
		case "config":
			for (const alias of message.alias) {
				exec_cmd("get_dc_data",
					["-h", alias],
					(error, dc_data, stderr) => {
						console.log("EXEC->", error, dc_data, stderr);
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
					"afdcmd",
					AFDCMD_ARGS[message.action].concat(message.alias),
					(error, stdout, stderr) => {
						if (error) {
							console.warn("afdcmd %s %s -> %s",
								message.action,
								message.alias,
								stderr
							);
							message["status"] = 504;
							ws.send(JSON.stringify(message));
						}
						else {
							console.log("afdcmd %s %s -> %s",
								message.action,
								message.alias,
								stdout
							);
						}

					}
				);

			}
			else {
				message["status"] = 504;
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
function collect_info(host, callback) {
	let field_values = {
		HOST_ONE: "",
		HOST_TWO: "",
		info_text: "No information available."
	};
	exec_cmd("fsa_view", [host], (err, raw, _) => {
		if (err) {
			console.warn(err);
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
		console.debug(field_values);
		let fn_info = path.join(AFD_WORK_DIR, "etc", "INFO-" + field_values["hostname"])
		fs.readFile(fn_info, (err, data) => {
			if (err) {
				if (err.code === "ENOENT") {
					console.error("File does not exist: %s", fn_info);
				}
				else {
					throw err;
				}
			}
			else {
				field_values["info_text"] = data;
			}
			callback(host, template_info(field_values))
		});
	});
}

function search_host(action, form_json) {
	let host_list = [];

	function test_protocol(host) {
		const raw = exec_cmd_sync("fsa_view", [host]);
		let ok = false;
		for (const l of raw.split("\n")) {
			const le = l.split(":").map(x => x.trim());
			if (le[0].startsWith("Protocol")) {
				if (le[1] === "") {
					ok = true;
				}
				else {
					for (const p of le[1].split(" ")) {
						if (form_json.modal_select_protocol.indexOf(p) >= 0) {
							ok = true
						}
					}
				}
				return ok;
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
			fn_info = os.path.join(afd_work_dir, "etc", "INFO-" + hc_key)
			if (os.path.exists(fn_info)) {
				let info_text = fs.readFileSync(fn_info, { encoding: "utf8" });
				if (re_matcher.test(info_text)) {
					host_list = host_list.concat(hc_key)
				}
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
 * Read HOST_CONFIG data.
 * 
 * If aliasList===null an object representing the whole HOST_CONFIG is returned,
 * otherwise only the data for the alias in the list is returned.
 */
function read_hostconfig(aliasList = []) {
	const hc_order = [];
	const hc_data = {};
	let alias;
	if (aliasList === null) {
		alias = null;
	}
	else if (aliasList.length == 0) {
		alias = "";
	}
	else {
		alias = aliasList[0];
	}

	function get_proto(host) {
		return "FTP"; // XXX: mock.
		try {
			if (host === null) {
				host = "";
			}
			line = execSync("fsa_view " + host + " | grep Protocol");
			const r = line.split(":")[1].trim().split(" ")[0];
			if (r === "") {
				return "null";
			}
			else {
				return r;
			}
		} catch (ex) {
			return "null";
		}
	}

	const hc_content = fs.readFileSync(
		path.join(AFD_WORK_DIR, "etc", "HOST_CONFIG"),
		{ encoding: "latin1" }
	);
	for (let line of hc_content.split("\n")) {
		if (!line || line.startsWith("#")) {
			continue;
		}
		line = line.trim();
		let line_data = line.split(":");
		hc_order.push(line_data[HC_FIELD_NAME]);
		if (alias === null
			|| (alias === "" && Object.keys(hc_data).length < 1)
			|| line_data[HC_FIELD_NAME] == alias) {
			hc_data[line_data[HC_FIELD_NAME]] = {};
			hc_data[line_data[HC_FIELD_NAME]]["protocol-class"] = PROTO_SCHEME[get_proto(line_data[HC_FIELD_NAME])];
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
					if (line_data[hc_field[HC_FIELD_COLUMN]] != "") {
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
			if (!err) {
				fs.rename(
					tmp_fn_hc,
					path.join(AFD_WORK_DIR, "etc", "HOST_CONFIG"),
					() => { console.log("host_config updated."); }
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
	exec_cmd("grep", [
		"-shP",
		"<(" + message.filter.level + ")>",
		AFD_WORK_DIR + "/log/" + AFDLOG_FILES[message.context] + file_number
	],
		(error, stdout, stderr) => {
			if (error) {
				console.warn(error, stderr);
			}
			else {
				data = {
					class: "log",
					context: message.context,
					append: false,
					lines: stdout.split("\n"),
				};
				ws.send(JSON.stringify(data));
			}
		}
	);
}

function log_from_alda(message, ws) {
	let alda_output_format = {
		input: ["-o", "\"<tr><td class='clst-dd'>%ITm.%ITd.</td>"
			+ "<td class='clst-hh'>%ITH:%ITM:%ITS</td><td>%IF</td>"
			+ "<td class='clst-fs'>%ISB</td></tr>\""],
		output: ["-o", "\"<tr archive='|%OA/%xOZu_%xOU_%xOL_%Of|'>"
			+ "<td class='clst-dd'>%OTm.%OTd.</td><td class='clst-hh'>"
			+ "%OTH:%OTM:%OTS</td><td>%Of</td><td class='clst-hn'>%OH</td>"
			+ "<td class='clst-tr'>%OP</td><td class='clst-fs'>%OSB</td>"
			+ "<td class='clst-tt'>%ODA</td><td class='clst-aa'>|N|</td>"
			+ "</tr>\""],
		delete: ["-o", "\"<tr><td class='clst-dd'>%DTm.%DTd.</td>"
			+ "<td class='clst-hh'>%DTH:%DTM:%DTS</td><td>%DF</td>"
			+ "<td class='clst-fs'>%DSB</td><td class='clst-hn'>%DH</td>"
			+ "<td class='clst-rn'>%DR</td><td class='clst-pu'>%DW</td>"
			+ "</tr>\""]
	};
	let par_tr = {
		start: "-t ",
		end: "-T ",
		directory: "-d ",
		recipient: "-h ",
		filesize: "-S ",
		job_id: "-j ",
		protocol: "-p ",
		"trans-time": "-D ",
		"delete-reason": null,
	};
	let par_lst = [];
	let fnam = "";
	let logtype;
	if (message.filter["received-only"]) {
		logtype = "R";
	}
	else {
		logtype = message.context[0].upper();
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
	for (key in message.filter) {
		let val = message.filter[key];
		if (key in par_tr && par_tr[key] === null) {
			continue;
		}
		else if (key == "filename") {
			fnam = val;
		}
		else if (key == "recipient") {
			let rl = val.split(",").map(v => "%" + v).join(",");
			// rl = ",".join("%" + v for v in val.split(","));
			par_lst.push("{}'{}'".format(par_tr[key], rl));
		}
		else if (key == "output-filename-remote" && ["on", "yes", "true"].indexOf(val) >= 0) {
			alda_output_line[1] = alda_output_line[1].replace("%Of", "%OF");
		}
		else if (key in par_tr && val == "true") {
			par_lst.concat(par_tr[key]);
		}
		else if (key in par_tr) {
			par_lst.concat(par_tr[key] + val);
		}
		let cmd_par = ["-f", "-L", logtype].concat(par_lst).concat(alda_output_line).push(fnam);
		let data = {
			class: "log",
			context: message.context,
			append: false,
			lines: stdout.split("\n"),
		};
		if (message.context == "output") {
			exec_cmd("alda", cmd_par, (error, stdout, stderr) => {
				if (error) {
					console.warn(error, stderr);
				}
				else {
					// Parse each line, and set archive flag.
					let new_data = [];
					for (data_line of stdout.split("\n")) {
						if (!data_line) {
							continue;
						}
						let parts = data_line.split("|");
						if (!parts[1].startsWith("/")) {
							if (path.exists(path.join(afd_work_dir, "archive", parts[1]))) {
								parts[-2] = "Y";
							}
							else {
								parts[-2] = "D";
							}
						}
						else {
							parts[1] = "";
							parts[-2] = "N";
						}
						if (!archived_only || parts[-2] == "Y") {
							new_data.concat("".join(parts));
						}
					}
					data.lines = new_data;
					ws.send(JSON.stringify(data));
				}
			});
		}
		else {
			exec_cmd("alda", cmd_par,
				(error, stdout, stderr) => {
					if (error) {
						console.warn(error, stderr);
					}
					else {
						data.lines = stdout.split("\n");
						ws.send(JSON.stringify(data));
					}
				});
		}
	}
}

/**
 * Output-Log -> View File.
 *
 * Retrieve a file from AFD archive and apply a parser program if required.
 *
 * Returns {content_type: <MIME>, blob: <data>}
 */
function view_content(response, arcfile, mode = "auto") {
	content = "";
	arcfile_path = path.join(AFD_WORK_DIR, "archive", arcfile);
	if (!path.exists(arcfile_path)) {
		console.warn("Archived file not found.");
		response.sendStatus(404);
	}
	if (mode == "auto") {
		content_type = magic.from_file(arcfile_path, mime = True);
		if (content_type == CONTENT_TYPE.OCTET) {
			m = re.match(".*[-.](\w+)$", arcfile);
			if (m !== null && m.group(1) in ("bufr", "wmo")) {
				mode = "bufr";
			}
		}
	}
	switch (mode) {
		case "hexdump":
		case "od":
			content = exec_cmd(
				"hexdump", ["-C", arcfile_path],
				(error, stdout, stderr) => {
					if (error) {
						console.warn(error, stderr);
						response.sendStatus(404);
					}
					else {
						response.set("Content-Type", CONTENT_TYPE.PLAIN);
						response.send(stdout);
					}
				});
			break;
		case "bufr":
			fs.readFile(arcfile_path, (err, data) => {
				if (err) {
					console.warn(error, stderr);
					response.sendStatus(404);
				}
				else {
					response.set("Content-Type", CONTENT_TYPE.HTML);
					webservice_send_file(REST_URL.bufr_decode, data, response.send)
				}
			});
			break;
		default:
			response.sendFile(arcfile_path);
			break;
	}
}

/**
 * Send file to REST webservice by http/post and give the response to a callback.
 */
function webservice_send_file(rest_url, data, callback) {
	const rest_req = http.request(
		rest_url,
		{
			method: "POST",
		},
		(rest_res) => {
			console.log(`STATUS: ${rest_res.statusCode}`);
			console.log(`HEADERS: ${JSON.stringify(rest_res.headers)}`);
			rest_res.setEncoding("utf8");
			rest_res.on("data", (chunk) => {
				callback(chunk);
			});
		});
	rest_req.on("error", (e) => {
		console.error("problem with request:", e);
	});
	const crlf = "\r\n";
	const headers = [
		"Content-Disposition: form-data; name='file'" + crlf
	];
	const boundaryKey = Math.random().toString(16);
	const boundary = `-----${boundaryKey}`;
	const delimeter = `${crlf}-----${boundary}`;
	const closeDelimeter = `${delimeter}-----`;
	const multipartBody = Buffer.concat([
		new Buffer.from(delimeter + crlf + headers.join("") + crlf),
		data,
		new Buffer.from(closeDelimeter)]
	);
	rest_req.setHeader("Content-Type", "multipart/form-data; boundary=" + boundary);
	rest_req.setHeader("Content-Length", multipartBody.length);
	/* Write data to request body */
	rest_req.write(multipartBody);
	rest_req.end();
}

/*******************************************************************************
 * Execute command-line programs.
 ******************************************************************************/

function exec_cmd(cmd, args, callback) {
	if (MOCK) {
		exec_cmd_mock(cmd, args, callback);
	} else {
		exec_cmd_real(cmd, args, callback);
	}
}

function exec_cmd_mock(cmd, args, callback) {
	const mock_text = fs.readFileSync("./dummy." + cmd + ".txt", { encoding: "utf8" });
	callback(undefined, mock_text, undefined);
}


/**
 * Execute 'cmd' with arguments.
 * 
 * Callback function is called with error, stdout, stderr as parameter.
 */
function exec_cmd_real(cmd, args, callback) {
	console.debug("prepare command: %s %s", cmd, args)
	execFile(cmd,
		["-w", AFD_WORK_DIR].concat(args),
		{ encoding: "latin1" },
		(error, stdout, stderr) => {
			if (callback) {
				console.debug("cmd: %s -> len=%d", cmd, stdout.length)
				callback(error, stdout, stderr);
			}
			else if (error) {
				console.error(stderr);
				console.error(error);
			}
		}
	);
}

/**
 * Execute 'cmd' synchronous with arguments, stdout is returned.
 */
function exec_cmd_sync(cmd, args) {
	console.debug("prepare command (sync): %s %s", cmd, args)
	const stdout = execFileSync(cmd,
		["-w", AFD_WORK_DIR].concat(args),
		{ encoding: "latin1" }
	);
	return stdout;
}

/*******************************************************************************
 * At last we start the server listener.
 */
server.listen(8040);

/* ***** END **************************************************************** */
