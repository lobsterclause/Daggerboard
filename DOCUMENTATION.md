# Daggerboard Documentation

Complete guide to understanding, setting up, and running Daggerboard.

## 🚀 Getting Started (5 minutes)

**New to Daggerboard?** Start here:

1. **[README.md](README.md)** - Project overview and quick start
   - Features and benefits
   - 30-second Docker setup
   - Quick reference links

2. **[DOCKER.md](DOCKER.md)** - Docker deployment guide
   - One-command setup
   - Services overview
   - Common commands
   - Troubleshooting

## 🔧 Setup & Configuration

### Automated Setup (Recommended)

**[AUTOMATED_SETUP.md](AUTOMATED_SETUP.md)** - Complete automation guide
- How auto-initialization works
- Startup flow diagram
- Auto-initialized schema
- Performance metrics
- Development vs Production

### Manual Setup (Reference)

**[SURREAL_AUTO_SETUP.md](SURREAL_AUTO_SETUP.md)** - Database initialization details
- Schema structure
- Table definitions
- Index information
- Custom table examples
- Backup/restore procedures

## 📊 Architecture & Implementation

### Current Setup

**[SETUP_COMPLETE.md](SETUP_COMPLETE.md)** - Architecture changes summary
- Before/after comparison
- Simplified services
- Updated files
- Benefits overview

### Previous Setup (Reference)

**[DOCKER_SETUP_SUMMARY.md](DOCKER_SETUP_SUMMARY.md)** - Legacy documentation
- Original multi-service approach
- For historical reference

## 🔍 Quick Reference

### One-Command Start
```bash
docker-compose up
```

### Development (Hot-Reload)
```bash
docker-compose -f docker-compose.dev.yml up
```

### Access Points
| Service | URL |
|---------|-----|
| Dashboard | http://localhost:3000 |
| OTLP Receiver | http://localhost:4318 |
| Database | ws://localhost:8000 |

### Key Files
| File | Purpose |
|------|---------|
| `docker-compose.yml` | Production setup |
| `docker-compose.dev.yml` | Development with hot-reload |
| `Dockerfile` | Production image with auto-init |
| `Dockerfile.dev` | Development image |
| `docker/entrypoint.sh` | Initialization orchestration |
| `init-surreal.surql` | Database schema definition |
| `docker/surreal-init.sh` | Schema initialization script |

## 📚 Documentation by Topic

### Setup & Deployment
- [DOCKER.md](DOCKER.md) - Docker commands and configuration
- [AUTOMATED_SETUP.md](AUTOMATED_SETUP.md) - Automation details
- [README.md](README.md) - Quick start

### Database
- [SURREAL_AUTO_SETUP.md](SURREAL_AUTO_SETUP.md) - Schema and database details
- [init-surreal.surql](init-surreal.surql) - Database definition file
- [docker/surreal-init.sh](docker/surreal-init.sh) - Initialization script

### Architecture
- [SETUP_COMPLETE.md](SETUP_COMPLETE.md) - System architecture
- [docker/entrypoint.sh](docker/entrypoint.sh) - Container orchestration

## ✨ Key Features at a Glance

### Automation ✅
- Zero-configuration database initialization
- Automatic schema creation (5 tables, 11 indexes)
- Health-checked service startup
- Idempotent setup (safe to run multiple times)

### Performance ⚡
- ~10-15 second startup time
- Persistent data with volumes
- Optimized indexes for queries
- High-volume trace capacity

### Production Ready 🔒
- Authentication enabled
- Persistent storage
- Health checks
- Secure defaults

### Developer Friendly 👨‍💻
- Hot-reload support
- Clear startup messages
- Comprehensive logging
- Easy troubleshooting

## 🎯 Common Tasks

