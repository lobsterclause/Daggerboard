<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Daggerboard

**Real-time OTLP trace visualization with persistent storage for historical analysis.**

Daggerboard visualizes OpenTelemetry traces in real-time, with optional SurrealDB persistence for historical correlation, service topology mapping, and anomaly detection.

## Features

- 🔴 **Real-time trace visualization** - Tree, timeline, and service topology views
- 💾 **Persistent storage** - SurrealDB backend for historical queries
- 🔗 **Service dependency mapping** - Automatic service-to-service relationship tracking
- 📊 **Historical analysis** - Query traces by service, error status, time range
- 🚨 **Error propagation tracking** - Understand how errors flow through your system
- ⚡ **Performance analytics** - Latency percentiles between service pairs

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set environment variables in `.env.local`:
   ```bash
   GEMINI_API_KEY="your-api-key"
   DB_PATH="file://./daggerboard.db"  # Optional, defaults to ./daggerboard.db
   ```

3. Start the app:
   ```bash
   npm run dev
   ```

   This will:
   - Initialize SurrealDB with trace schema
   - Start OTLP receiver on port 4318
   - Start UI on port 3000

4. Send traces:
   ```bash
   export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
   export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
   dagger call check  # Or any traced application
   ```

## Architecture

Daggerboard consists of:
- **Frontend** - React dashboard with real-time updates via WebSocket
- **Backend** - Express server with OTLP receiver
- **Database** - SurrealDB for trace persistence and historical queries

Traces flow: OTLP exporter → Server → In-memory cache (UI) + SurrealDB (persistence)

## Database Features

For details on querying historical data, see [DATABASE_SETUP.md](DATABASE_SETUP.md).

### Historical Queries
- `GET /api/history?hours=24&status=error` - Error traces from last 24 hours
- `GET /api/history?service=auth-service` - All traces touching a service
- `GET /api/topology` - Service dependency graph with call counts
- `GET /api/service/:name/errors?hours=24` - Error patterns

### Example: Find cascading failures
```bash
# Query traces where both service A and B were involved
curl http://localhost:3000/api/history?service=payment-service | jq '.[] | select(.services | contains(["database"]))'
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | UI server port |
| OTLP_PORT | 4318 | OTLP receiver port |
| DB_PATH | file://./daggerboard.db | SurrealDB location |

## Deployment

See [DATABASE_SETUP.md](DATABASE_SETUP.md) for Docker and production deployment guidance.
