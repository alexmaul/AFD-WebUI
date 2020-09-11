# AFD Web-UI

Documentation for **AFD's Browser-based User Interface**.

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

## TODO

- There are still some functions not implemented -- these are grey/disabled in the
  control-window's menu.

- The *directory control* is still missing.

- Long sought after in AFD ... the DIR_CONFIG editor!

## Licence and Disclaimer

*Author(s):*

DWD/amaul <alexander.maul@dwd.de>

*License:*

GPLv2 or any later version\
[https://www.gnu.org/licenses/old-licenses/gpl-2.0.html](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html)

> This program is free software; you can redistribute it and/or modify
> it under the terms of the GNU General Public License as published by
> the Free Software Foundation; either version 2 of the License, or
> (at your option) any later version.
> 
> This program is distributed in the hope that it will be useful,
> but WITHOUT ANY WARRANTY; without even the implied warranty of
> MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
> GNU General Public License for more details.
> 
> You should have received a copy of the GNU General Public License
> along with this program; if not, write to the Free Software
> Foundation, Inc., 675 Mass Ave, Cambridge, MA 02139, USA.
