**Restriction:**

> For each AFD instance **only one** *AFD Web-UI* server should be started.
>
> Never use the same AFD_WORK_DIR for multiple *AFD Web-UI* servers.
> 
> Because:  
> There are actions, like start/stop host, which could conflict otherwise if two 
> or more Web-UI servers command the same AFD instance.
> Also the PID would be stored in the same file, leaving all but one server unable
> to stop (thus requiring a `kill`).

There's little chance two server using the same TCP port might be started,
since the second one should find the required TCP port already bound.

But ... as with the other AFD user interfaces, there's no hinderance for
multiple users opening and using the *AFD Web-UI* pages from the same server,
working with the same AFD instance.

### Run as a Service

Include the start/stop command lines in any script fitting your operating 
system's service management.

### Start/Stop Server

1. Change into project directory.\
   (This is important for the Node interpreter to find the module directory.)

1. Start the NodeJS server with the *AFD Web-UI* application:

	   $> node server.js [command] [options]

Commands:

	start    Start WebUI server.
	
	stop     Stop WebUI server.
	
	status   Print short status info and exit with 0=running or 1=stopped.

General options:

	--afd_work_dir, -w:  AFD work directory, per instance. [string]
	
	--version:           Show version tag [boolean]
	
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
