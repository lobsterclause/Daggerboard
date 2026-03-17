import { Surreal } from 'surrealdb';
import { OTLPTraceData } from './src/types';

let db: Surreal | null = null;

export async function initializeDatabase(dbPath: string = 'mem://') {
  db = new Surreal();
  await db.connect(dbPath);
  await db.use({ namespace: 'daggerboard', database: 'traces' });
  await initializeSchema();
  console.log('✓ SurrealDB initialized and ready');
}

async function initializeSchema() {
  if (!db) throw new Error('Database not initialized');

  // Check if schema is already initialized
  try {
    const metadata = await db.query('SELECT * FROM _metadata WHERE key == "schema_version";') as any[];
    if (metadata && metadata.length > 0 && metadata[0]?.result && metadata[0].result.length > 0) {
      console.log('✓ Schema already initialized, skipping initialization');
      return;
    }
  } catch (err) {
    // Table doesn't exist yet, proceed with initialization
    console.log('📦 Initializing new schema...');
  }

  // Create traces table
  await db.query(`
    DEFINE TABLE IF NOT EXISTS traces SCHEMAFULL;
    DEFINE FIELD IF NOT EXISTS traceId ON traces TYPE string ASSERT string::len($value) > 0;
    DEFINE FIELD IF NOT EXISTS startTime ON traces TYPE datetime;
    DEFINE FIELD IF NOT EXISTS endTime ON traces TYPE datetime;
    DEFINE FIELD IF NOT EXISTS durationMs ON traces TYPE number;
    DEFINE FIELD IF NOT EXISTS status ON traces TYPE string ENUM ['success', 'error'];
    DEFINE FIELD IF NOT EXISTS errorCount ON traces TYPE number DEFAULT 0;
    DEFINE FIELD IF NOT EXISTS spanCount ON traces TYPE number DEFAULT 0;
    DEFINE FIELD IF NOT EXISTS rootService ON traces TYPE string;
    DEFINE FIELD IF NOT EXISTS services ON traces TYPE array DEFAULT [];
    DEFINE INDEX IF NOT EXISTS idx_traceId ON traces COLUMNS traceId UNIQUE;
    DEFINE INDEX IF NOT EXISTS idx_startTime ON traces COLUMNS startTime;
    DEFINE INDEX IF NOT EXISTS idx_status ON traces COLUMNS status;
  `);

  // Create spans table
  await db.query(`
    DEFINE TABLE IF NOT EXISTS spans SCHEMAFULL;
    DEFINE FIELD IF NOT EXISTS spanId ON spans TYPE string ASSERT string::len($value) > 0;
    DEFINE FIELD IF NOT EXISTS traceId ON spans TYPE string;
    DEFINE FIELD IF NOT EXISTS parentSpanId ON spans TYPE string OPTION;
    DEFINE FIELD IF NOT EXISTS serviceName ON spans TYPE string;
    DEFINE FIELD IF NOT EXISTS spanName ON spans TYPE string;
    DEFINE FIELD IF NOT EXISTS kind ON spans TYPE number;
    DEFINE FIELD IF NOT EXISTS startTime ON spans TYPE datetime;
    DEFINE FIELD IF NOT EXISTS endTime ON spans TYPE datetime;
    DEFINE FIELD IF NOT EXISTS durationMs ON spans TYPE number;
    DEFINE FIELD IF NOT EXISTS status ON spans TYPE string ENUM ['success', 'error'];
    DEFINE FIELD IF NOT EXISTS attributes ON spans TYPE object DEFAULT {};
    DEFINE FIELD IF NOT EXISTS isOnCriticalPath ON spans TYPE bool DEFAULT false;
    DEFINE INDEX IF NOT EXISTS idx_spanId ON spans COLUMNS spanId UNIQUE;
    DEFINE INDEX IF NOT EXISTS idx_traceId ON spans COLUMNS traceId;
    DEFINE INDEX IF NOT EXISTS idx_serviceName ON spans COLUMNS serviceName;
    DEFINE INDEX IF NOT EXISTS idx_startTime ON spans COLUMNS startTime;
  `);

  // Create services table
  await db.query(`
    DEFINE TABLE IF NOT EXISTS services SCHEMAFULL;
    DEFINE FIELD IF NOT EXISTS name ON services TYPE string ASSERT string::len($value) > 0;
    DEFINE FIELD IF NOT EXISTS firstSeen ON services TYPE datetime;
    DEFINE FIELD IF NOT EXISTS lastSeen ON services TYPE datetime;
    DEFINE FIELD IF NOT EXISTS traceCount ON services TYPE number DEFAULT 0;
    DEFINE FIELD IF NOT EXISTS errorCount ON services TYPE number DEFAULT 0;
    DEFINE FIELD IF NOT EXISTS avgDurationMs ON services TYPE number DEFAULT 0;
    DEFINE INDEX IF NOT EXISTS idx_name ON services COLUMNS name UNIQUE;
  `);

  // Create service_calls table
  await db.query(`
    DEFINE TABLE IF NOT EXISTS service_calls SCHEMAFULL;
    DEFINE FIELD IF NOT EXISTS fromService ON service_calls TYPE string;
    DEFINE FIELD IF NOT EXISTS toService ON service_calls TYPE string;
    DEFINE FIELD IF NOT EXISTS callCount ON service_calls TYPE number DEFAULT 1;
    DEFINE FIELD IF NOT EXISTS errorCount ON service_calls TYPE number DEFAULT 0;
    DEFINE FIELD IF NOT EXISTS lastObserved ON service_calls TYPE datetime;
    DEFINE FIELD IF NOT EXISTS avgDurationMs ON service_calls TYPE number DEFAULT 0;
    DEFINE INDEX IF NOT EXISTS idx_from_to ON service_calls COLUMNS fromService, toService UNIQUE;
    DEFINE INDEX IF NOT EXISTS idx_from ON service_calls COLUMNS fromService;
    DEFINE INDEX IF NOT EXISTS idx_to ON service_calls COLUMNS toService;
  `);

  // Create metadata table for tracking schema version
  await db.query(`
    DEFINE TABLE IF NOT EXISTS _metadata SCHEMAFULL;
    DEFINE FIELD IF NOT EXISTS key ON _metadata TYPE string;
    DEFINE FIELD IF NOT EXISTS value ON _metadata TYPE any;
    DEFINE FIELD IF NOT EXISTS updatedAt ON _metadata TYPE datetime DEFAULT time::now();
    DEFINE INDEX IF NOT EXISTS idx_metadata_key ON _metadata COLUMNS key UNIQUE;
  `);

  // Set schema version metadata
  await db.query(`
    UPSERT INTO _metadata (key, value, updatedAt) VALUES ('schema_version', '1.0', time::now());
    UPSERT INTO _metadata (key, value, updatedAt) VALUES ('initialized_at', time::now(), time::now());
  `);

  console.log('✓ Schema initialized successfully');
}

