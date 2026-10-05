#!/usr/bin/env bash
set -euo pipefail
CERT_DIR=/home/karr/kitt-ai/certs
CERT_FILE="$CERT_DIR/cert.pem"
KEY_FILE="$CERT_DIR/key.pem"
install -d -m 700 "$CERT_DIR"
if [[ ! -s "$CERT_FILE" || ! -s "$KEY_FILE" ]]; then
  umask 077
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 \\
    -keyout "$KEY_FILE" -out "$CERT_FILE" \\
    -subj "/CN=192.168.129.25" \\
    -addext "subjectAltName=IP:192.168.129.25,DNS:localhost" \\
    >/dev/null 2>&1
fi
chmod 600 "$KEY_FILE"
chmod 644 "$CERT_FILE"
