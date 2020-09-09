## Bound URL paths

<dl>
<dt>/ + /ui</dt>
<dd>http/https -> index.html.</dd>

<dt>/view</dt>
<dd>http/https, view file from archive.</dd>

<dt>/ctrl</dt>
<dd>ws/wss, afd_ctrl.</dd>

<dt>/log</dt>
<dd>ws/wss, show_log page.</dd>
</dl>

The HTTP/HTTPS variant when loading the HTML pages will determine if the plain
(non-encrypted) or SSL/TLS Websocket variant will be used.
 
All communication between WebUI server and client is done by exchanging JSON 
via Websocket.

## Websocket message

The json-messages in general have the same set of attributes for request and response.

<dl>
<dt>user</dt>
<dd><i>string</i> : user profile.</dd>

<dt>class</dt>
<dd><i>string</i> : <fsa|alias|afd|...>.</dd>

<dt>action</dt>
<dd><i>string</i> : depends on class.</dd>

<dt>command</dt>
<dd><i>string</i> : optional, only some actions have commands, eg. read|save|start|stop.</dd>

<dt>alias</dt>
<dd><i>[ string ]</i> : optional, all alias related actions expect a list of alias names.</dd>

<dt>text</dt>
<dd><i>string</i> : optional, if plain text is send/received, eg. the text for INFO.</dd>

<dt>data</dt>
<dd><i>object</i> : optional, general object for data.</dd>
</dl>

For log window the messages are different.

### Log Request:

<dl>
<dt>class</dt>
<dd><i>string</i> : "log".</dd>

<dt>context</dt>
<dd><i>string</i> : "system|event|transfer|transfer-debug|input|output|delete".</dd>

<dt>action</dt>
<dd><i>string</i> : "list|info".</dd>

<dt>filter</dt>
<dd><i>object</i> : </dd>

<dl>
<dt>file</dt>
<dd><i>number</i> : the file number for file-organized logs.</dd>

<dt>level</dt>
<dd><i>string</i> : Regex of log-level letter <I|C|W|E|O|D>.</dd>

<dt>paramSet</dt>
<dd><i>object</i> : Object with filter parameter, the names reflect classes/names in html.</dd>
</dl>

</dl>

### Log Response:

<dl>
<dt>class</dt>
<dd><i>string</i> : "log".</dd>

<dt>context</dt>
<dd><i>string</i> : "system|event|transfer|transfer-debug|input|output|delete".</dd>

<dt>action</dt>
<dd><i>string</i> : "list|info".</dd>

<dt>append</dt>
<dd><i>bool</i> : true|false, if the lines/text should be appended to existing log lines.</dd>

<dt>lines</dt>
<dd><i>[ string ]</i> : log data.</dd>

<dt>data</dt>
<dd><i>object</i> : optional, object with file info details.</dd>
</dl>
