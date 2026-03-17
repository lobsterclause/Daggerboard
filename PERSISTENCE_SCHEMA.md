# SurrealDB Schema for Daggerboard Persistence

## Overview
This schema enables historical trace correlation, service topology tracking, and advanced analytics while maintaining the ability to visualize real-time traces.

## Tables

### traces
Top-level trace records (one per unique traceId)
```surql
DEFINE TABLE traces SCHEMAFULL;
DEFINE FIELD traceId ON traces TYPE string ASSERT string::len($value) > 0;
DEFINE FIELD startTime ON traces TYPE datetime;
DEFINE FIELD endTime ON traces TYPE datetime;
DEFINE FIELD durationMs ON traces TYPE number;
DEFINE FIELD status ON traces TYPE string ENUM ['success', 'error'];
DEFINE FIELD errorCount ON traces TYPE number DEFAULT 0;
DEFINE FIELD spanCount ON traces TYPE number DEFAULT 0;
DEFINE FIELD rootService ON traces TYPE string;
DEFINE FIELD services ON traces TYPE array;  // All services touched in this trace
DEFINE INDEX idx_traceId ON traces COLUMNS traceId UNIQUE;
DEFINE INDEX idx_startTime ON traces COLUMNS startTime;
DEFINE INDEX idx_status ON traces COLUMNS status;
```

### spans
Individual spans within traces
```surql
DEFINE TABLE spans SCHEMAFULL;
DEFINE FIELD spanId ON spans TYPE string ASSERT string::len($value) > 0;
DEFINE FIELD traceId ON spans TYPE string;
DEFINE FIELD parentSpanId ON spans TYPE string OPTION;
DEFINE FIELD serviceName ON spans TYPE string;
DEFINE FIELD spanName ON spans TYPE string;
DEFINE FIELD kind ON spans TYPE number;  // 1=INTERNAL, 2=SERVER, 3=CLIENT, etc
DEFINE FIELD startTime ON spans TYPE datetime;
DEFINE FIELD endTime ON spans TYPE datetime;
DEFINE FIELD durationMs ON spans TYPE number;
DEFINE FIELD status ON spans TYPE string ENUM ['success', 'error'];
DEFINE FIELD attributes ON spans TYPE object;  // Flexible OTLP attributes
DEFINE FIELD isOnCriticalPath ON spans TYPE bool DEFAULT false;
DEFINE INDEX idx_spanId ON spans COLUMNS spanId UNIQUE;
DEFINE INDEX idx_traceId ON spans COLUMNS traceId;
DEFINE INDEX idx_serviceName ON spans COLUMNS serviceName;
DEFINE INDEX idx_startTime ON spans COLUMNS startTime;
```

### services
Service registry (auto-populated from spans)
```surql
DEFINE TABLE services SCHEMAFULL;
DEFINE FIELD name ON services TYPE string ASSERT string::len($value) > 0;
DEFINE FIELD firstSeen ON services TYPE datetime;
DEFINE FIELD lastSeen ON services TYPE datetime;
DEFINE FIELD traceCount ON services TYPE number DEFAULT 0;
DEFINE FIELD errorCount ON services TYPE number DEFAULT 0;
DEFINE FIELD avgDurationMs ON services TYPE number;
DEFINE INDEX idx_name ON services COLUMNS name UNIQUE;
```

### service_calls
Service-to-service dependencies (relationships)
```surql
DEFINE TABLE service_calls SCHEMAFULL;
DEFINE FIELD fromService ON service_calls TYPE string;
DEFINE FIELD toService ON service_calls TYPE string;
DEFINE FIELD callCount ON service_calls TYPE number DEFAULT 1;
DEFINE FIELD errorCount ON service_calls TYPE number DEFAULT 0;
DEFINE FIELD lastObserved ON service_calls TYPE datetime;
DEFINE FIELD avgDurationMs ON service_calls TYPE number;
DEFINE INDEX idx_from_to ON service_calls COLUMNS fromService, toService UNIQUE;
DEFINE INDEX idx_from ON service_calls COLUMNS fromService;
DEFINE INDEX idx_to ON service_calls COLUMNS toService;
```

## Example Queries

