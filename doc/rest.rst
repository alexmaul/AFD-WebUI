HTTP Resources
==============

.. contents::

Static Pages
------------

Static content.

It is safe to directly address the pages listed from a browser (by i.e.
bookmarks). They are all accessible via the menu-bar on the *AFD-control* page.


``/static/html/afd-gui.html``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    AFD-control-window, replication of the *afd_ctrl*'s *Motif*-window. 


``/static/html/afd-log.html[?alias-list][#log-type]``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    HTML-page for all log-windows as tabs.
    
    The optional ``#log-type`` activates the page's tabula showing the 
    *log-type* filter and log information lines.
    
    Allowed *log-type* names:
        
        ``system``, ``event``, ``receive``, ``transfer``, ``transfer-debug``,
        ``input``, ``output``, ``delete``, ``queue``
    
    The parameter ``?alias-list``, where the *alias-list* is a comma-seperated 
    (**no whitespace!**) list of hostnames pre-set in the *recipient* filter 
    field.
    
    Example:

        ::
        
            http://localhost:8040/static/html/afd-log.html?local,localhost#output
        
        Opens AFD-Log-page, activates tab *output*, fills the filter field
        *recipient* with "*local,localhost*".


``/static/html/afd-hcedit.html``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    HTML-form-page for editing the *HOST_CONFIG* settings.

REST Adresses
-------------

The following REST-methods are supported.

All HTML-Responses have the MIME-type *"text/plain"*, except if noted otherwise.



``/``
~~~~~
    
    Request-method: GET
        
    HTTP-Status-code: 303
    
    Always redirects to the main AFD-control-window page.
    
    This (and the static page it redirects to) is the only URL a user should 
    request. Otherwise the dependant JS, CSS, etc files might not be loaded. 


``/fsa/json``
~~~~~~~~~~~~~

    Request fsa-status information as JSON.
    
    Request-method: GET
    
    HTTP-Status-code: 200, 500
    
    Content-type: *application/json*
    
    HTTP-Response:
        ``{"data": [{...}, ...]}``
    
    
``/alias/info/<name>``
~~~~~~~~~~~~~~~~~~~~~~

    - Retrieve host information (including INFO-file) for host `name`.
        
        Request-method: GET
        
        HTTP-Status-code: 200, 404
        
        Content-type: *text/html*
        
    - Save (edited) text in INFO-file for host `name`.
    
        Request-method: POST
        
        Request-body: key = *text*, value = *plain text*.

        HTTP-Status-code: 204, 500


``/alias/config/<name>``
~~~~~~~~~~~~~~~~~~~~~~~~

    Retrieve configuration details from DIR_CONFIG(s) for host `name`.
        
    Request-method: GET
    
    HTTP-Status-code: 200, 404


``/alias/<action>``
~~~~~~~~~~~~~~~~~~~

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


``/afd/<command>/<action>``
~~~~~~~~~~~~~~~~~~~~~~~~~~~
    
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
~~~~~~~~~~~~~~
    
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


``/view/<mode>/<path:arcfile>``
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

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


