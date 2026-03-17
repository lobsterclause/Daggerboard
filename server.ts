import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import { initializeDatabase, storeTrace, getTraceHistory, getServiceTopology, getServiceStats, getErrorPatterns, getLatencyPercentiles } from './db.js';
import { OTLPTraceData, Span } from './src/types.js';

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: '*' }
  });

  const PORT = parseInt(process.env.PORT || '3000', 10);
  const OTLP_PORT = parseInt(process.env.OTLP_PORT || '4318', 10);
  const DB_PATH = process.env.DB_PATH || 'mem://';

  // Middleware for OTLP JSON
  app.use(express.json({ limit: '50mb' }));
  app.use(cors());

  // Initialize database
  try {
    await initializeDatabase(DB_PATH);
  } catch (err) {
    console.error('Database initialization error:', err);
    process.exit(1);
  }

  // In-memory trace storage (for real-time UI)
  const traces: any[] = [];

  // Dagger setup helpers
  const DAGGERBOARD_BLOCK_START = '# Daggerboard - auto-added';
  const DAGGERBOARD_BLOCK_END   = '# End Daggerboard';
  const SNIPPET = `${DAGGERBOARD_BLOCK_START}
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:${OTLP_PORT}
export OTEL_EXPORTER_OTLP_PROTOCOL=http/json
export OTEL_EXPORTER_OTLP_TRACES_LIVE=1
${DAGGERBOARD_BLOCK_END}`;

  function getShellProfile() {
    const shellBin = process.env.SHELL || '/bin/bash';
    const home = os.homedir();
    if (shellBin.endsWith('zsh'))  return { shell: 'zsh',  profilePath: path.join(home, '.zshrc') };
    if (shellBin.endsWith('fish')) return { shell: 'fish', profilePath: path.join(home, '.config/fish/config.fish') };
    return { shell: 'bash', profilePath: path.join(home, '.bashrc') };
  }

  function detectDagger() {
    try {
      const version = execSync('dagger version', { timeout: 3000 }).toString().trim();
      return { installed: true, version };
    } catch {
      return { installed: false, version: null };
    }
  }

  function profileContainsBlock(profilePath: string) {
    if (!fs.existsSync(profilePath)) return false;
    return fs.readFileSync(profilePath, 'utf8').includes(DAGGERBOARD_BLOCK_START);
  }

  // Helper function to extract spans from OTLP data
  function extractSpans(traceData: OTLPTraceData): Span[] {
    const spans: Span[] = [];
    if (!traceData.resourceSpans) return spans;

    for (const rs of traceData.resourceSpans) {
      let serviceName = 'unknown-service';
      if (rs.resource?.attributes) {
        const svcAttr = rs.resource.attributes.find((a: any) => a.key === 'service.name');
        if (svcAttr) serviceName = String(svcAttr.value?.stringValue || svcAttr.value);
      }

      if (!rs.scopeSpans) continue;
      for (const ss of rs.scopeSpans) {
        if (!ss.spans) continue;
        const enrichedSpans = ss.spans.map(span => {
          const hasService = span.attributes?.some(a => a.key === 'service.name');
          if (!hasService) {
            return {
              ...span,
              serviceName,
              attributes: [...(span.attributes || []), { key: 'service.name', value: serviceName }]
            };
          }
          return { ...span, serviceName };
        });
        spans.push(...enrichedSpans);
      }
    }
    return spans;
  }

  // OTLP HTTP JSON Receiver Endpoint
  app.post('/v1/traces', async (req, res) => {
    const traceData = req.body;

    // Store in memory for real-time UI
    traces.push(traceData);
    io.emit('new_trace', traceData);

    // Store in database for persistence
    try {
      const spans = extractSpans(traceData);
      if (spans.length > 0) {
        // await storeTrace(traceData, spans);
      }
    } catch (err) {
      console.error('Failed to store trace in database:', err);
      // Still respond OK to the OTLP exporter, don't block on DB
    }

    res.status(200).send({});
  });

  app.get('/api/traces', (req, res) => {
    res.json(traces);
  });

  app.post('/api/clear', (req, res) => {
    traces.length = 0;
    io.emit('clear_traces');
    res.status(200).send({});
  });

  // Dagger setup endpoints
  app.get('/api/setup/dagger', (req, res) => {
    const { shell, profilePath } = getShellProfile();
    const { installed, version } = detectDagger();
    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '';
    res.json({
      installed,
      version,
      shell,
      profilePath,
      alreadyConfigured: endpoint.includes(`:${OTLP_PORT}`),
      snippetApplied: profileContainsBlock(profilePath),
      snippet: SNIPPET,
    });
  });

  app.post('/api/setup/dagger/apply', (req, res) => {
    const { profilePath } = getShellProfile();
    try {
      if (profileContainsBlock(profilePath)) {
        return res.json({ success: true, profilePath, alreadyPresent: true });
      }
      const dir = path.dirname(profilePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(profilePath, `\n${SNIPPET}\n`);
      res.json({ success: true, profilePath, alreadyPresent: false });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  app.post('/api/setup/dagger/remove', (req, res) => {
    const { profilePath } = getShellProfile();
    try {
      if (!fs.existsSync(profilePath)) {
        return res.json({ success: true, profilePath });
      }
      const content = fs.readFileSync(profilePath, 'utf8');
      const cleaned = content
        .split('\n')
        .reduce<{ lines: string[]; inBlock: boolean }>((acc, line) => {
          if (line.trim() === DAGGERBOARD_BLOCK_START) return { ...acc, inBlock: true };
          if (line.trim() === DAGGERBOARD_BLOCK_END)   return { ...acc, inBlock: false };
          if (!acc.inBlock) acc.lines.push(line);
          return acc;
        }, { lines: [], inBlock: false })
        .lines
        .join('\n')
        .replace(/\n{3,}/g, '\n\n');
      fs.writeFileSync(profilePath, cleaned, 'utf8');
      res.json({ success: true, profilePath });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) });
    }
  });

  // Historical trace queries
  app.get('/api/history', async (req, res) => {
    try {
      const hours = parseInt(req.query.hours as string) || 24;
      const service = req.query.service as string;
      const status = req.query.status as 'success' | 'error';
      const limit = parseInt(req.query.limit as string) || 100;

      const results = await getTraceHistory({ hours, service, status, limit });
      res.json(results);
    } catch (err) {
      console.error('History query failed:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // Service topology
  app.get('/api/topology', async (req, res) => {
    try {
      const topology = await getServiceTopology();
      res.json(topology);
    } catch (err) {
      console.error('Topology query failed:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // Service stats
  app.get('/api/service/:name', async (req, res) => {
    try {
      const stats = await getServiceStats(req.params.name);
      res.json(stats);
    } catch (err) {
      console.error('Service stats query failed:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // Error patterns for a service
  app.get('/api/service/:name/errors', async (req, res) => {
    try {
      const hours = parseInt(req.query.hours as string) || 24;
      const patterns = await getErrorPatterns(req.params.name, hours);
      res.json(patterns);
    } catch (err) {
      console.error('Error patterns query failed:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // Latency percentiles between two services
  app.get('/api/latency/:from/:to', async (req, res) => {
    try {
      const hours = parseInt(req.query.hours as string) || 24;
      const stats = await getLatencyPercentiles(req.params.from, req.params.to, hours);
      res.json(stats);
    } catch (err) {
      console.error('Latency query failed:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`UI Server running on http://localhost:${PORT}`);
  });
  
  if (PORT != OTLP_PORT) {
    const otlpApp = express();
    otlpApp.use(express.json({ limit: '50mb' }));
    otlpApp.use(cors());
    otlpApp.post('/v1/traces', async (req, res) => {
      const traceData = req.body;
      traces.push(traceData);
      io.emit('new_trace', traceData);

      try {
        const spans = extractSpans(traceData);
        if (spans.length > 0) {
          await storeTrace(traceData, spans);
        }
      } catch (err) {
        console.error('Failed to store trace in database:', err);
      }

      res.status(200).send({});
    });
    otlpApp.listen(OTLP_PORT, "0.0.0.0", () => {
      console.log(`OTLP Receiver running on http://localhost:${OTLP_PORT}`);
    });
  }
}

startServer();
