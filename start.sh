#!/bin/bash
set -e

# Start the Python FastAPI VADER sidecar in the background
echo "Starting Python FastAPI VADER sidecar on port 8000..."
cd /app/python
python3 -m uvicorn main:app --host 127.0.0.1 --port 8000 &
PYTHON_PID=$!

# Wait for sidecar to be ready
echo "Waiting for Python sidecar to be available..."
cd /app
for i in {1..20}; do
  if curl -s http://127.0.0.1:8000/health > /dev/null; then
    echo "Python VADER sidecar is ready!"
    break
  fi
  sleep 1
done

# Start the Node.js / Express web server
echo "Starting Express / Vite application on port ${PORT:-3000}..."
export PYTHON_URL="http://127.0.0.1:8000"
export NODE_ENV="production"
npx tsx server.ts
