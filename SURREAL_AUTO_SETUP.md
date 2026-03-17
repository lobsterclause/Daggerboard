# SurrealDB Auto-Setup Guide

## Overview

Daggerboard now includes automatic SurrealDB initialization. When you start the containers, the database schema is automatically created and configured without any manual intervention.

## What Gets Auto-Configured

### Schema Setup
- ✅ **Namespace**: `daggerboard` (auto-created)
- ✅ **Database**: `traces` (auto-created)
- ✅ **5 Tables** with full schema:
  - `traces` - Trace records with indexes
  - `spans` - Individual span data
  - `services` - Service catalog
  - `service_calls` - Service-to-service interactions
  - `_metadata` - Schema version tracking

### Automatic Features
- ✅ Idempotent schema creation (safe to run multiple times)
- ✅ Health checks ensure database is ready before initialization
- ✅ Service dependency ordering prevents race conditions
- ✅ Automatic detection if schema is already initialized
- ✅ Schema version tracking in metadata table

## How It Works

### Initialization Flow

```
1. docker-compose up
    ↓
2. SurrealDB container starts
    ↓
3. Health check waits for SurrealDB to be ready
    ↓
4. surreal-init container launches
    ↓
5. Executes init-surreal.surql script
    ↓
6. Schema created with IF NOT EXISTS clauses
    ↓
7. Metadata recorded for future reference
    ↓
8. Daggerboard app starts (depends on init completion)
    ↓
9. App connects to pre-configured database
    ↓
10. Ready to receive traces!
```

### Key Files

1. **init-surreal.surql** - SQL script defining all tables and schema
2. **docker/surreal-init.sh** - Bash script that executes the SQL
3. **docker-compose.yml** - Service orchestration with health checks
4. **db.ts** - Updated to detect and skip re-initialization

## Running the Auto-Setup

### Production Setup
```bash
docker-compose up
```

The initialization happens automatically:
- SurrealDB starts and initializes schema
- Daggerboard waits for initialization to complete
- All services are up and ready within seconds

### Development Setup
```bash
docker-compose -f docker-compose.dev.yml up
```

Same automatic initialization, but with:
- Hot-reload enabled
- No authentication required
- Development logging

### Check Initialization Status
```bash
# View initialization logs
docker-compose logs surreal-init

# Check if tables exist
docker-compose exec surrealdb surreal sql \
  --endpoint ws://localhost:8000 \
  --user root \
  --pass root \
  "INFO FOR DATABASE"
```

## Schema Details

### Traces Table
```sql
CREATE TABLE traces {
  traceId: string (unique),
  startTime: datetime,
  endTime: datetime,
  durationMs: number,
  status: enum ['success', 'error'],
  errorCount: number,
  spanCount: number,
  rootService: string,
  services: array
}
```

### Spans Table
```sql
CREATE TABLE spans {
  spanId: string (unique),
  traceId: string,
  parentSpanId: string (optional),
  serviceName: string,
  spanName: string,
  kind: number,
  startTime: datetime,
  endTime: datetime,
  durationMs: number,
  status: enum ['success', 'error'],
  attributes: object,
  isOnCriticalPath: boolean
}
```

### Services Table
```sql
CREATE TABLE services {
  name: string (unique),
  firstSeen: datetime,
  lastSeen: datetime,
  traceCount: number,
  errorCount: number,
  avgDurationMs: number
}
```

### Service Calls Table
```sql
CREATE TABLE service_calls {
  fromService: string,
  toService: string,
  callCount: number,
  errorCount: number,
  lastObserved: datetime,
  avgDurationMs: number
}
```

### Metadata Table
```sql
CREATE TABLE _metadata {
  key: string (unique),
  value: any,
  updatedAt: datetime
}
```

Currently tracked metadata:
- `schema_version` - Current schema version (1.0)
- `initialized_at` - When schema was initialized

## Idempotency & Safety

All schema definitions use `IF NOT EXISTS` clauses, making the initialization:

✅ **Safe to run multiple times** - Won't error on re-initialization
✅ **Backward compatible** - Existing data is preserved
✅ **Non-destructive** - Only adds missing tables/indexes
✅ **Fast** - Checks only execute if needed

### What Happens on Re-Run

If you restart the containers:
1. SurrealDB checks for existing schema
2. App detects `_metadata.schema_version` record
3. Skips re-initialization if schema exists
4. Proceeds with normal operation

## Manual Database Operations

### Access SurrealDB Directly

```bash
# Interactive SQL shell
docker-compose exec surrealdb surreal sql \
  --endpoint ws://localhost:8000 \
  --user root \
  --pass root

# Query a table
surreal query "SELECT * FROM traces LIMIT 10;"

# Check schema
surreal query "INFO FOR DATABASE;"
```

### Add Custom Tables/Indexes

If you need to extend the schema:

1. Edit `init-surreal.surql`
2. Add your new table/index definitions
3. Restart containers: `docker-compose down && docker-compose up`

### Backup Database

```bash
# Export all data
docker-compose exec surrealdb surreal export \
  --endpoint ws://localhost:8000 \
  --user root \
  --pass root \
  > backup.surql

# Restore from backup
cat backup.surql | docker-compose exec -T surrealdb surreal import \
  --endpoint ws://localhost:8000 \
  --user root \
  --pass root
```

## Troubleshooting

### Initialization Failed

```bash
# Check logs
docker-compose logs surreal-init

# Verify SurrealDB is healthy
docker-compose ps
```

### Timeout Waiting for SurrealDB

Increase retries in `docker/surreal-init.sh`:
```bash
MAX_RETRIES=60  # More retries
RETRY_INTERVAL=1  # Shorter interval
```

### Schema Not Found

```bash
# Force re-initialization
docker-compose down -v  # Remove volumes
docker-compose up       # Start fresh
```

### Connection Issues

Verify environment variables:
```bash
docker-compose exec daggerboard env | grep DB_PATH
# Should show: DB_PATH=ws://surrealdb:8000
```

## Best Practices

1. **Always use docker-compose** - Ensures proper initialization order
2. **Don't modify schema manually** - Use migrations instead
3. **Backup regularly** - Especially before schema changes
4. **Monitor initialization** - Check `surreal-init` logs on startup
5. **Version control init script** - Track schema changes in git

## Environment Variables

### Production
```env
SURREAL_AUTH=true
SURREAL_USER=root
SURREAL_PASS=root
```

### Development
```env
SURREAL_AUTH=false  # No auth for local development
```

For production deployments, always:
- Change default credentials
- Enable authentication
- Use managed SurrealDB service
- Implement backup strategy

## Next Steps

1. Start containers: `docker-compose up`
2. Access dashboard: `http://localhost:3000`
3. Send OTLP traces: `http://localhost:4318`
4. Traces auto-appear in dashboard ✨
5. Historical data available in database 💾
