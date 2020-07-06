const fs = require('fs');
const https = require('http');
const static = require('node-static');
const file = new static.Server('./static');
const WebSocket = require('ws');

const server = https.createServer(/*{
		cert: fs.readFileSync('/path/to/cert.pem'),
		key: fs.readFileSync('/path/to/key.pem')
	},*/
	(req, res) => {
		req.addListener('end', () => file.serve(req, res)).resume();
	}
);
const wss = new WebSocket.Server({ server });

let fsaLoop = null;

// TODO context, den ws + intervall etc gehalten werden.

wss.on('connection', function connection(ws) {
	ws.on('message', function incoming(message) {
		console.log('received: %s', message);
		const data = JSON.parse(message);
		console.log("class:%s", message);
		if (message["class"] == "fsa") {
			startFsaLoop(ws);
		}
		else if (message["class"] == "afd") {
			
		}
		else if (message["class"] == "alias") {
			
		}
		else if (message["class"] == "log") {
			
		}
		else {
			
		}
	});
	
	ws.on('close', function close() {
		console.log("fsa loop stop");
		clearInterval(fsaLoop);
	});


});

function evalMessage(ws, message) {
}

function startFsaLoop(ws) {
	let counter = 0;
	let data = JSON.parse(fs.readFileSync("fsa.json"));
	data.counter = counter;
	
	console.log("start fsa loop with %s", data);
	fsaLoop = setInterval(() => {
		console.log("fsa send #%d", counter);
		data.counter = counter;
		ws.send(JSON.stringify(data));
		counter++;
	}, 2000);	
}

/*
 * At last we start the server listener.
 */
server.listen(8040);

