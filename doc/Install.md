[[_TOC_]]

### Prerequesites

- The [NodeJS](https://nodejs.org) interpreter executable is required to run the server.

- For the installation a connection to the Internet is required. To run the
  server, you only need network connection between client and server.

- Which TCP port the Node server should bind to?\
  The same port will be used for all communication (http *and* ws, resp. their 
  secure variants) between client and server.

- On the server side, open the port you intend to use in the firewall(s) for
  protocols HTTP+WS or HTTPS+WSS.

- If you have your own OpenSSL PEM certificate files,

  - place them into the project sub-directory `certs/`.

  - or use the parameter `--cert` when starting the *AFD Web-UI* server.

### Install `afd-webui`

Installing the *AFD Web-UI* package works equally for all sorts of environments.

1. Extract distribution archive or clone git-project.

1. Change into project directory.

1. `npm install`\
   Installs Node modules and creates Node environment.

1. `scripts/tls-certs.sh`\
   *Optional* -- This creates TLS certificate files using OpenSSL tools.
   The generated PEM files are in the projects sub-directory `certs/`.\
   You can edit it to match your organisation.

1. Create `$AFD_WORK_DIR/etc/webui.users`, or copy the sample file from the 
   project's root directory.
   
   This file holds the credentials for HTTP/Basic-auth in JSON format:
   > `{ user: password ,... }`

### Connect with AFD

The connection between *AFD Web-UI* and any installed/running *AFD* is made by
passing the `AFD_WORK_DIR` directory when starting the *AFD Web-UI* server.

Each instance of *AFD Web-UI* (connected to *one* AFD instance) need its own 
TCP port. The default is `8040`, but you can use any other free port.

All additional settings are read from the files `AFD_CONFIG` and
`webui.users`, both placed in `$AFD_WORK_DIR/etc`.

### Webserver Log-files

`afd-webui` writes its own logfile in the AFD-log-directory:

> `$AFD_WORK_DIR/log/webui.log`

