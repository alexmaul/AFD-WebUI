"use 'esversion: 6'";
"use strict";
/* jslint node: true */

const yargs = require("yargs");
const fs = require("fs");
const path = require("path");
const https = require("http");
const node_static = require("node-static");
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
const static_server = new node_static.Server(path.join(AFD_WEBUI_DIR, "static"));

/*
 * TODO implement in server: - SSL/TLS - user authentication (Basic?)
 */
/*
                                     * { cert:
                                     * fs.readFileSync("/path/to/cert.pem"),
                                     * key: fs.readFileSync("/path/to/key.pem") },
                                     */
const server = https.createServer(
	(req, res) => {
		req.addListener("end", () => { static_server.serve(req, res) }).resume()
	}
);
const wss = new WebSocket.Server({ server });

/*
 * Setup template engine.
 */
var template_info = null;
fs.readFile(path.join(AFD_WEBUI_DIR, "templates", "info.html"),
	(err, data) => {
		if (!err) {
			template_info = ejs.compile(data);
		}
	}
);

/*
 * 
 */
wss.on("connection", function connection(ws) {
	console.log("connection open.");
	let fsaLoop = null;
	ws.on("message", function incoming(message_raw) {
		const message = JSON.parse(message_raw);
		console.debug("RCVD:");
		console.debug(message);
		switch (message.class) {
			case "fsa":
				fsaLoop = fsaLoopStart(ws);
				break;
			case "afd":
				break;
			case "alias":
				switch (message.action) {
					case "select":
					case "deselect":
						ws.send(JSON.stringify(
							search_host(message.action, message.data)
						));
						break;
					case "info":
						if (message.command === "read") {
							collect_info(message.alias, (alias, html) => {
								let reply = {
									class: "info",
									alias: alias,
									html: html
								};
								console.debug("SEND:");
								console.debug(reply);
								ws.send(JSON.stringify(reply));
							});
						}
						else if (message.command === "save") {
							let fn_info = path.join(AFD_WORK_DIR, "etc", "INFO-" + message.alias);
							fs.writeFile(
								fn_info,
								message.info_text,
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
						exec_cmd("get_dc_data",
							["-h"].concat(message.alias),
							(dc_data) => {
								const msg = {
									class: "alias",
									action: "config",
									alias: message.alias,
									data: dc_data
								};
								ws.send(JSON.stringify(msg));
							}
						);
					default:
						if (message.action in AFDCMD_ARGS) {
							exec_cmd(
								"afdcmd",
								AFDCMD_ARGS[message.action].concat(message.alias),
								null
							);
							message["status"] = 204;
							ws.send(JSON.stringify(message));
						}
						else {
							message["status"] = 504;
							ws.send(JSON.stringify(message));
						}
				}
				break;
			case "log":
				break;
			default:
				console.warn("unknown class ...");
		}
	});

	ws.on("close", () => {
		fsaLoopStop(fsaLoop);
	});
});

/** */
function fsaLoopStart(ws) {
	return fsaLoopStartReal(ws);
}

/** */
function fsaLoopStop(fsaLoop) {
	console.log("fsa loop stop");
	clearInterval(fsaLoop);
}
/** */
function fsaLoopStartReal(ws) {
	let counter = 0;
	console.log("start fsa loop with real data.");
	let fsaLoop = setInterval(() => {
		execFile("fsa_view_json",
			["-w", AFD_WORK_DIR],
			{ encoding: "latin1" },
			(error, stdout, stderr) => {
				console.error(stderr);
				if (error) {
					throw error;
				}
				else {
					console.log("fsa send #%d", counter);
					ws.send('{"class":"fsa","data":' + stdout + "}");
					counter++;
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


const mock_fsa_text = fs.readFileSync("./fsa_view_dummy_wettinfo.txt", { encoding: "utf8" });
function mock_fsa_cmd(cmd, args, callback) {
	callback(mock_fsa_text);
}

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
		info: "No information available."
	};
	// mock_fsa_cmd("fsa_view", [host], (raw) => {
	exec_cmd("fsa_view", [host], (raw) => {
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
	console.debug(form_json);

	function test_protocol(host) {
		const raw = exec_cmd_sync("fsa_view", [host]);
		let ok = false;
		for (const l of raw.split("\n")) {
			const le = l.split(":").map(x => x.strip());
			if (le[0].startswith("Protocol")) {
				if (le[1] === "") {
					ok = rue;
				}
				else {
					for (const p of le[1].split(" ")) {
						if (form_json["modal_select_protocol"].indexOf(p)) {
							ok = true
						}
					}
				}
				return ok;
			}
		}
		return ok;
	}

	if ("modal_select_string" in form_json) {
		re_matcher = new RegExp(form_json["modal_select_string"]);
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
		if (form_json["modal_select_where"][0] == "info") {
			fn_info = os.path.join(afd_work_dir, "etc", "INFO-" + hc_key)
			if (os.path.exists(fn_info)) {
				let info_text = fs.readFileSync(fn_info, { encoding: "utf8" });
				if (re_matcher.test(info_text)) {
					host_list.append(hc_key)
				}
			}
		}
		else {
			if (form_json["modal_select_hostname"] == "alias") {
				if (re_matcher.test(hc_set["alias"])) {
					host_list.append(hc_key)
				}
			}
			else {
				if (re_matcher.test(hc_set["host_name_real1"]) || re_matcher.test(hc_set["host_name_real1"])) {
					host_list.append(hc_key)
				}
			}
		}
	}
	let r = {};
	r[action] = host_list;
	return r;
}

/* *****************************************************************************
 * Functions to read and write AFD configuration files.
 */


/* These field names tuple represent the fields in HOST_CONFIG.
Important is their exact order!
Fields for columns 3 (HostToggle) and 14 (SpecialFlag) and 20 (duplicate-check)
are flags, where the value of "bit" in the tuple denotes the bit to set.
If this field "bit" is set to a value >=0, then bit-arithmetic is applied.
For html-radio-input the column "radio-value" is taken in, too.
Special case: the fields "host_switch_*" are combined into one column.
*/
const HC_FIELD_NAME = 0;
const HC_FIELD_RADIO = 1;
const HC_FIELD_DEFAULT = 2;
const HC_FIELD_COLUMN = 3;
const HC_FIELD_BIT = 4;
const HC_FIELDS = [
	/* field-name, radio-value, default, column, bit */
	["alias", null, "", 0, -1],  //                           AH - Alias hostname
	["host_name_real1", null, "", 1, -1],  //                HN1 - Real hostname 1
	["host_name_real2", null, "", 2, -1],  //                HN2 - Real hostname 2
	["host_switch_enable", null, "no", 3, -2],  //           HT - Host toggle enable
	["host_switch_char1", null, "", 3, -2],  //               HT - Host toggle character 1
	["host_switch_char2", null, "", 3, -2],  //              HT - Host toggle character 2
	["host_switch_auto", null, "no", 3, -2],  //              HT - Automatic host switching: yes={}, no=[]
	["proxy_name", null, "", 4, -1],  //                      PXY - Proxy name
	["max_parallel_transfer", null, "3", 5, -1],  //          AT - Allowed transfers
	["max_errors", null, "10", 6, -1],  //                    ME - Max. errors
	["retry_interval", null, "120", 7, -1],  //               RI - Retry interval
	["transfer_block_size", null, "4 KB", 8, -1],  //         TB - Transfer block size
	["successful_retries", null, "0", 9, -1],  //             SR - Successful retries
	["filesize_offset_for_append", null, "null", 10, -1],  // FSO - File size offset
	["transfer_timeout", null, "60", 11, -1],  //             TT - Transfer timeout
	["no_burst", null, "0", 12, -1],  //                      NB - Number of no bursts
	["host_status", null, "0", 13, -1],  //                   HS - Mostly irrelevant for HC-edit page!
	["ignore_error_warning", null, "no", 13, 4],  //          HS:5  - Error status offline
	["do_not_delete", null, "no", 13, 15],  //                HS:16 - Do not delete files due age-limit and 'delete queued files'
	["ftp_mode_passive", null, "no", 14, 0],  //              SF:1 - FTP passive mode
	["ftp_idle_time", null, "no", 14, 1],  //                 SF:2 - Set FTP idle time to transfer timeout
	["ftp_keep_alive", null, "no", 14, 2],  //                SF:3 - Send STAT command to keep control connection alive.
	["ftp_fast_rename", null, "no", 14, 3],  //               SF:4 - Combine RNFR and RNTO to one command.
	["ftp_fast_cd", null, "no", 14, 4],  //                   SF:5 - Do not do a cd, always use absolute path.
	["ftp_no_type_i", null, "no", 14, 5],  //                 SF:6 - Do not send TYPE I command.
	["ftp_mode_epsv", null, "no", 14, 6],  //                 SF:7 - Use extended active or extended passive mode.
	["disable_burst", null, "no", 14, 7],  //                 SF:8 - If set bursting is disabled.
	["ftp_allow_redirect", null, "no", 14, 8],  //            SF:9 - If set FTP passive mode allows to be redirected to another address.
	["use_local_scheme", null, "no", 14, 9],  //              SF:10 - When set it will replace the given scheme with file if the hostname matches local hostname or one in local_interface.list.
	["tcp_keep_alive", null, "no", 14, 10],  //               SF:11 - Set TCP keepalive.
	["sequence_locking", null, "no", 14, 11],  //             SF:12 - Set sequence locking.
	["enable_compress", null, "no", 14, 12],  //              SF:13 - Enable compression.
	["keep_timestamp", null, "no", 14, 13],  //               SF:14 - Keep time stamp of source file.
	["sort_names", null, "no", 14, 14],  //                   SF:15 - Sort file names.
	["no_ageing_jobs", null, "no", 14, 15],  //               SF:16 - No ageing jobs.
	["check_local_remote_match_size", null, "no", 14, 16],  // SF:17 - Check if local and remote size match.
	["is_timeout_transfer", null, "no", 14, 17],  //          SF:18 - Timeout transfer.
	["keep_connected_direction", "send", "no", 14, 18],  //   SF:19 - Keep connected no fetching.
	["keep_connected_direction", "fetch", "no", 14, 19],  //  SF:20 - Keep connected no sending.
	["ftps_clear_ctrlcon", null, "no", 14, 20],  //           SF:21 - FTPS Clear Control Connection.
	["ftp_use_list", null, "no", 14, 21],  //                 SF:22 - Use FTP LIST for directory listing.
	["tls_strict_verification", null, "no", 14, 22],  //      SF:23 - TLS uses strict verification of host.
	["ftp_disable_mlst", null, "no", 14, 23],  //             SF:24 - Disables FTP MLST for directory listing.
	["keep_connected_disconnect", null, "no", 14, 24],  //    SF:25 - Disconnect after given keep connected time.
	["transfer_rate_limit", null, "0", 15, -1],  //           TRL - Transfer rate limit
	["time_to_live", null, "0", 16, -1],  //                  TTL - TCP time-to-live
	["socket_send_buffer", null, "0", 17, -1],  //            SSB - Socket send buffer
	["socket_receive_buffer", null, "0", 18, -1],  //         SRB - Socket receive buffer
	["dupcheck_timeout", null, "0", 19, -1],  //              DT - Duplicate check timeout
	["dupcheck_type", "name", "no", 20, 0],  //               DF:1 - Only do CRC checksum for filename.
	["dupcheck_type", "content", "no", 20, 1],  //            DF:2 - Only do CRC checksum for file content.
	["dupcheck_type", "name-content", "no", 20, 2],  //       DF:3 - Checksum for filename and content.
	["dupcheck_type", "name-no-suffix", "no", 20, 3],  //     DF:4 - Checksum of filename without last suffix.
	["dupcheck_type", "name-size", "no", 20, 4],  //          DF:5 - Checksum of filename and size.
	["dupcheck_crc", "crc32", "no", 20, 15],  //              DF:16 - Do a CRC32 checksum.
	["dupcheck_crc", "crc32c", "no", 20, 16],  //             DF:17 - Do a CRC32C checksum.
	["dupcheck_delete", null, "no", 20, 23],  //              DF:24 - Delete the file.
	["dupcheck_store", null, "no", 20, 24],  //               DF:25 - Store the duplicate file.
	["dupcheck_warn", null, "no", 20, 25],  //                DF:26 - Warn in SYSTEM_LOG.
	["dupcheck_timeout_fixed", null, "no", 20, 30],  //       DF:31 - Timeout is fixed, ie. not cumulative.
	["dupcheck_reference", "recipient", "no", 20, 31],  //    DF:32 - Use full recipient as reference instead of alias name.
	["keep_connected", null, "0", 21, -1],  //                KC - Keep connected
	["warn_time", null, "0", 22, -1],  //                     WT - Warn time [secs]
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

function read_hostconfig(alias) {
	hc_order = [];
	hc_data = {};

	function get_proto(host) {
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

	fh_hc = fs.readFileSync(
		path.join(AFD_WORK_DIR, "etc", "HOST_CONFIG"),
		{ encoding: "latin1" }
	)
	for (const line of fh_hc) {
		line = line.strip();
		if (!line || line.startswith("#")) {
			continue;
		}
		line_data = line.split(":");
		hc_order.append(line_data[HC_FIELD_NAME]);
		if (alias === null || line_data[HC_FIELD_NAME] == alias) {
			hc_data[line_data[HC_FIELD_NAME]] = {};
			hc_data[line_data[HC_FIELD_NAME]]["protocol-class"] = PROTO_SCHEME[get_proto(alias)];
			for (const hc_field of HC_FIELDS) {
				if (hc_field[HC_FIELD_BIT] >= 0) {
					if (int(line_data[hc_field[HC_FIELD_COLUMN]]) & (1 << hc_field[HC_FIELD_BIT])) {
						value = hc_field[HC_FIELD_RADIO] || "yes";
					}
					else {
						value = "no";
					}
				}
				else if (hc_field[HC_FIELD_BIT] == -2) {
					if (line_data[hc_field[HC_FIELD_COLUMN]] != "") {
						hc_data[line_data[HC_FIELD_NAME]]["host_switch_enable"] = "yes";
						hc_data[line_data[HC_FIELD_NAME]]["host_switch_auto"] = ine_data[hc_fiel[HC_FIELD_COLUMN]][0] == "{" ? "yes" : "no";
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
				if ((!hc_field[HC_FIELD_NAME] in hc_data[line_data[HC_FIELD_NAME]])
					|| (hc_data[line_data[HC_FIELD_NAME]][hc_field[HC_FIELD_NAME]] in ("no", hc_field[HC_FIELD_DEFAULT]))
				) {
					hc_data[line_data[HC_FIELD_NAME]][hc_field[HC_FIELD_NAME]] = int_or_str(value);
				}
			}
		}
	}
	return { order: hc_order, data: hc_data };
}


function save_hostconfig(form_json) {
	tmp_fn_hc = path.join(AFD_WORK_DIR, "etc", ".HOST_CONFIG");
	/* Read current content of HOST_CONFIG */
	hc = read_hostconfig(null);
	/* Replace the host order */
	hc["order"] = form_json["order"];
	if ("data" in form_json) {
		/* Update values for all submitted host with those from the request.json */
		for (const alias in form_json.data) {
			const alias_data = form_json.data[alias];
			hc.data[alias] = {};
			for (const t of HC_FIELDS) {
				hc.data[alias][t[HC_FIELD_NAME]] = t[HC_FIELD_RADIO] || t[HC_FIELD_DEFAULT];
			}
			hc.data[alias].assign(alias_data);
            /*
			 * TODO: improve setting default-values without overriding host-status.
			 */
		}
	}
	/* Write a new HOST_CONFIG to a temporary file. */
	let hc_text = HC_COMMENT;
	for (const alias of hc["order"]) {
		line_data = [null] * 23;
		hc_toggle = {};
		for (const tuplevalue of HC_FIELDS) {
			const tuplevalue_field = tuplevalue[0];
			const tuplevalue_radio = tuplevalue[1];
			const tuplevalue_default = tuplevalue[2];
			const tuplevalue_column = tuplevalue[3];
			const tuplevalue_bit = tuplevalue[4];
			if (tuplevalue_bit >= 0) {
				column_value = int_or_str(line_data[tuplevalue_column])
				if (column_value == null) {
					column_value = 0;
				}
				if (["yes", tuplevalue_radio].indexOf(hc["data"][alias].get(tuplevalue_field, "no"))) {
					column_value = column_value | 1 << tuplevalue_bit;
				}
				else {
					column_value = column_value & ~(1 << tuplevalue_bit);
				}
				line_data[tuplevalue_column] = column_value;
			}
			else if (tuplevalue_bit == -1) {
				line_data[tuplevalue_column] = hc["data"][alias].get(tuplevalue_field, tuplevalue_default);
			}
			else if (tuplevalue_bit == -2) {
				hc_toggle[tuplevalue_field] = hc["data"][alias][tuplevalue_field];
			}
		}
		if (hc_toggle["host_switch_enable"] == "yes") {
			if (hc_toggle["host_switch_auto"] == "yes") {
				line_data[3] = `{${hc_toggle.host_switch_char1}${hc_toggle.host_switch_char2}}`;
			}
			else {
				line_data[3] = `[${hc_toggle.host_switch_char1}${hc_toggle.host_switch_char2}]`;
			}
		}
		else {
			line_data[3] = "";
		}
		hc_text += line_data.concat(":");
		hc_text += "\n";
	}
	fh_hc = fs.writeFile(tmp_fn_hc,
		hc_text,
		{ encoding: "latin1" },
		(err) => {
			if (!err) {
				fs.rename(tmp_fn_hc, os.path.join(AFD_WORK_DIR, "etc", "HOST_CONFIG"));
			}
		}
	);

}

/**
 * Execute 'cmd' with arguments, callback function is called with stdoud as parameter.
 */
function exec_cmd(cmd, args, callback) {
	console.debug("prepare command: %s %s", cmd, args)
	execFile(cmd,
		["-w", AFD_WORK_DIR].concat(args),
		{ encoding: "latin1" },
		(error, stdout, stderr) => {
			console.log(stdout);
			console.error(stderr);
			if (callback) {
				console.debug("cmd: %s -> len=%d", cmd, stdout.length)
				callback(stdout);
			}
			if (error) {
				throw error;
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

/*
 * At last we start the server listener.
 */
server.listen(8040);

