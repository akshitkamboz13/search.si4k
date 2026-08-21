import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { SearchEngine } from './search/SearchEngine.js';
import { KiwixProvider } from './search/providers/KiwixProvider.js';
import { createSearchRouter } from './api/searchRouter.js';
import { createConfigRouter } from './api/configRouter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust reverse proxies (Cloudflare, nginx, LAN proxies) for proper req.ip / req.protocol handling
app.set('trust proxy', true);

app.use(cors());
app.use(express.json());

// Initialize SearchEngine & Providers
const searchEngine = new SearchEngine();

const kiwixProvider = new KiwixProvider({
  localUrl: config.kiwix.localUrl,
  localPublicUrl: config.kiwix.localPublicUrl,
  onlineUrl: config.kiwix.onlineUrl,
  onlinePublicUrl: config.kiwix.onlinePublicUrl,
});

searchEngine.registerProvider(kiwixProvider);

// API Routes
app.use('/api', createSearchRouter(searchEngine));
app.use('/api/config', createConfigRouter(searchEngine));

// Health Check Endpoint (Basic service alive check)
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'si4k-search',
  });
});

// Deep Readiness Check (Verifies Kiwix availability)
app.get('/api/health/ready', async (_req, res) => {
  const isKiwixReady = await kiwixProvider.checkReadiness();
  if (isKiwixReady) {
    res.json({
      status: 'ready',
      service: 'si4k-search',
      kiwix: 'reachable',
      kiwixUrl: config.kiwix.localUrl,
    });
  } else {
    res.status(503).json({
      status: 'degraded',
      service: 'si4k-search',
      kiwix: 'unreachable',
      kiwixUrl: config.kiwix.localUrl,
    });
  }
});

// Serve built frontend assets in production mode
const clientDistPath = path.resolve(__dirname, '../../dist/client');
if (config.nodeEnv === 'production') {
  app.use(express.static(clientDistPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Start Server
const server = app.listen(config.port, async () => {
  const discovered = await searchEngine.getDiscoveredSources();
  console.log(`====================================================`);
  console.log(` Si4k Search Engine Running`);
  console.log(` Mode:               ${config.nodeEnv}`);
  console.log(` Port:               ${config.port}`);
  console.log(` Environment:        ${config.environment.override !== 'auto' ? `Override (${config.environment.override})` : 'Auto-detected'}`);
  console.log(` Kiwix Data Dir:     ${config.kiwix.dataDir}`);
  console.log(` Kiwix Library XML:  ${config.kiwix.libraryXml}`);
  console.log(` Kiwix Local URL:    ${config.kiwix.localUrl}`);
  console.log(` Kiwix Local Public: ${config.kiwix.localPublicUrl}`);
  console.log(` Discovered ZIMs:    ${discovered.length} entries`);
  console.log(` Providers:          ${searchEngine.getRegisteredProviders().join(', ')}`);
  console.log(`====================================================`);
});

const handleShutdown = (signal: string) => {
  console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);
  server.close(() => {
    console.log('[Server] Closed HTTP server connections.');
    searchEngine.shutdown();
    console.log('[Server] Shutdown complete.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[Server] Could not close connections in time, forcing exit.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

export { app, searchEngine };
