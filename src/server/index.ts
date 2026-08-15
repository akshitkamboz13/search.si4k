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
  localUrl: config.kiwix.localUrl,
  localPublicUrl: config.kiwix.localPublicUrl,
  onlineUrl: config.kiwix.onlineUrl,
  onlinePublicUrl: config.kiwix.onlinePublicUrl,
});

searchEngine.registerProvider(kiwixProvider);

// API Routes
app.use('/api', createSearchRouter(searchEngine));

// Health Check Endpoint
app.get('/api/health', async (_req, res) => {
  const discovered = await searchEngine.getDiscoveredSources();
  res.json({
    status: 'ok',
    service: 'si4k-search',
    mode: config.nodeEnv,
    providers: searchEngine.getRegisteredProviders(),
    discoveredZimsCount: discovered.length,
    config: {
      dataDir: config.kiwix.dataDir,
      libraryXml: config.kiwix.libraryXml,
      kiwixLocalUrl: config.kiwix.localUrl,
      kiwixLocalPublicUrl: config.kiwix.localPublicUrl,
      kiwixOnlineUrl: config.kiwix.onlineUrl,
      kiwixOnlinePublicUrl: config.kiwix.onlinePublicUrl,
    },
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
app.listen(config.port, async () => {
  const discovered = await searchEngine.getDiscoveredSources();
  console.log(`====================================================`);
  console.log(` Si4k Search Engine Running`);
  console.log(` Mode:               ${config.nodeEnv}`);
  console.log(` Port:               ${config.port}`);
  console.log(` Kiwix Data Dir:     ${config.kiwix.dataDir}`);
  console.log(` Kiwix Library XML:  ${config.kiwix.libraryXml}`);
  console.log(` Kiwix Local URL:    ${config.kiwix.localUrl}`);
  console.log(` Kiwix Local Public: ${config.kiwix.localPublicUrl}`);
  console.log(` Discovered ZIMs:    ${discovered.length} entries`);
  console.log(` Providers:          ${searchEngine.getRegisteredProviders().join(', ')}`);
  console.log(`====================================================`);
});

export { app, searchEngine };