export async function storeTrace(traceData: OTLPTraceData, spans: Array<any>) {
  if (!db) throw new Error('Database not initialized');

  const traceId = spans[0]?.traceId || `trace-${Date.now()}`;
  const startTime = spans.length > 0 ? new Date(Number(BigInt(spans[0].startTimeUnixNano) / 1000000n)) : new Date();
  const endTime = spans.length > 0 ? new Date(Number(BigInt(spans[spans.length - 1].endTimeUnixNano) / 1000000n)) : new Date();
  const durationMs = endTime.getTime() - startTime.getTime();

  const hasError = spans.some(s => s.status?.code === 2);
  const errorCount = spans.filter(s => s.status?.code === 2).length;
  const services = [...new Set(spans.map(s => s.serviceName || 'unknown').filter(Boolean))];
  const rootService = spans[0]?.serviceName || 'unknown';

  try {
    // Store trace record
    await db.create(`traces:${traceId}`, {
      traceId,
      startTime,
      endTime,
      durationMs,
      status: hasError ? 'error' : 'success',
      errorCount,
      spanCount: spans.length,
      rootService,
      services,
    });

    // Store spans
    for (const span of spans) {
      const spanStartTime = new Date(Number(BigInt(span.startTimeUnixNano) / 1000000n));
      const spanEndTime = new Date(Number(BigInt(span.endTimeUnixNano) / 1000000n));
      const spanDurationMs = spanEndTime.getTime() - spanStartTime.getTime();
      const serviceName = span.serviceName || 'unknown';

      // Create span record
      await db.create(`spans:${span.spanId}`, {
        spanId: span.spanId,
        traceId,
        parentSpanId: span.parentSpanId || null,
        serviceName,
        spanName: span.name,
        kind: span.kind,
        startTime: spanStartTime,
        endTime: spanEndTime,
        durationMs: spanDurationMs,
        status: span.status?.code === 2 ? 'error' : 'success',
        attributes: span.attributes || {},
        isOnCriticalPath: span.isOnCriticalPath || false,
      });

      // Create or update service record
      try {
        await db.create(`services:${serviceName}`, {
          name: serviceName,
          firstSeen: spanStartTime,
          lastSeen: spanEndTime,
          traceCount: 1,
          errorCount: span.status?.code === 2 ? 1 : 0,
          avgDurationMs: spanDurationMs,
        });
      } catch {
        // Service exists, update it
        await db.query(
          `UPDATE services SET lastSeen = $ts, traceCount += 1, errorCount += $err, avgDurationMs = (avgDurationMs * (traceCount - 1) + $dur) / traceCount WHERE id == $id;`,
          {
            ts: spanEndTime.toISOString(),
            err: span.status?.code === 2 ? 1 : 0,
            dur: spanDurationMs,
            id: `services:${serviceName}`,
          }
        );
      }

      // Record service-to-service calls
      if (span.parentSpanId) {
        const parentSpan = spans.find(s => s.spanId === span.parentSpanId);
        if (parentSpan && parentSpan.serviceName !== serviceName) {
          const parentService = parentSpan.serviceName || 'unknown';
          const callId = `service_calls:${parentService}:${serviceName}`;

          try {
            await db.create(callId, {
              fromService: parentService,
              toService: serviceName,
              callCount: 1,
              errorCount: span.status?.code === 2 ? 1 : 0,
              lastObserved: spanEndTime,
              avgDurationMs: spanDurationMs,
            });
          } catch {
            // Edge exists, update it
            await db.query(
              `UPDATE service_calls SET callCount += 1, errorCount += $err, lastObserved = $ts, avgDurationMs = (avgDurationMs * (callCount - 1) + $dur) / callCount WHERE id == $id;`,
              {
                err: span.status?.code === 2 ? 1 : 0,
                ts: spanEndTime.toISOString(),
                dur: spanDurationMs,
                id: callId,
              }
            );
          }
        }
      }
    }
  } catch (err) {
    console.error('Error storing trace:', err);
    throw err;
  }
}

