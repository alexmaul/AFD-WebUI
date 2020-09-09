# AFD Web-UI

Welcome to **AFD Browser-based UI**'s documentation!

This documentation covers the installation and use of *AFD Web-UI*.
This web-application for any browser gives access to AFD without the need of 
X-Window + Motif.

If you are looking for information about using AFD in general and/or how to 
interact with any AFD UI (including this), please read
the [AFD documentation](https://download.dwd.de/pub/afd/doc/).

AFD source: [https://github.com/holger24/AFD](https://github.com/holger24/AFD).

As it is common for web-applications, there is a server-part and a client-part.

The server-side is a ECMAscript application for *NodeJS*, the client runs on 
HTML5+CSS+Javascript.

## Tutorials

Please read the Markdown files in `doc/` -- or build the tutorial pages with
```
npm install --only=dev
npm run jsdoc
```
The html files are generated in `doc/html/`.
