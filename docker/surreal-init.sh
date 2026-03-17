#!/bin/bash

# SurrealDB Initialization Script
# Waits for SurrealDB to be ready, then initializes the schema

set -e

SURREAL_HOST="${SURREAL_HOST:-localhost}"
SURREAL_PORT="${SURREAL_PORT:-8000}"
SURREAL_USER="${SURREAL_USER:-root}"
SURREAL_PASS="${SURREAL_PASS:-root}"
MAX_RETRIES=30
RETRY_INTERVAL=2

echo "⏳ Waiting for SurrealDB to be ready at $SURREAL_HOST:$SURREAL_PORT..."

# Wait for SurrealDB to be healthy
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

# Initialize schema
echo "📦 Initializing SurrealDB schema..."

surreal query \
  --endpoint "http://$SURREAL_HOST:$SURREAL_PORT" \
  --user "$SURREAL_USER" \
  --password "$SURREAL_PASS" \
  < /docker/init-surreal.surql

if [ $? -eq 0 ]; then
  echo "✓ Schema initialization completed successfully"
else
  echo "✗ Schema initialization failed"
  exit 1
fi

echo "✓ SurrealDB is ready to use!"