export async function getTraceHistory(options: {
  hours?: number;
  service?: string;
  status?: 'success' | 'error';
  limit?: number;
} = {}) {
  if (!db) throw new Error('Database not initialized');

  const hours = options.hours || 24;
  const limit = options.limit || 100;
  let query = `SELECT * FROM traces WHERE startTime > time::now() - ${hours}h`;

  if (options.service) {
    query += ` AND '${options.service}' IN services`;
  }

  if (options.status) {
    query += ` AND status == '${options.status}'`;
  }

  query += ` ORDER BY startTime DESC LIMIT ${limit};`;
  const result = await db.query(query) as any[];
  return result[0]?.result || [];
}

export async function getServiceTopology() {
  if (!db) throw new Error('Database not initialized');

  const query = `
    SELECT
      fromService,
      toService,
      callCount,
      errorCount,
      (errorCount / callCount * 100) AS errorRate,
      avgDurationMs
    FROM service_calls
    ORDER BY callCount DESC;
  `;
  const result = await db.query(query) as any[];
  return result[0]?.result || [];
}

export async function getServiceStats(serviceName: string) {
  if (!db) throw new Error('Database not initialized');

  const query = `
    SELECT *
    FROM services
    WHERE name == '${serviceName}';
  `;
  const result = await db.query(query) as any[];
  return result[0]?.result?.[0] || null;
}

export async function getErrorPatterns(serviceName: string, hours: number = 24) {
  if (!db) throw new Error('Database not initialized');

  const query = `
    SELECT DISTINCT
      spanName,
      COUNT(*) AS frequency,
      math::avg(durationMs) AS avgDuration
    FROM spans
    WHERE serviceName == '${serviceName}'
      AND status == 'error'
      AND startTime > time::now() - ${hours}h
    GROUP BY spanName
    ORDER BY frequency DESC;
  `;
  const result = await db.query(query) as any[];
  return result[0]?.result || [];
}

export async function getLatencyPercentiles(fromService: string, toService: string, hours: number = 24) {
  if (!db) throw new Error('Database not initialized');

  const query = `
    SELECT
      fromService,
      toService,
      COUNT(*) AS sampleCount,
      math::avg(avgDurationMs) AS p50,
      math::max(avgDurationMs) AS p99
    FROM service_calls
    WHERE fromService == '${fromService}'
      AND toService == '${toService}'
      AND lastObserved > time::now() - ${hours}h;
  `;
  const result = await db.query(query) as any[];
  return result[0]?.result?.[0] || null;
}

export async function getDatabase() {
  return db;
}
