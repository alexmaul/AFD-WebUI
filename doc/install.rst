Install
=======

Create Virtual Environment
--------------------------

It is encouraged to install the *AFD Web-UI* in a Python Virtual Environment,
using e.g. `virtualenv` or `conda`.

- *virtualenv*

    ::
        
        cd $AFD_WORK_DIR
        python3 -m venv afdwebui
        source afdwebui/bin/activate
    
- *conda*

    ::
    
        conda create -n afdwebui --file=requirements.txt python=3
        conda activate afdwebui 


Install ``afdwebui``
---------------------

Installing the *AFD Web-UI* package works equally for all sorts of environments,
also if installed in user's Python-context or system-wide.

::

    tar -xf afdwebui.tar
    pip3 install --user -r requirements.txt


Connect with AFD
----------------

The connection between *AFD Web-UI* and any installed/running *AFD* is made by
setting either the environment variable ``AFD_WORK_DIR`` or passing this
directory when starting the *AFD Web-UI* server.

All additional settings are read from the files ``AFD_CONFIG`` and/or 
``afd.wsgi``, both placed in ``$AFD_WORK_DIR/etc``.


Run as Service
--------------

An extensive list how to run the Flask-based and WSGI compatible *AFD Web-UI*
either as a standalone service, or in a web-server/web-framework/container can
be found at `<http://flask.pocoo.org/docs/1.0/deploying/wsgi-standalone/>`_.

Some examples:

- Development server, pure Flask::

    python3 -m afd.webui -vv -p 8040 -w $HOME/afd

- Start *AFD Web-UI* as a WSGI application in `Twisted Web
  <https://twistedmatrix.com/documents/current/web/howto/>`_::

    export AFD_WORK_DIR=$HOME/afd
    twistd --pidfile=twistd.pid web --listen tcp:8040 --wsgi afd.webui.app

