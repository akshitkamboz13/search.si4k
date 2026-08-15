import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { SearchEngine } from './search/SearchEngine.js';
import { KiwixProvider } from './search/providers/KiwixProvider.js';
import { createSearchRouter } from './api/searchRouter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

// Initialize SearchEngine & Providers
const searchEngine = new SearchEngine();

const kiwixProvider = new KiwixProvider({
  internalUrl: config.kiwixUrl,
  publicUrl: config.kiwixPublicUrl,
  sources: searchEngine.getSources(),
});

searchEngine.registerProvider(kiwixProvider);

// API Routes
app.use('/api', createSearchRouter(searchEngine));

// Health Check Endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'si4k-search',
    mode: config.nodeEnv,
    providers: searchEngine.getRegisteredProviders(),
    sourcesCount: searchEngine.getSources().length,
    kiwixUrl: config.kiwixUrl,
    kiwixPublicUrl: config.kiwixPublicUrl,
  });
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
app.listen(config.port, () => {
  console.log(`====================================================`);
  console.log(` Si4k Search Engine Running`);
  console.log(` Mode:           ${config.nodeEnv}`);
  console.log(` Port:           ${config.port}`);
  console.log(` Kiwix Internal: ${config.kiwixUrl}`);
  console.log(` Kiwix Public:   ${config.kiwixPublicUrl}`);
  console.log(` Providers:      ${searchEngine.getRegisteredProviders().join(', ')}`);
  console.log(` Sources:        ${searchEngine.getSources().map(s => s.name).join(', ')}`);
  console.log(`====================================================`);
});

export { app, searchEngine };
