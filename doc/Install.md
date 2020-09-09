[[_TOC_]]

### Prerequesites


### Install `afd-webui`

Installing the *AFD Web-UI* package works equally for all sorts of environments.

1. Extract distribution archive or clone git-project.

1. Change into project directory.

1. `npm install`  
   (Installs Node modules and creates Node environment).

1. Execute `scripts/tls.certs.sh`.  
   This creates TLS certificate files using OpenSSL tools. You can edit it to 
   match your organisation.

1. Create `$AFD_WORK_DIR/etc/webui.users`, or copy the sample file from the 
   project's root directory.
   
   This file holds the credentials for HTTP/Basic-auth in JSON format:
   > `{ user: password ,... }`

### Connect with AFD

The connection between *AFD Web-UI* and any installed/running *AFD* is made by
passing the `AFD_WORK_DIR` directory when starting the *AFD Web-UI* server.

All additional settings are read from the files `AFD_CONFIG` and/or 
`webui.users`, both placed in `$AFD_WORK_DIR/etc`.

### Webserver Log-files

`afd-webui` writes its own logfile in the AFD-log-directory:

> `$AFD_WORK_DIR/log/webui.log`

### Run as Service

First, change into project directory.

Then start the NodeJS server with the *AFD Web-UI* application:

	$> node server.js [command] [options]

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
