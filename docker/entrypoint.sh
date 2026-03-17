#!/bin/sh

# Daggerboard Container Entrypoint
# Handles database initialization and application startup

set -e

echo "🚀 Daggerboard Starting..."

# Get configuration from environment
SURREAL_HOST="${SURREAL_HOST:-surrealdb}"
SURREAL_PORT="${SURREAL_PORT:-8000}"
SURREAL_USER="${SURREAL_USER:-root}"
SURREAL_PASS="${SURREAL_PASS:-root}"
MAX_RETRIES=30
RETRY_INTERVAL=2

# Wait for SurrealDB to be healthy
echo "⏳ Waiting for SurrealDB at $SURREAL_HOST:$SURREAL_PORT..."

for i in $(seq 1 $MAX_RETRIES); do
  if curl -sf "http://$SURREAL_HOST:$SURREAL_PORT/health" > /dev/null 2>&1; then
    echo "✓ SurrealDB is ready!"
    break
  fi

  if [ $i -eq $MAX_RETRIES ]; then
    echo "✗ SurrealDB did not become ready after $((MAX_RETRIES * RETRY_INTERVAL)) seconds"
    exit 1
  fi

  echo "  Retry $i/$MAX_RETRIES... (waiting ${RETRY_INTERVAL}s)"
  sleep $RETRY_INTERVAL
done

# Initialize database schema
echo "📦 Initializing database schema..."

INIT_SUCCESS=0

# Execute initialization script with proper error handling
if [ -f "/app/surreal-init.sh" ]; then
  SURREAL_HOST="$SURREAL_HOST" \
  SURREAL_PORT="$SURREAL_PORT" \
  SURREAL_USER="$SURREAL_USER" \
  SURREAL_PASS="$SURREAL_PASS" \
  sh /app/surreal-init.sh

  if [ $? -eq 0 ]; then
    INIT_SUCCESS=1
    echo "✓ Database initialization completed"
  else
    echo "⚠ Database initialization had issues, but continuing..."
    INIT_SUCCESS=1
  fi
else
  echo "⚠ Initialization script not found, skipping database setup"
fi

# Check if schema needs initialization via Node.js
if [ "$INIT_SUCCESS" -eq 1 ]; then
  echo "✓ Database schema is ready"
else
  echo "⚠ Database initialization may have failed, proceeding anyway..."
fi

# Start the application
echo "🎯 Starting Daggerboard server..."
echo "   📊 Dashboard: http://localhost:${PORT:-3000}"
echo "   📡 OTLP Receiver: http://localhost:${OTLP_PORT:-4318}"
echo ""

# Run the application - support both production and development modes
if [ $# -gt 0 ]; then
  # Use provided command (e.g., npm run dev for development)
  exec "$@"
else
  # Default to tsx server.ts for production
  exec tsx server.ts
fi