### Start Daggerboard
```bash
docker-compose up
```
See: [DOCKER.md](DOCKER.md#-one-command-setup)

### Development with Hot-Reload
```bash
docker-compose -f docker-compose.dev.yml up
```
See: [DOCKER.md](DOCKER.md#-development-workflow)

### Check Initialization
```bash
docker-compose logs daggerboard | grep "✓"
```
See: [AUTOMATED_SETUP.md](AUTOMATED_SETUP.md#verification)

### Query Database
```bash
docker-compose exec surrealdb surreal sql \
  --endpoint ws://localhost:8000 \
  --user root --pass root
```
See: [DOCKER.md](DOCKER.md#-database-access)

### Reset Everything
```bash
docker-compose down -v
docker-compose up
```
See: [DOCKER.md](DOCKER.md#remove-everything-fresh-start)

### Send OTLP Traces
```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
# Your application sends traces automatically
```
See: [README.md](README.md#-send-sample-traces)

## 🔍 For Different Audiences

### DevOps / Platform Engineers
Start with:
1. [DOCKER.md](DOCKER.md) - Container setup
2. [SETUP_COMPLETE.md](SETUP_COMPLETE.md) - Architecture
3. [AUTOMATED_SETUP.md](AUTOMATED_SETUP.md) - Implementation details

### Application Developers
Start with:
1. [README.md](README.md) - Quick start
2. [DOCKER.md](DOCKER.md) - Local setup
3. Send OTLP traces from your app

### Database Administrators
Start with:
1. [SURREAL_AUTO_SETUP.md](SURREAL_AUTO_SETUP.md) - Schema details
2. [DOCKER.md](DOCKER.md#-database-access) - Database access
3. [DOCKER.md](DOCKER.md#-data-persistence) - Backup/restore

### SRE / On-Call Engineers
Start with:
1. [DOCKER.md](DOCKER.md#-troubleshooting) - Troubleshooting
2. [AUTOMATED_SETUP.md](AUTOMATED_SETUP.md#troubleshooting) - Debugging
3. [DOCKER.md](DOCKER.md#-common-commands) - Quick commands

## 📖 How Documentation is Organized

```
DOCUMENTATION.md (you are here)
├── Getting Started (README, DOCKER)
├── Setup & Configuration (AUTOMATED_SETUP, SURREAL_AUTO_SETUP)
├── Architecture (SETUP_COMPLETE, DOCKER_SETUP_SUMMARY)
└── Reference (Source files)
```

Each document is self-contained but links to related docs.

## 🔗 External Resources

### OpenTelemetry
- [OpenTelemetry Docs](https://opentelemetry.io/docs/)
- [OTLP Protocol](https://github.com/open-telemetry/opentelemetry-proto)

### SurrealDB
- [SurrealDB Documentation](https://surrealdb.com/docs)
- [SurrealDB CLI](https://surrealdb.com/docs/cli)

### Docker
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)

## ❓ FAQ

### Q: Do I need to configure anything to start?
**A:** No! `docker-compose up` handles everything automatically.

### Q: How long does startup take?
**A:** About 10-15 seconds total (includes database initialization).

### Q: Is the database persistent?
**A:** Yes! Data is stored in the `daggerboard-data` volume and persists across restarts.

### Q: Can I change the default credentials?
**A:** Yes, edit `docker-compose.yml` and change `SURREAL_USER` and `SURREAL_PASS`.

### Q: How do I send traces to Daggerboard?
**A:** Set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` in your app.

### Q: Can I use this in production?
**A:** Yes! Change default credentials and consider using a managed database service.

### Q: How do I backup the database?
**A:** See [DOCKER.md](DOCKER.md#-data-persistence) for backup commands.

### Q: Can I customize the schema?
**A:** Yes! Edit `init-surreal.surql` and restart containers.

## 📞 Getting Help

1. **Check Logs**: `docker-compose logs -f`
2. **Review Troubleshooting**: [DOCKER.md#-troubleshooting](DOCKER.md#-troubleshooting)
3. **Check FAQ**: [#-faq](#-faq) above
4. **Review Documentation**: Links above by topic

## 📝 License

Daggerboard is released under the [MIT License](LICENSE).

---

**Last Updated:** March 2026
**Status:** ✅ Complete & Production Ready
