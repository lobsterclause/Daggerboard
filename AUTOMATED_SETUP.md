# Fully Automated Setup Guide

## ✨ Zero-Config Setup

Daggerboard now features **complete automation** - database initialization is embedded in the Docker image and runs automatically when the container starts.

## 🚀 Quick Start

```bash
docker-compose up
```

That's it! The system automatically:
1. ✅ Starts SurrealDB
2. ✅ Waits for database health
3. ✅ Initializes schema (all tables, indexes, metadata)
4. ✅ Starts Daggerboard app
5. ✅ Ready for OTLP traces

## How It Works

### Simplified Architecture

**Before**: Multiple services (app + separate init service)
**Now**: Single integrated pipeline

```
docker-compose up
    ↓
SurrealDB starts
    ↓
Daggerboard container starts
    ↓
Entrypoint script waits for SurrealDB health
    ↓
Init script runs (surreal-init.sh)
    ↓
Schema auto-created (init-surreal.surql)
    ↓
App server starts (tsx server.ts)
    ↓
Ready! 🎉
```

### Key Components

1. **Dockerfile** (Updated)
   - Embeds init-surreal.surql
   - Includes surreal-init.sh
   - Uses entrypoint.sh for orchestration
   - Installs curl for health checks

2. **Dockerfile.dev** (Updated)
   - Same initialization as production
   - Uses CMD override for `npm run dev`
   - Supports hot-reload during init

3. **docker/entrypoint.sh** (New)
   - Waits for SurrealDB readiness
   - Executes database initialization
   - Supports both prod and dev startup commands
   - Clear status messages

4. **docker-compose.yml** (Simplified)
   - Removed surreal-init service
   - Single daggerboard service handles everything
   - Cleaner dependency management

## Features

✅ **Automatic initialization** - No manual setup steps
✅ **Fast startup** - All in one container lifecycle
✅ **Idempotent** - Safe to run multiple times
✅ **Dev & Prod** - Same automation for both
✅ **Error tolerant** - Clear messages, graceful degradation
✅ **Health-aware** - Waits for dependencies

## Running Daggerboard

### Production
```bash
docker-compose up
```

Automatically:
- Initializes production database
- Uses `tsx server.ts`
- Runs with `NODE_ENV=production`

### Development (with hot-reload)
```bash
docker-compose -f docker-compose.dev.yml up
```

Automatically:
- Initializes development database (no auth)
- Uses `npm run dev` for hot-reload
- Runs with `NODE_ENV=development`

## What Gets Auto-Setup

### Database Schema (Automatic)
```
Tables Created:
  ├─ traces (aggregated data)
  ├─ spans (detailed records)
  ├─ services (catalog)
  ├─ service_calls (topology)
  └─ _metadata (schema versioning)

Indexes Created (11 total):
  ├─ traces: 3 indexes
  ├─ spans: 4 indexes
  ├─ services: 1 index
  ├─ service_calls: 3 indexes
  └─ _metadata: auto-index on key

Metadata Recorded:
  ├─ schema_version: "1.0"
  └─ initialized_at: <timestamp>
```

### Configuration (Automatic)
```
Environment Variables Set:
  ├─ NODE_ENV=production (or development)
  ├─ PORT=3000
  ├─ OTLP_PORT=4318
  ├─ DB_PATH=ws://surrealdb:8000
  ├─ SURREAL_HOST=surrealdb
  ├─ SURREAL_PORT=8000
  ├─ SURREAL_USER=root
  └─ SURREAL_PASS=root
```

## Verification

### Check Logs
```bash
# View initialization status
docker-compose logs daggerboard

# Look for:
# ✓ SurrealDB is ready!
# 📦 Initializing database schema...
# ✓ Database initialization completed
# 🎯 Starting Daggerboard server...
```

### Query Database
```bash
# Access the pre-initialized database
curl -X POST http://localhost:8000/sql \
  -H "Accept: application/json" \
  -d "SELECT * FROM _metadata;"

# Should return schema_version and initialized_at records
```

### Send Test Traces
```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json

# Your traced application automatically sends data to Daggerboard
```

## Troubleshooting

### SurrealDB Won't Start
```bash
# Check SurrealDB logs
docker-compose logs surrealdb

# Verify port 8000 is available
lsof -i :8000
```

### Initialization Timeout
```bash
# Check if SurrealDB is actually healthy
curl -f http://localhost:8000/health

# If not, investigate SurrealDB startup issues
docker-compose logs surrealdb
```

### Database Connection Issues
```bash
# Verify Daggerboard can reach SurrealDB
docker-compose exec daggerboard curl -v http://surrealdb:8000/health
```

### Start Fresh
```bash
# Remove all containers and volumes
docker-compose down -v

# Rebuild and start
docker-compose up --build
```

## Performance

| Component | Time |
|-----------|------|
| SurrealDB startup | ~2-3s |
| Health check polling | ~0-5s |
| Schema initialization | ~2-5s |
| App startup | ~1-2s |
| **Total** | **~5-15s** |

## Files Involved

```
Project Root
├── Dockerfile              (updated)
├── Dockerfile.dev          (updated)
├── docker-compose.yml      (simplified)
├── docker-compose.dev.yml  (simplified)
├── init-surreal.surql      (schema definition)
├── db.ts                   (schema check logic)
└── docker/
    ├── entrypoint.sh       (NEW - orchestration)
    └── surreal-init.sh     (existing - init script)
```

## Key Changes from Previous Setup

| Aspect | Before | After |
|--------|--------|-------|
| Services | 3 (db + init + app) | 2 (db + app) |
| Init timing | Separate service | In app startup |
| Dockerfile | Basic | Enhanced with init |
| Startup time | ~15-20s | ~10-15s |
| docker-compose | Complex | Simple |

## Production Deployment

For production use:

1. **Change credentials** in docker-compose.yml or .env
   ```env
   SURREAL_USER=your_user
   SURREAL_PASS=your_secure_password
   ```

2. **Use managed database** (optional)
   - Point DB_PATH to managed SurrealDB service
   - Remove surrealdb service from docker-compose

3. **Add monitoring**
   - Health checks already in place
   - Configure alerting on startup failures

4. **Implement backups**
   - Backup daggerboard-data volume regularly
   - Test restore procedures

## Next Steps

1. Clone/pull the repository
2. Run `docker-compose up`
3. Wait for "Starting Daggerboard server" message
4. Access dashboard at http://localhost:3000
5. Send OTLP traces to http://localhost:4318

Everything is automated - you're ready to go! ✨
