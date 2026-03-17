-- SurrealDB Initialization Script for Daggerboard
-- This script automatically sets up the database schema on startup

-- Create namespace and database
DEFINE NAMESPACE IF NOT EXISTS daggerboard;
USE NAMESPACE daggerboard;
DEFINE DATABASE IF NOT EXISTS traces;
USE DATABASE traces;

-- Create traces table
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

-- Create spans table
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

-- Create services table
DEFINE TABLE IF NOT EXISTS services SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS name ON services TYPE string ASSERT string::len($value) > 0;
DEFINE FIELD IF NOT EXISTS firstSeen ON services TYPE datetime;
DEFINE FIELD IF NOT EXISTS lastSeen ON services TYPE datetime;
DEFINE FIELD IF NOT EXISTS traceCount ON services TYPE number DEFAULT 0;
DEFINE FIELD IF NOT EXISTS errorCount ON services TYPE number DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avgDurationMs ON services TYPE number DEFAULT 0;
DEFINE INDEX IF NOT EXISTS idx_name ON services COLUMNS name UNIQUE;

-- Create service_calls table
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

-- Create system metadata table for tracking schema version
DEFINE TABLE IF NOT EXISTS _metadata SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS key ON _metadata TYPE string;
DEFINE FIELD IF NOT EXISTS value ON _metadata TYPE any;
DEFINE FIELD IF NOT EXISTS updatedAt ON _metadata TYPE datetime DEFAULT time::now();
DEFINE INDEX IF NOT EXISTS idx_metadata_key ON _metadata COLUMNS key UNIQUE;

-- Set schema version
UPSERT INTO _metadata (key, value, updatedAt) VALUES ('schema_version', '1.0', time::now());
UPSERT INTO _metadata (key, value, updatedAt) VALUES ('initialized_at', time::now(), time::now());

-- Output confirmation
RETURN {
  status: 'success',
  message: 'Daggerboard SurrealDB schema initialized',
  namespace: 'daggerboard',
  database: 'traces',
  tables: ['traces', 'spans', 'services', 'service_calls', '_metadata']
};
