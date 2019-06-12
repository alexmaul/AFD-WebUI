HTTP Resources
==============

There are two types of HTTP resources in *AFD Web-UI*: static HTML pages, and
URL which are bound REST-like to function calls.
 
Static Pages
------------

Static content for user access. Pages are served "as-is", without processing.

.. topic:: List of URL:

    - `/static/html/afd-gui.html <#sh-gui>`_

    - `/static/html/afd-log.html[?alias-list][#log-type] <#_sh-log>`_

    - `/static/html/afd-hcedit.html <#sh-hced>`_

It is safe to directly address the pages listed from a browser (by i.e.
bookmarks). They are all accessible via the menu-bar on the *AFD-control* page.


.. _sh-gui:

- ``/static/html/afd-gui.html``

    *AFD-control* page, replication of the *afd_ctrl*'s *Motif*-window.
    
    The root URL ``/`` redirects to this page.


.. _sh-log:

- ``/static/html/afd-log.html[?alias-list][#log-type]``

    HTML-page for all log-windows as tabs.
    
    The optional ``#log-type`` activates the page's tabula showing the 
    *log-type* filter and log information lines.
    
    Allowed *log-type* names:
        
        ``system``, ``event``, ``receive``, ``transfer``, ``transfer-debug``,
        ``input``, ``output``, ``delete``, ``queue``
    
    The parameter ``?alias-list``, where the *alias-list* is a comma-seperated 
    (**no whitespace!**) list of hostnames, pre-set in the *recipient* filter 
    field.
    
    Example:

        ::
        
            http://localhost:8040/static/html/afd-log.html?local,localhost#output
        
        Opens AFD-Log-page, activates tab *output*, fills the filter field
        *recipient* with "*local,localhost*".


.. _sh-hced:

- ``/static/html/afd-hcedit.html``

    HTML-form-page for editing the *HOST_CONFIG* settings.


REST Adresses
-------------

The following REST-methods are supported.

.. topic:: List of URL:

    - `Root-URL "/" <#root>`_

    - `/fsa/json <#fsa>`_

    - `/alias/info/<name> <#al-inf>`_

    - `/alias/config/<name> <#al-cfg>`_

    - `/alias/<action> <#al-act>`_

    - `/afd/<command> <#afd-cmd>`_

    - `/afd/<command>/<name> <#afd-cmd>`_

    - `/afd/<command>/<action> <#afd-cmd>`_

    - `/log/<typ> <#log>`_

    - `/view/<mode>/<path:arcfile> <#view>`_

All HTML-Responses have the MIME-type *"text/plain"*, except if noted otherwise.


.. _root:

- Root-URL ``/``
    
    Request-method: GET
        
    HTTP-Status-code: 303
    
    Always redirects to the static `AFD-control page`.
    
    This (and the static page it redirects to) is the only URL a user should 
    request. Otherwise the dependant JS, CSS, etc files might not be loaded. 


.. _fsa:

- ``/fsa/json``

    Request fsa-status information as JSON.
    
    Request-method: GET
    
    HTTP-Status-code: 200, 500
    
    Content-type: *application/json*
    
    HTTP-Response:
        ``{"data": [{...}, ...]}``


.. _al-inf:
    
- ``/alias/info/<name>``

    - Retrieve host information (including INFO-file) for host `name`.
        
        Request-method: GET
        
        HTTP-Status-code: 200, 404
        
        Content-type: *text/html*
        
    - Save (edited) text in INFO-file for host `name`.
    
        Request-method: POST
        
        Request-body: key = *text*, value = *plain text*.

        HTTP-Status-code: 204, 500


.. _al-cfg:

- ``/alias/config/<name>``

    Retrieve configuration details from DIR_CONFIG(s) for host `name`.
        
    Request-method: GET
    
    HTTP-Status-code: 200, 404


.. _al-act:

- ``/alias/<action>``

    All actions target alias entries. A selection in the UI-page is required.
    Actions work on one or more selected alias entries.
    
    List of actions: 
        ``start``, ``stop``, ``able`` (enable/disable), ``debug``, ``trace``, 
        ``fulltrace``, ``switch``, ``retry``

    Request-method: POST
    
    Request-body:
        List of one ore more alias names, comma-seperated.
        
        ``alias: NAME,[NAME],...``
        
    HTTP-Status-code: 204


.. _afd-cmd:

- ``/afd/<command>`` and ``/afd/<command>/<host>``
    
    List of *command/host*:

    - ``hc`` : read full HOST_CONFIG, returning JSON formatted data
    - ``hc/<hostname>`` : read HOST_CONFIG, returns JSON formatted data for
      given hostname.

    Request-method: GET

    HTTP-Status-code: 200, 500

    Content-type: *application/json*
    
    HTTP-Response:
        ``{"order": [], "data": {alias: {...}}}``


- ``/afd/<command>/<action>``
    
    List of *command/action*:
    
    ``amg/toggle``, ``fd/toggle``, ``dc/update``, ``afd/start``, ``afd/stop``
    
    ``hc/update``
        Save edited configuration in HOST_CONFIG.
        
        Request-body: ``{"order": [], "data": {alias: {...}}}``

    Request-method: POST

    HTTP-Status-code: 204, 500


.. _log:

- ``/log/<typ>``
    
    Typ:
        ``system``, ``event``, ``receive``, ``transfer``, ``transfer-debug``,
        ``input``, ``output``, ``delete``, ``queue``
    
    Request-method: POST
    
    Request-body:
        Set of parameter specifying filter options for the selected 
        log-information.
        
    HTTP Status-code: 200, 204
    
    - File-related log-data: 
        Content-type: *text/plain*
        
        HTTP Response: Pre-formated text.
    
    - ALDA log-data: 
        Content-type: *text/html*

        HTTP Response: HTML-fragment, content for <tbody>.


.. _view:

- ``/view/<mode>/<path:arcfile>``

    `mode`: ``auto``, ``bufr``, etc.
        Specifies program to execute as configured in AFD_CONFIG.
        
        ``auto`` determines the MIME-type (using *libmagic*, like *file(1)*).
        
        If the type is *application/octet-stream* and the file most propably in
        WMO-FM-format (bulletin), a web-service for (BUFR-)decoding is called.
        
        Otherwise the content-type of the response is set accordingly to the 
        MIME-type and interpretation is left to the user's browser.
    
    `arcfile`: path/filename of archived file in AFD archive.
    
    Request-method: GET
    
    HTTP Status-code: 200, 204
    
    Content-type: depends on program output and/or file type.


Additional Static Files
-----------------------
The following static files are referenced from the HTML pages and loaded 
automaticaly from the browser. There's no reason to access them expicitly.

- ``/static/css/``

    - ``afd-gui.css``

    - ``bootstrap.min.css``

    - ``bootstrap.min.css.map``

- ``/static/js/``

    - ``afd-gui.js``

    - ``afd-log.js``

    - ``afd-edit.js``

    - ``bootstrap.bundle.min.js``

    - ``excanvas.min.js``

    - ``jquery-3.4.0.min.js``

    - ``npm.js``

