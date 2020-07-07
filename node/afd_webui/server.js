"use 'esversion: 6'";
"use strict";
/*jslint node: true */

const yargs = require("yargs");
const fs = require("fs");
const path = require("path");
const https = require("http");
const node_static = require("node-static");
const ejs = require('ejs');
const WebSocket = require("ws");
const { execFile } = require("child_process");

/* Parse command line arguments.
   It's done this early to set correct path to static pages.
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
TODO: currently only "start" is implemented, server automatically starts.
implement:
- write PID in file
- stop 

*/


const static_server = new node_static.Server(path.join(AFD_WEBUI_DIR, "static"));

/* TODO implement in server:
	- SSL/TLS
	- user authentication (Basic?)
*/
const server = https.createServer(/*{
		cert: fs.readFileSync("/path/to/cert.pem"),
		key: fs.readFileSync("/path/to/key.pem")
	},*/
	(req, res) => {
		req.addListener("end", () => static_server.serve(req, res)).resume();
	}
);
const wss = new WebSocket.Server({ server });

/*
	Setup template engine.
*/
let html_info = fs.readFileSync(
	path.join(AFD_WEBUI_DIR, "templates", "info.html"),
	{ encoding: "utf8" }
);
const template_info = ejs.compile(html_info);

wss.on("connection", function connection(ws) {
	console.log("connection open.");
	let fsaLoop = null;
	ws.on("message", function incoming(message_raw) {
		const message = JSON.parse(message_raw);
		console.log("RCVD: %s", message);
		if (message.class == "fsa") {
			fsaLoop = startFsaLoop(ws);
		}
		else if (message.class == "afd") {

		}
		else if (message.class == "alias") {
			if (message.action in ["select", "deselect"]) {
				ws.send(JSON.stringify(
					search_host(message.action, message)
				));
			}
			else if (message.action === "info") {
				if (message.command === "read") {
					collect_info(message.alias, (alias, html) => {
						let reply = {
							class: "info",
							alias: alias,
							html: html
						}
						console.log("SEND %s", reply);
						ws.send(JSON.stringify(reply));
					});
				}
				else if (message.command === "save") {

				}
			}
			else if (massage.action === "config") {
				ws.send(JSON.stringify(
					exec_cmd("get_dc_data", ["-h"].concat(message.alias), null)
				));
			}
			else {
				let cmd = "afdcmd";
				let cmd_opt = [];
				switch (message.action) {
					case "start":
						cmd_opt = ["-t", "-q"];
						break;
					case "stop":
						cmd_opt = ["-T", "-Q"];
						break;
					case "able":
						cmd_opt = ["-X"];
						break;
					case "debug":
						cmd_opt = ["-d"];
						break;
					case "trace":
						cmd_opt = ["-c"];
						break;
					case "fulltrace":
						cmd_opt = ["-C"];
						break;
					case "switch":
						cmd_opt = ["-s"];
						break;
					case "retry":
						cmd_opt = ["-r"];
				}
				exec_cmd(cmd, cmd_opt.concat(message.alias), null);
				message["status"] = 204;
				ws.send(JSON.stringify(message));
			}
		}
		else if (message.class == "log") {

		}
		else {
			console.warn("unknown class ...");
		}
	});

	ws.on("close", function close() {
		console.log("fsa loop stop");
		clearInterval(fsaLoop);
	});
});

function startFsaLoop(ws) {
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


/** Collect information for one host.
	Details are inserted in rendered html template, which is send via callback.
	
	callback: (alias, html)
 */
function collect_info(host, callback) {
	let field_values = {
		HOST_ONE: "",
		HOST_TWO: "",
		info: "No information available."
	}
	mock_fsa_cmd("fsa_view", [host], (raw) => {
		//exec_cmd("fsa_view", [host], (raw) => {
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
				field_values["info"] = data;
			}
			callback(host, template_info(field_values))
		});
	});
}

let mock_fsa_text = fs.readFileSync("./fsa_view_dummy_wettinfo.txt", { encoding: "utf8" });
function mock_fsa_cmd(cmd, args, callback) {
	callback(mock_fsa_text);
}

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

/*
 * At last we start the server listener.
 */
server.listen(8040);

