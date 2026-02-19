#!/bin/sh
set -e

# Start the API server in the background
node /app/apps/api/dist/api-server.mjs &

# Start nginx in the foreground (PID 1)
exec nginx -g "daemon off;"
