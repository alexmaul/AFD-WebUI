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
    
``/alias/<path:action>``

    All actions target alias entries. A selection in the UI-page is required.
    
    - Action: start, stop, able, debug, trace, fulltrace, switch, retry

        Work on one or more alias entries.
        
        Request-method: POST
        
        Request-body:
            List of one ore more alias names, comma-seperated.
            ``alias: NAME,[NAME],...``
            
        HTTP-Status-code: 204
            
    - Action: info/<alias>, config/<alias>

        Work on exactly one alias.

        Request-method: GET
    
        HTTP-Status-code: 200, 404

``/afd/<command>/<action>``
    - List of ``command: action``:
        
        amg, fd: toggle
        
        dc, hc: update
        
        afd: start, stop
        
        Request-method: GET

        HTTP-Status-code: 204

    - hc: change
        Request-method: POST

        HTTP-Status-code: 204, 500

``/alda/<typ>``
    
    Typ: system, event, receive, transfer, input, output, delete
    
    Request-method: POST
    
    Request-body:
        Set of parameter specifying filter options for the selected 
        log-information.

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

