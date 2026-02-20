#!/bin/sh
set -e

# Start the API server in the background
node /app/apps/api/dist/api-server.mjs &
NODE_PID=$!

# Wait for the API server to become healthy before starting nginx
MAX_RETRIES=30
SLEEP_SECONDS=2
i=0
while [ "$i" -lt "$MAX_RETRIES" ]; do
    if ! kill -0 "$NODE_PID" 2>/dev/null; then
        echo "API server process exited before becoming healthy"
        exit 1
    fi
    if node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))" 2>/dev/null; then
        echo "API server is healthy"
        break
    fi
    i=$((i + 1))
    sleep "$SLEEP_SECONDS"
done

if [ "$i" -ge "$MAX_RETRIES" ]; then
    echo "API server failed to become healthy after $((MAX_RETRIES * SLEEP_SECONDS)) seconds"
    kill "$NODE_PID" 2>/dev/null || true
    exit 1
fi

# Graceful shutdown — forward SIGTERM/SIGINT to both processes
shutdown() {
    if [ -n "${NGINX_PID}" ] && kill -0 "${NGINX_PID}" 2>/dev/null; then
        kill -TERM "${NGINX_PID}" 2>/dev/null || true
    fi
    if kill -0 "${NODE_PID}" 2>/dev/null; then
        kill -TERM "${NODE_PID}" 2>/dev/null || true
    fi
    wait "${NGINX_PID}" 2>/dev/null || true
    wait "${NODE_PID}" 2>/dev/null || true
}

trap shutdown TERM INT

# Start nginx in the background so we can manage both processes
nginx -g "daemon off;" &
NGINX_PID=$!

# Wait for nginx to exit; if it exits, clean up and propagate the status
wait "${NGINX_PID}" 2>/dev/null
NGINX_STATUS=$?

wait "${NODE_PID}" 2>/dev/null || true

exit "${NGINX_STATUS}"
