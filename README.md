# Si4k Search Engine

Unified, high-performance offline-first knowledge search engine for Kiwix, Wikipedia, wikiHow, iFixit, Stack Overflow, and local ZIM collections. Optimized for low-resource hardware (e.g. Intel i5 5th-Gen servers).

---

## Key Features & Architecture

- **Two-Wave Priority Search Model**:
  - Wave 1 searches high-relevance prioritized ZIM sources (e.g. ArchWiki for Arch Linux queries, Stack Overflow for code queries).
  - Wave 2 continues searching all remaining eligible ZIM sources in the library.
  - Priority determines search order, **never search scope** — search terminates only after full library traversal.
- **Progressive SSE Result Streaming**:
  - Emits progressive result batches over Server-Sent Events (SSE) as ZIM sources complete.
  - Real-time client rendering with monotonic execution time tracking (`executionTimeMs`).
- **User-Configurable LRU Search Cache**:
  - Deterministic caching controlled via `.env` (`SEARCH_CACHE_ENABLED`, `SEARCH_CACHE_TTL_SECONDS`, `SEARCH_CACHE_MAX_ENTRIES`).
  - Only complete search sessions are cached. In-progress queries bypass cache to prevent partial result pollution.
- **Server Concurrency Protection & Resource Efficiency**:
  - Strict concurrency limits (`SEARCH_MAX_CONCURRENT`, `SEARCH_MAX_ZIM_WORKERS`, `SEARCH_REQUEST_TIMEOUT_MS`) to protect CPU and memory on modest hardware.
  - Automatic `AbortSignal` handling cancels worker HTTP fetches when clients disconnect.
- **100% Offline & Self-Contained UI**:
  - Standalone SVG logo (`Si4kIcon`), inline SVG favicon, zero external network fonts/CDNs, and native system font stack.

---

## Project Structure

```
search.si4k.online/
├── package.json               # Node.js dependencies & npm scripts
├── tsconfig.json              # Base TypeScript configuration
├── tsconfig.server.json       # Node.js Express server TS configuration
├── vite.config.ts             # Vite client bundler & dev proxy configuration
├── .env.example               # Environment variable configuration template
├── systemd/
│   └── si4k-search.service    # Production systemd service unit file
├── src/
│   ├── shared/
│   │   └── types.ts           # Unified SearchResult, SearchResponse, SearchMode types
│   ├── server/
│   │   ├── index.ts           # Express server entry point & static server
│   │   ├── config.ts          # Central environment configuration loader
│   │   ├── search/
│   │   │   ├── SearchEngine.ts # Core search engine session manager & session queue
│   │   │   ├── resultCache.ts  # Deterministic LRU result cache
│   │   │   ├── zimDiscovery.ts # Dynamic ZIM library discovery & source ranker
│   │   │   ├── resultMixer.ts  # Adaptive result mixer & candidate limit filter
│   │   │   ├── articleRanker.ts # Category & keyword article relevance ranker
│   │   │   └── providers/
│   │   │       ├── KiwixProvider.ts     # Encapsulated Kiwix ZIM search provider
│   │   │       └── KiwixProvider.test.ts # Unit test verifying Kiwix provider
│   │   └── api/
│   │       └── searchRouter.ts # SSE /api/search stream endpoint
│   └── client/
│       ├── main.tsx           # React DOM entry point
│       ├── App.tsx            # Main search application component
│       ├── index.css          # Offline system-font search engine styling
│       ├── components/
│       │   ├── Header.tsx     # Brand logo, mode selector, and theme toggle
│       │   ├── SearchBar.tsx  # Large search input bar with Enter key support
│       │   ├── SearchResults.tsx # Progressive search results view with stream status
│       │   ├── ResultCard.tsx # Article snippet card component
│       │   ├── Si4kIcon.tsx   # Offline SVG brand icon
│       │   ├── LoadingState.tsx # Skeleton loading animation
│       │   └── ErrorState.tsx # Friendly error alert display
│       └── services/
│           └── api.ts         # SSE streaming client for /api/search
```

---

## Environment Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

### `.env` Parameters

```ini
# Server Configuration
PORT=3000
NODE_ENV=development

# Network Detection Configuration
ENVIRONMENT_OVERRIDE=auto
LOCAL_NETWORKS=192.168.0.0/16,10.0.0.0/8,172.16.0.0/12,127.0.0.1/32,::1/128

# Kiwix Target URLs
KIWIX_LOCAL_URL=http://localhost:8080
KIWIX_LOCAL_PUBLIC_URL=http://localhost:8080
KIWIX_ONLINE_URL=http://localhost:8080
KIWIX_ONLINE_PUBLIC_URL=https://wiki.example.com

# Kiwix Data & Metadata Paths
KIWIX_DATA_DIR=/var/kiwix/data
KIWIX_LIBRARY_XML=/var/kiwix/data/Metadata/library.xml

# Limits & Weights
KIWIX_CANDIDATE_LIMIT=100
MAX_CONCURRENT_ZIM_SEARCHES=8

# Server Concurrency & Protection
SEARCH_MAX_CONCURRENT=2
SEARCH_MAX_ZIM_WORKERS=4
SEARCH_REQUEST_TIMEOUT_MS=10000

# Search Cache Controls
SEARCH_CACHE_ENABLED=true
SEARCH_CACHE_TTL_SECONDS=300
SEARCH_CACHE_MAX_ENTRIES=100
SEARCH_CACHE_DEBUG=true
```

---

## Development & Testing

### Installation

```bash
npm install
```

### Running Development Server

Start the frontend (Vite port `5173`) and Express backend (`PORT 3000`) concurrently:

```bash
npm run dev
```

### Running Automated Test Suite

Execute all TypeScript checks and unit/integration tests:

```bash
npx tsc --noEmit && npm test
```

---

## Production Deployment

### Build Production Bundle

```bash
npm run build
```

This compiles:
- `dist/client/`: Static single-page web app.
- `dist/server/`: Express backend bundle.

### Start Production Server

```bash
npm start
```

### Systemd Service Setup

```bash
sudo mkdir -p /opt/si4k/search
sudo cp -r dist package.json package-lock.json node_modules /opt/si4k/search/
sudo cp systemd/si4k-search.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now si4k-search
```
