# Quick Start Guide

## ⚡ 30-Second Setup

```bash
git clone https://github.com/your-org/Daggerboard.git
cd Daggerboard
docker-compose up
```

Done! Access at http://localhost:3000

## 📍 What's Running

| Service | URL | Purpose |
|---------|-----|---------|
| **Dashboard** | http://localhost:3000 | Web UI for trace visualization |
| **OTLP Receiver** | http://localhost:4318 | Trace ingestion endpoint |
| **Database** | ws://localhost:8000 | SurrealDB (root/root) |

## 🎯 Next Steps

### 1. View Dashboard
Open http://localhost:3000 in your browser

### 2. Send Traces
In your application:
```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
# Your app automatically sends traces to Daggerboard
```

### 3. Watch in Real-Time
Traces appear instantly in the dashboard as they arrive

## 🔧 Common Commands

| Task | Command |
|------|---------|
| Start (production) | `docker-compose up` |
| Start (development) | `docker-compose -f docker-compose.dev.yml up` |
| Stop | `docker-compose down` |
| View logs | `docker-compose logs -f daggerboard` |
| Fresh start | `docker-compose down -v && docker-compose up` |
| Query database | `docker-compose exec surrealdb surreal sql --endpoint ws://localhost:8000 --user root --pass root` |

## 📚 Documentation

| Need | Document |
|------|----------|
| **Complete overview** | [DOCUMENTATION.md](DOCUMENTATION.md) |
| **Docker details** | [DOCKER.md](DOCKER.md) |
| **Automation info** | [AUTOMATED_SETUP.md](AUTOMATED_SETUP.md) |
| **Project info** | [README.md](README.md) |
| **Database schema** | [SURREAL_AUTO_SETUP.md](SURREAL_AUTO_SETUP.md) |

## 🚀 What's Automatic

When you run `docker-compose up`:

✅ SurrealDB starts
✅ Database schema auto-creates (5 tables, 11 indexes)
✅ Daggerboard app starts
✅ OTLP receiver listens on :4318
✅ Everything ready in ~10-15 seconds

No configuration needed!

## 🆘 Troubleshooting

### Port Already in Use
```bash
# Kill process using port
lsof -i :3000 | grep -v COMMAND | awk '{print $2}' | xargs kill -9
```

### Check Logs
```bash
docker-compose logs -f daggerboard
```

### Reset Everything
```bash
docker-compose down -v
docker-compose up --build
```

### Verify Health
```bash
curl http://localhost:3000
curl http://localhost:4318/health
```

## 💡 Tips

1. **Dev Mode**: Use `docker-compose.dev.yml` for hot-reload
2. **Inspect DB**: Use `docker-compose exec surrealdb` to access database
3. **Backup**: Export database before major changes
4. **Credentials**: Change `root:root` before production use

## 🎓 Learning Path

1. **First Time**: Follow 30-second setup above
2. **Understand Setup**: Read [AUTOMATED_SETUP.md](AUTOMATED_SETUP.md)
3. **Dive Deeper**: Read [DOCUMENTATION.md](DOCUMENTATION.md)
4. **Production**: Review [DOCKER.md](DOCKER.md#-production-deployment)

## 📞 Need Help?

1. Check [DOCKER.md#-troubleshooting](DOCKER.md#-troubleshooting)
2. Review logs: `docker-compose logs -f`
3. Check [DOCUMENTATION.md](DOCUMENTATION.md#-faq)

---

**You're all set!** Run `docker-compose up` and start tracing 🎉
