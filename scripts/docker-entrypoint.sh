#!/bin/sh
set -e
# In prod the image is already built; installing again with NODE_ENV=production drops devDeps (e.g. vite)
if [ "$NODE_ENV" != "production" ]; then
  cd /app && yarn install
fi
cd /app && exec "$@"
