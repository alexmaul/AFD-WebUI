## Install

### Prerequesites


### Install `afdwebui`

Installing the *AFD Web-UI* package works equally for all sorts of environments.

1. Extract distribution archive or clone git-project.

1. Change into project directory.

1. `npm install` (Installs Node modules and creates Node environment).

1. Edit and then execute `scripts/tls.certs.sh`

1. Copy default or create `$AFD_WORK_DIR/etc/webui.users`.
   
   Credentials for HTTP/Basic-auth in JSON format: `{ user: password ,... }`.

### Connect with AFD

The connection between *AFD Web-UI* and any installed/running *AFD* is made by
passing the `AFD_WORK_DIR` directory when starting the *AFD Web-UI* server.

All additional settings are read from the files `AFD_CONFIG` and/or 
`webui.users`, both placed in `$AFD_WORK_DIR/etc`.

### Run as Service

	server.js [command] [options]

Commands:

	start  Start WebUI server.
	
	stop   Stop WebUI server.

General options:

	--version:           Show version tag [boolean]
	
	--afd_work_dir, -w:  AFD work directory, per instance. [string]
	
	--verbose, -v:       [boolean] [default: false]
	
	--help, -h:          Show help [boolean]

Options for *start*:

	--port, -p: Bind server to this local port. [integer] [default: 8040]
	
	--pid, -P:  PID file. [string]
	
	--no_tls:   Do not use TLS. Start as unsecured HTTP-server.
	            [boolean] [default: false]
	
	--cert:     Path to SSL/TLS certificate/keys files. [string]
	
Options for *stop*:

	--pid, -P:  Stop server with PID in file. [string]
