#!/usr/bin/bash
mkdir afd_webui/certs
cd afd_webui/certs
openssl genrsa -out private-key.pem 1024
openssl req -batch -new -key private-key.pem -out csr.pem \
-subj "/C=DE/L=Offenbach/O=German Meteorological Service/emailAddress=afd@dwd.de"
openssl x509 -req -in csr.pem -signkey private-key.pem -out public-cert.pem
