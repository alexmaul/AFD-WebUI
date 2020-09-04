#!/bin/bash
cd ..
zip -r afd-webui/afd-webui.zip afd-webui/package*.json afd-webui/server.js \
afd-webui/templates afd-webui/scripts afd-webui/public afd-webui/doc
cd -
