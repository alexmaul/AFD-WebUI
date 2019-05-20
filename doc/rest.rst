AFD Browser-based UI
====================

REST
----

The following REST-methods are supported.

All HTML-Responses have the MIME-type *"text/plain"*, except if noted otherwise.

``/``
    Request-method: GET
        
    HTTP-Status-code: 303
    
    Always redirects to the main AFD-control-window page.
    
    This (and the static page it redirects to) is the only URL a user should 
    request. Otherwise the dependant JS, CSS, etc files might not be loaded. 
    
``/fsa/json``

    Request fsa-status information as JSON.
    
    Request-method: GET
    
    HTTP-Status-code: 200, 500
    
    Content-type: *application/json*
    
    HTTP-Response:
        ``{"data": [{...}, ...]}``
    
``/alias/info/<name>``

    - Retrieve host information (including INFO-file) for host `name`.
        
        Request-method: GET
        
        HTTP-Status-code: 200, 404
        
        Content-type: *text/html*
        
    - Save (edited) text in INFO-file for host `name`.
    
        Request-method: POST
        
        Request-body: key = *text*, value = *plain text*.

        HTTP-Status-code: 204, 500

``/alias/config/<name>``

    Retrieve configuration details from DIR_CONFIG(s) for host `name`.
        
    Request-method: GET
    
    HTTP-Status-code: 200, 404

``/alias/<action>``

    All actions target alias entries. A selection in the UI-page is required.
    
    List of actions: start, stop, able, debug, trace, fulltrace, switch, retry

    Work on one or more alias entries.
    
    Request-method: POST
    
    Request-body:
        List of one ore more alias names, comma-seperated.
        ``alias: NAME,[NAME],...``
        
    HTTP-Status-code: 204
            
``/afd/<command>/<action>``
    
    List of *command/action*:
    ``amg/toggle``, ``fd/toggle``, ``dc/update``, ``afd/start``, ``afd/stop``
    
    ``hc/update``
        Trigger HOST_CONFIG re-read.
    
    ``hc/save``
        Save edited configuration in HOST_CONFIG.
        
        Request-body: *key:value* list.

    Request-method: POST

    HTTP-Status-code: 204, 500

``/log/<typ>``
    
    Typ:
        ``system``, ``event``, ``receive``, ``transfer``, ``transfer-debug``,
        ``input``, ``output``, ``delete``, ``queue``
    
    Request-method: POST
    
    Request-body:
        Set of parameter specifying filter options for the selected 
        log-information.

``/view/<mode>/<path:arcfile>``

    `mode`: *auto*, *bufr*, etc. Specifies program to execute as configured in
    AFD_CONFIG.
    
    `arcfile`: path/filename of archived file in AFD archive.
    
    Request-method: GET
    
    HTTP Status-code: 200, 204
    
    Content-type: depends on program output and/or file type.


Static Files
~~~~~~~~~~~~

Static content.

It is safe to directly address the pages listed from a browser (by i.e.
bookmarks). They are all accessible via the menu-bar on the *AFD-control* page.

``/static/html/afd-gui.html``
    AFD-control-window, replication of the *afd_ctrl*'s *Motif*-window. 

``/static/html/afd-log.html``
    HTML-page for all log-windows as tabs.

``/static/html/afd-hcedit.html``
    HTML-form-page for editing the *HOST_CONFIG* settings.

