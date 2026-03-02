#!/bin/sh
set -e
# Install deps so anonymous volumes (node_modules) match host package.json
cd /app && yarn install
cd /app/backend && yarn install
cd /app/frontend && yarn install
cd /app && exec "$@"
