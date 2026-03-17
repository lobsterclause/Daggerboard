# Daggerboard Database Setup

Daggerboard now includes **persistent trace storage** powered by **SurrealDB**, enabling historical analysis, service topology tracking, and advanced trace correlation.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Application
```bash
npm run dev
```

This will:
- Initialize SurrealDB with the trace schema
- Start the OTLP receiver on port 4318
- Start the UI server on port 3000

Traces are automatically stored in `./daggerboard.db`.

## Configuration

### Database Location
By default, traces are stored in `file://./daggerboard.db` (in your project directory).

To customize, set `DB_PATH` in `.env`:
```bash
# Store in a specific directory
DB_PATH="file:///var/lib/daggerboard/traces.db"

# Or use in-memory (not persistent - useful for development)
DB_PATH="memory://"
```

## Database Schema

The database automatically initializes with these tables:

### traces
Top-level trace records with aggregated stats:
```
- traceId (string, unique)
- startTime (datetime)
- endTime (datetime)
- durationMs (number)
- status ('success' | 'error')
- errorCount (number)
- spanCount (number)
- rootService (string)
- services (array of service names)
```

### spans
Individual spans within traces:
```
- spanId (string, unique)
- traceId (string)
- parentSpanId (string, optional)
- serviceName (string)
- spanName (string)
- kind (number: 1=INTERNAL, 2=SERVER, 3=CLIENT, 4=PRODUCER, 5=CONSUMER)
- startTime (datetime)
- endTime (datetime)
- durationMs (number)
- status ('success' | 'error')
- attributes (object - flexible OTLP attributes)
- isOnCriticalPath (boolean)
```

### services
Service registry (auto-populated):
```
- name (string, unique)
- firstSeen (datetime)
- lastSeen (datetime)
- traceCount (number)
- errorCount (number)
- avgDurationMs (number)
```

### service_calls
Service-to-service dependencies:
```
- fromService (string)
- toService (string)
- callCount (number)
- errorCount (number)
- lastObserved (datetime)
- avgDurationMs (number)
```

## API Endpoints

### Real-time Traces
- `GET /api/traces` - Current session traces (in-memory)
- `POST /api/clear` - Clear in-memory traces

### Historical Data
- `GET /api/history` - Query historical traces
  - `?hours=24` - Last N hours (default: 24)
  - `?service=api-gateway` - Filter by service
  - `?status=error` - Filter by status (success|error)
  - `?limit=100` - Max results (default: 100)

- `GET /api/topology` - Service dependency graph with stats
- `GET /api/service/:name` - Stats for a specific service
- `GET /api/service/:name/errors` - Error patterns for a service
  - `?hours=24` - Lookback window
- `GET /api/latency/:from/:to` - Latency metrics between two services
  - `?hours=24` - Lookback window

### Example Queries

**Get error traces from the last 6 hours:**
```bash
curl http://localhost:3000/api/history?hours=6&status=error
```

**Get all traces that touched the "auth-service":**
```bash
curl http://localhost:3000/api/history?service=auth-service
```

**Get service topology:**
```bash
curl http://localhost:3000/api/topology
```

**Get error patterns in payment-service:**
```bash
curl http://localhost:3000/api/service/payment-service/errors?hours=24
```

**Get latency between api-gateway and database:**
```bash
curl http://localhost:3000/api/latency/api-gateway/database
```

## Data Retention

By default, traces are stored indefinitely. To implement retention policies:

### Manual Cleanup
Delete traces older than 30 days:
```bash
# Using SurrealDB CLI
surreal query --endpoint file://./daggerboard.db "DELETE FROM traces WHERE startTime < time::now() - 30d"
```

### Automated Cleanup (Future)
Add a cron job to your deployment to run cleanup queries periodically.

## Querying with SurrealDB CLI

For advanced queries, you can directly query the database:

```bash
# Install SurrealDB CLI
# https://surrealdb.com/install

# Query traces
surreal query --endpoint file://./daggerboard.db "SELECT * FROM traces WHERE status == 'error' LIMIT 10"

# Find error propagation chains
surreal query --endpoint file://./daggerboard.db "
  SELECT
    parent.spanName AS parentSpan,
    child.spanName AS childSpan,
    child.serviceName
  FROM spans AS parent
  FETCH child IN (SELECT * FROM spans WHERE parentSpanId == parent.spanId AND status == 'error')
  LIMIT 20
"

# Service topology with error rates
surreal query --endpoint file://./daggerboard.db "
  SELECT
    fromService,
    toService,
    callCount,
    (errorCount / callCount * 100) AS errorRate,
    avgDurationMs
  FROM service_calls
  ORDER BY callCount DESC
"
```

## Deployment

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run build
ENV DB_PATH="file:///data/daggerboard.db"
VOLUME ["/data"]
CMD ["npm", "start"]
```

### Environment Variables
```bash
PORT=3000                    # UI server port
OTLP_PORT=4318              # OTLP receiver port
DB_PATH=file://./daggerboard.db  # Database location
```

## Troubleshooting

### Database won't initialize
- Check that the directory is writable
- Ensure no other process has the database file open
- Try removing `daggerboard.db` and restarting

### Queries are slow
- The schema includes indexes on common query columns
- For very large datasets, consider implementing data retention
- Use `LIMIT` in queries to avoid loading too much data

### Memory usage
- SurrealDB runs in-process with your Node.js app
- For production with high trace volume, consider separating into dedicated SurrealDB instance
- Set `DB_PATH="memory://"` in development for faster iteration (no disk I/O)

## Architecture

The database integration:
1. **Parallel storage**: Traces stored in both memory (for real-time UI) and disk (for persistence)
2. **Non-blocking**: DB operations are async but don't block OTLP response
3. **Automatic indexing**: Indexes on `traceId`, `startTime`, `serviceName`, etc.
4. **Relationship tracking**: Service-to-service calls automatically recorded
5. **Aggregate stats**: Service stats updated on each trace arrival

The frontend continues to work normally with in-memory traces, while historical queries fetch from the database.

## Next Steps

1. **Analytics Dashboard** - Add historical trend charts
2. **Anomaly Detection** - Alert on unusual service patterns
3. **Export** - Download trace data as CSV/JSON
4. **Retention Policy** - Automatic old trace cleanup
5. **Multi-instance** - Support for separate SurrealDB backend
