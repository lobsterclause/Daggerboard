import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: '*' }
  });

  const PORT = parseInt(process.env.PORT || '3000', 10);
  const OTLP_PORT = parseInt(process.env.OTLP_PORT || '4318', 10);

  // Middleware for OTLP JSON
  app.use(express.json({ limit: '50mb' }));
  app.use(cors());

  // In-memory trace storage
  const traces: any[] = [];

  // OTLP HTTP JSON Receiver Endpoint
  app.post('/v1/traces', (req, res) => {
    const traceData = req.body;
    traces.push(traceData);
    io.emit('new_trace', traceData);
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
    otlpApp.post('/v1/traces', (req, res) => {
      const traceData = req.body;
      traces.push(traceData);
      io.emit('new_trace', traceData);
      res.status(200).send({});
    });
    otlpApp.listen(OTLP_PORT, "0.0.0.0", () => {
      console.log(`OTLP Receiver running on http://localhost:${OTLP_PORT}`);
    });
  }
}

startServer();