### 1. Store a new trace
```surql
BEGIN TRANSACTION;
  CREATE traces CONTENT {
    traceId: 'abc123',
    startTime: time::now(),
    status: 'error',
    errorCount: 1,
    spanCount: 5,
    rootService: 'api-gateway',
    services: ['api-gateway', 'auth-service', 'user-db']
  };

  CREATE spans CONTENT {
    spanId: 'span1',
    traceId: 'abc123',
    serviceName: 'api-gateway',
    spanName: 'POST /users',
    durationMs: 150,
    status: 'error',
    attributes: { 'http.method': 'POST', 'http.status_code': 500 }
  };

  CREATE spans CONTENT {
    spanId: 'span2',
    traceId: 'abc123',
    parentSpanId: 'span1',
    serviceName: 'auth-service',
    spanName: 'validate_token',
    durationMs: 120,
    status: 'error',
    attributes: { 'error.type': 'InvalidToken' }
  };

  UPSERT service_calls CONTENT {
    fromService: 'api-gateway',
    toService: 'auth-service',
    callCount: 1,
    lastObserved: time::now()
  };
COMMIT TRANSACTION;
```

### 2. Find all error traces in the last hour
```surql
SELECT * FROM traces
WHERE startTime > time::now() - 1h
  AND status == 'error'
ORDER BY startTime DESC;
```

### 3. Find traces that touched both Service A and Service B
```surql
SELECT * FROM traces
WHERE 'payment-service' IN services
  AND 'database' IN services
  AND startTime > time::now() - 24h;
```

### 4. Find error propagation chains (A → B → error)
```surql
SELECT
  parent.spanName AS parentSpan,
  parent.serviceName AS fromService,
  child.spanName AS childSpan,
  child.serviceName AS toService,
  child.durationMs
FROM spans AS parent
WHERE parent.status == 'success'
FETCH child IN (SELECT * FROM spans WHERE parentSpanId == parent.spanId AND status == 'error');
```

### 5. Service topology: which services are called most?
```surql
SELECT
  fromService,
  toService,
  callCount,
  errorCount,
  (errorCount / callCount * 100) AS errorRate,
  avgDurationMs
FROM service_calls
ORDER BY callCount DESC
LIMIT 20;
```

### 6. Performance regression detection: compare latencies over time
```surql
SELECT
  serviceName,
  time::floor(startTime, 1h) AS hour,
  COUNT(*) AS traceCount,
  math::avg(durationMs) AS avgDuration,
  math::median(durationMs) AS medianDuration,
  math::max(durationMs) AS p99Duration
FROM spans
WHERE startTime > time::now() - 24h
GROUP BY serviceName, hour
ORDER BY hour DESC;
```

### 7. Find anomalies: services that never call each other (but now do)
```surql
SELECT fromService, toService
FROM service_calls
WHERE lastObserved > time::now() - 1h
  AND callCount < 5;  // New or rare edges
```

### 8. Critical path analysis
```surql
SELECT
  traceId,
  spanName,
  serviceName,
  durationMs,
  isOnCriticalPath
FROM spans
WHERE traceId == $traceId AND isOnCriticalPath == true
ORDER BY startTime ASC;
```

### 9. Find all root causes for errors in a service
```surql
SELECT DISTINCT
  child.spanName AS errorSpan,
  child.attributes.error_type,
  COUNT(*) AS frequency
FROM spans AS parent
WHERE parent.serviceName == 'payment-service'
FETCH child IN (SELECT * FROM spans WHERE parentSpanId == parent.spanId AND status == 'error')
GROUP BY child.spanName, child.attributes.error_type
ORDER BY frequency DESC;
```

### 10. Latency percentiles for a service pair
```surql
SELECT
  fromService,
  toService,
  math::percentile(avgDurationMs, [0.5, 0.95, 0.99]) AS latencyPercentiles,
  COUNT(*) AS sampleCount
FROM service_calls
WHERE fromService == 'api-gateway' AND toService == 'user-db'
  AND lastObserved > time::now() - 7d
GROUP ALL;
```

## Integration with Daggerboard

### In `server.ts`:
1. On `POST /v1/traces`, parse OTLP and insert into SurrealDB
2. Add `/api/historical/:traceId` endpoint for historical queries
3. Add `/api/service-topology` endpoint for service dependency graph
4. Add `/api/anomalies` endpoint for anomaly detection

### In React components:
- Add "Historical Analytics" tab for querying traces by date/service
- Enhance ServiceGraph to pull from persistent topology (with stats)
- Add "Error Patterns" panel showing root cause analysis

## Deployment

SurrealDB stores everything in a single file by default:
```bash
# Development (in-memory, or file-backed)
surreal start --log debug file://./daggerboard.db

# Production
surreal start --auth --user admin --pass password file:///data/daggerboard.db
```

For release as FOSS tool, users can:
1. Download SurrealDB binary
2. Run `npm install` (includes Daggerboard)
3. Start script handles both SurrealDB and Daggerboard startup
