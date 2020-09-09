# AFD WebUI Server

## Bound URL paths

<dl>
<dt>`/` + `/ui`</dt><dd>http/https -> index.html.</dd>
<dt>`/view`</dt><dd>http/https, view file from archive.</dd>
<dt>`/ctrl`</dt><dd>ws/wss, afd_ctrl.</dd>
<dt>`/log`</dt><dd>ws/wss, show_log page.</dd>
</dl>

The HTTP/HTTPS variant when loading the HTML pages will determine if the plain
(non-encrypted) or SSL/TLS Websocket variant will be used.
 
All communication between WebUI server and client is done by exchanging JSON 
via Websocket.

## Websocket message

The json-messages in general have these attributes for request and response:

`user` : string:	? user profile.

`class` : string:	<fsa|alias|afd|...>.

`action` : string:	depends on class.

`command` : string:	optional, only some actions have commands,
			eg. read|save|start|stop.

`alias` : [string, ...]:	optional, all alias related actions expect a list
					of alias names.

`text` : string:	optional, if plain text is send/received, eg. the
			text for INFO.

`data` : {}:		optional, general object for data. 


For log window the messages are different.

**Request:**

`class` : string:	"log".

`context` : string: "system|event|transfer|transfer-debug|input|output|delete".

`action` : string:	"list|info".

`filter` : {}:

> `file` : number:	the file number for file-organized logs.
> 
> `level` : string: Regex of log-level letter <I|C|W|E|O|D>.
> 
> `paramSet...	{}` : Object with filter parameter, the names reflect
> 					classes/names in html.


**Response:**

`class` : string:		"log".

`context` : string: 	"system|event|transfer|transfer-debug|input|output|delete".

`action` : string:		"list|info".

`append` : bool:		true|false, if the lines/text should be appended to
						existing log lines.

`lines` : [string]:	log data.

`data` : {}:			optional, object with file info details.

