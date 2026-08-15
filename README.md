# Si4k Search Engine (MVP)

Unified offline-first knowledge search engine for home servers and local knowledge datasets.

---

## 1. Project Structure

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
│   │   │   ├── SearchEngine.ts # Provider-agnostic search engine core
│   │   │   ├── types.ts       # SearchProvider interface definition
│   │   │   └── providers/
│   │   │       ├── KiwixProvider.ts     # Encapsulated Kiwix ZIM search provider
│   │   │       ├── KiwixProvider.test.ts # Unit test verifying URL safety
│   │   │       └── README.md            # Guide for adding new search providers
│   │   └── api/
│   │       └── searchRouter.ts # GET /api/search HTTP route handler
│   └── client/
│       ├── main.tsx           # React DOM entry point
│       ├── App.tsx            # Main search application component
│       ├── index.css          # Modern light-default search engine styling
│       ├── components/
│       │   ├── Header.tsx     # Brand logo, mode selector, and theme toggle
│       │   ├── SearchBar.tsx  # Large search input bar with Enter key support
│       │   ├── SearchResults.tsx # Results display with source tags
│       │   ├── ResultCard.tsx # Article snippet card component
│       │   ├── LoadingState.tsx # Skeleton loading animation
│       │   └── ErrorState.tsx # Friendly error alert display
│       └── services/
│           └── api.ts         # Frontend API client for /api/search
```

---

## 2. How to Install Dependencies

Make sure Node.js (v18+) is installed on your system. Run:

```bash
npm install
```

---

## 3. How to Configure KIWIX_URL & KIWIX_PUBLIC_URL

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` according to your environment:

- **`KIWIX_URL`**: Server-to-server API request URL used by backend node process to query `kiwix-serve`.
  - Development Laptop: `http://si4k-server.local:8080`
  - Production Server: `http://localhost:8080`
- **`KIWIX_PUBLIC_URL`**: Target URL exposed in search result links for user browsers to open articles.
  - Development / LAN Mode: `http://si4k-server.local:8080`
  - Internet Production Mode: `https://wiki.si4k.online`
- **`PORT`**: Server HTTP port (default: `3000`).
- **`NODE_ENV`**: Set to `development` or `production`.

---

## 4. How to Run Development Mode

Run frontend (Vite port `5173`) and backend Express server (`PORT 3000`) concurrently with hot-reloading:

```bash
npm run dev
```

Then open `http://localhost:5173` in your browser. Requests to `/api/search` are automatically proxied to `http://localhost:3000/api/search`.

---

## 5. How to Build Production

Compile both the React Vite client and the TypeScript Express backend into the `dist/` directory:

```bash
npm run build
```

This generates:
- `dist/client/`: Compiled production single-page frontend application.
- `dist/server/`: Compiled Node.js backend server JavaScript code.

---

## 6. How to Start Production

Set `NODE_ENV=production` and start the server:

```bash
npm start
```

### Systemd Production Deployment

1. Copy the built project to `/opt/si4k/search`:
   ```bash
   sudo mkdir -p /opt/si4k/search
   sudo cp -r dist package.json package-lock.json node_modules /opt/si4k/search/
   ```
2. Copy the systemd service file:
   ```bash
   sudo cp systemd/si4k-search.service /etc/systemd/system/
   ```
3. Enable and start the service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable si4k-search
   sudo systemctl start si4k-search
   ```

---

## 7. How to Test the Kiwix Provider

A dedicated test is included to verify that `KiwixProvider` successfully parses search results and **never returns localhost or internal URLs to the browser**:

Run the automated test:

```bash
npm test
```

Expected output:
```
--- Running KiwixProvider Production URL Test ---
Parsed 2 results.
Checking result: "How to Repair a Hole in a Wall" -> https://wiki.si4k.online/wikihow_en_all_2023-05/A/Repair_a_Hole_in_a_Wall.html
Checking result: "Delhi" -> https://wiki.si4k.online/wikipedia_en_all_maxi_2023-11/A/Delhi.html
✅ PASS: All Kiwix result URLs properly use KIWIX_PUBLIC_URL and never expose localhost!
```

---

## 8. How to Add a Future Provider (OSM, Books, Documents, etc.)

1. Create a new provider file in `src/server/search/providers/YourProvider.ts` implementing `SearchProvider`:

```typescript
import { SearchProvider } from '../types.js';
import { SearchResult, SearchOptions } from '../../../shared/types.js';

export class OSMProvider implements SearchProvider {
  readonly name = 'osm';

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    // Query OSM/Nominatim database...
    return [
      {
        id: `osm-${Date.now()}`,
        source: 'OpenStreetMap',
        provider: this.name,
        type: 'place',
        title: query,
        description: 'Location from offline OpenStreetMap dataset',
        url: `https://maps.si4k.online/?q=${encodeURIComponent(query)}`,
      },
    ];
  }
}
```

2. Register the provider in `src/server/index.ts`:

```typescript
import { OSMProvider } from './search/providers/OSMProvider.js';

searchEngine.registerProvider(new OSMProvider());
```

`SearchEngine` automatically executes all registered providers in parallel without needing code changes to the core search engine or API handlers.

---

## 9. Assumptions Made

1. **Kiwix Search Endpoint**: `kiwix-serve` exposes search queries via HTTP at `${KIWIX_URL}/search?q={query}`. `KiwixProvider` parses HTML output cleanly using Cheerio.
2. **URL Mapping**: Server-to-server API calls use `KIWIX_URL`, whereas browser-facing links use `KIWIX_PUBLIC_URL`.
3. **Provider Ranking**: In MVP, results maintain raw provider ordering. Unified cross-provider re-scoring will be implemented when multiple providers are activated.
4. **Search Modes**: The API supports `?mode=local` and `?mode=online`. In the MVP, both query the local offline providers.
