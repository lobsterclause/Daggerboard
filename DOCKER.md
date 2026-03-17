# Docker Setup Guide

## ⚡ One-Command Setup

```bash
docker-compose up
```

Everything is automatic:
- ✅ Starts SurrealDB database
- ✅ Initializes schema (tables, indexes, metadata)
- ✅ Starts Daggerboard application
- ✅ Ready for traces (~10-15 seconds)

**No manual configuration needed.**

## 🚀 Services

### Daggerboard Application
- **Dashboard**: http://localhost:3000
- **OTLP Receiver**: http://localhost:4318
- **Node.js** multi-stage build
- **Hot-reload support** in dev mode

### SurrealDB Database
- **Connection**: ws://localhost:8000
- **Credentials**: root / root (change in production)
- **Storage**: Persistent volume (`daggerboard-data`)
- **Auth**: Enabled (production ready)

## 📦 What Gets Auto-Initialized

### Database Schema
```
Namespace: daggerboard
Database: traces
├─ traces (aggregated span data)
├─ spans (detailed span records)
├─ services (service catalog)
├─ service_calls (service topology)
└─ _metadata (schema version tracking)
```

### Indexes Created (11 Total)
- **traces**: 3 indexes (by traceId, startTime, status)
- **spans**: 4 indexes (by spanId, traceId, serviceName, startTime)
- **services**: 1 index (by name)
- **service_calls**: 3 indexes (by from_to, from, to)

### Environment Variables
```env
NODE_ENV=production
PORT=3000
OTLP_PORT=4318
DB_PATH=ws://surrealdb:8000
SURREAL_USER=root
SURREAL_PASS=root
```

## 🔧 Common Commands

### Start Production
```bash
docker-compose up
```

### Start with Hot-Reload (Development)
```bash
docker-compose -f docker-compose.dev.yml up
```

### Stop Containers
```bash
docker-compose down
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f daggerboard
docker-compose logs -f surrealdb
```

### Rebuild Images
```bash
docker-compose up --build
```

### Remove Everything (Fresh Start)
```bash
docker-compose down -v
docker-compose up
```

## 📊 Database Access

### Query Database Directly
```bash
# Interactive SQL shell
docker-compose exec surrealdb surreal sql \
  --endpoint ws://localhost:8000 \
  --user root \
  --pass root
```

### Query from Command Line
```bash
curl -X POST http://localhost:8000/sql \
  -H "Accept: application/json" \
  -H "Authorization: Basic cm9vdDpyb290" \
  -d "SELECT * FROM traces LIMIT 10;"
```

### Check Schema
```bash
docker-compose exec surrealdb surreal sql \
  --endpoint ws://localhost:8000 \
  --user root \
  --pass root <<EOF
INFO FOR DATABASE;
EOF
```

## 🔐 Configuration

Environment variables can be customized in `docker-compose.yml`:

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_ENV` | `production` | Runtime environment |
| `PORT` | `3000` | Dashboard port |
| `OTLP_PORT` | `4318` | OTLP receiver port |
| `DB_PATH` | `ws://surrealdb:8000` | Database connection |
| `SURREAL_USER` | `root` | Database username |
| `SURREAL_PASS` | `root` | Database password |

### Change Ports
Edit `docker-compose.yml`:
```yaml
ports:
  - "8080:3000"      # Dashboard on 8080
  - "4319:4318"      # OTLP on 4319
```

### Change Credentials
Edit `docker-compose.yml`:
```yaml
environment:
  SURREAL_USER: myuser
  SURREAL_PASS: mysecurepassword
```

## 🔄 Development Workflow

### With Hot-Reload
```bash
docker-compose -f docker-compose.dev.yml up
```

Changes to source files are automatically reflected without restart.

### Ports Available
- `3000` - Dashboard (hot-reload enabled)
- `4318` - OTLP receiver
- `5173` - Vite dev server
- `8000` - SurrealDB

## 🚨 Troubleshooting

### Port Already in Use
```bash
# Find what's using the port
lsof -i :3000

# Change port in docker-compose.yml and retry
```

### SurrealDB Won't Start
```bash
# Check logs
docker-compose logs surrealdb

# Verify port 8000 is free
lsof -i :8000
```

### Initialization Failed
```bash
# Check initialization logs
docker-compose logs daggerboard

# Look for "✓ Database initialization completed"
```

### Connection Timeout
```bash
# Verify container is running
docker-compose ps

# Check network connectivity
docker-compose exec daggerboard curl http://surrealdb:8000/health
```

### Start Fresh
```bash
# Remove all containers and volumes
docker-compose down -v

# Rebuild and start
docker-compose up --build
```

## 📈 Performance

| Step | Time |
|------|------|
| Container startup | ~2-3s |
| SurrealDB health check | ~0-5s |
| Schema initialization | ~2-5s |
| App startup | ~1-2s |
| **Total** | **~10-15s** |

## 💾 Data Persistence

Database data is stored in the `daggerboard-data` volume:

```bash
# Backup database
docker-compose exec surrealdb surreal export \
  --endpoint ws://localhost:8000 \
  --user root \
  --pass root > backup.surql

# Restore database
cat backup.surql | docker-compose exec -T surrealdb surreal import \
  --endpoint ws://localhost:8000 \
  --user root \
  --pass root
```

## 🔒 Production Deployment

### Change Default Credentials
```yaml
environment:
  SURREAL_USER: prod_user
  SURREAL_PASS: very_secure_password_here
```

### Use Managed Database (Optional)
```yaml
# Replace surrealdb service with environment variable
environment:
  DB_PATH: ws://your-managed-surreal.example.com:8000
```

### Enable TLS/SSL
- Use reverse proxy (nginx, traefik)
- Configure health checks for load balancing
- Set up monitoring and alerting

### Backup Strategy
```bash
# Regular exports
0 2 * * * docker-compose exec -T surrealdb surreal export ... > /backups/daggerboard-$(date +\%Y\%m\%d).surql
```

## 📚 Related Documentation

- [AUTOMATED_SETUP.md](AUTOMATED_SETUP.md) - Complete automation details
- [README.md](README.md) - Project overview
- [SETUP_COMPLETE.md](SETUP_COMPLETE.md) - Architecture changes summary

## ✨ Key Features

✅ **Zero-config** - Auto-initializes database
✅ **Fast** - ~10-15 second startup time
✅ **Persistent** - Data stored in volumes
✅ **Production-ready** - Auth enabled, health checks
✅ **Dev-friendly** - Hot-reload support
✅ **Scalable** - Schema optimized for high-volume traces

---

**Ready to go!** Run `docker-compose up` and start tracing. 🚀
