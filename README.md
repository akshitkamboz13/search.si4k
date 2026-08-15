# Si4k Search Engine

Unified, high-performance offline-first knowledge search engine for Kiwix, Wikipedia, wikiHow, iFixit, Stack Overflow, and local ZIM collections. Optimized for modest home servers and offline knowledge infrastructure.

---

## Quick Start with Docker

### Option A: Complete Docker Compose Stack (Si4k Search + Kiwix Server)

If you have ZIM datasets located on your host machine (e.g., at `/mnt/knowledge`), run:

```bash
docker compose up -d
```

Si4k Search will be accessible at `http://localhost:3000`.

### Option B: Connecting Si4k Search to an Existing Kiwix Server

If you already have `kiwix-serve` running on your local network (e.g., at `http://192.168.1.100:8080`):

```bash
docker run -d \
  --name si4k-search \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e KIWIX_URL=http://192.168.1.100:8080 \
  -e KIWIX_PUBLIC_URL=http://192.168.1.100:8080 \
  -e KIWIX_DATA_DIR=/knowledge \
  -e KIWIX_LIBRARY_XML=/knowledge/Metadata/library.xml \
  -v /mnt/knowledge:/knowledge:ro \
  si4k-search:latest
```

---

## Key Architecture & Features

- **Two-Wave Priority Search Model**:
  - **Wave 1**: Searches high-relevance prioritized ZIM sources (e.g., ArchWiki for Linux/Arch queries, Stack Overflow for code queries).
  - **Wave 2**: Traverses all remaining eligible ZIM sources in the library.
  - Priority determines search order, **never search scope** — search finishes only after full library traversal.
- **Progressive SSE Result Streaming**:
  - Emits progressive result batches over Server-Sent Events (SSE) as ZIM sources complete.
  - Real-time client rendering with monotonic execution time tracking (`executionTimeMs`).
- **User-Configurable LRU Search Cache**:
  - Deterministic caching controlled via `.env` (`SEARCH_CACHE_ENABLED`, `SEARCH_CACHE_TTL_SECONDS`, `SEARCH_CACHE_MAX_ENTRIES`).
  - Only complete search sessions enter the cache to prevent partial result pollution.
- **Server Concurrency Valve & Resource Efficiency**:
  - Strict queue-backed concurrency controls (`SEARCH_MAX_CONCURRENT=2`, `SEARCH_MAX_ZIM_WORKERS=4`, `SEARCH_REQUEST_TIMEOUT_MS=10000`).
  - Automatic `AbortSignal` propagation cancels worker HTTP fetches when clients disconnect.
- **100% Offline & Self-Contained UI**:
  - Standalone inline SVG logo (`Si4kIcon`), inline SVG favicon, zero external network fonts/CDNs, and native system font stack.

---

## Environment Variables

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | HTTP port exposed by Express server |
| `NODE_ENV` | `production` | Application execution mode (`production` / `development`) |
| `KIWIX_URL` | `http://kiwix:8080` | Internal backend URL used by Node process to query Kiwix server |
| `KIWIX_PUBLIC_URL` | `http://localhost:8080` | Browser-facing public target URL used for result article links |
| `KIWIX_DATA_DIR` | `/knowledge` | Path to host-mounted knowledge library root directory |
| `KIWIX_LIBRARY_XML` | `/knowledge/Metadata/library.xml` | Path to host-mounted Kiwix `library.xml` catalog file |
| `KIWIX_CANDIDATE_LIMIT` | `100` | Maximum raw candidate limit per individual ZIM source |
| `SEARCH_MAX_CONCURRENT` | `2` | Maximum concurrent progressive search sessions running in backend |
| `SEARCH_MAX_ZIM_WORKERS` | `4` | Maximum parallel ZIM worker fetches per search session |
| `SEARCH_REQUEST_TIMEOUT_MS` | `10000` | Maximum HTTP request timeout for individual Kiwix ZIM fetches |
| `SEARCH_CACHE_ENABLED` | `true` | Enable/disable deterministic search result caching |
| `SEARCH_CACHE_TTL_SECONDS` | `300` | Time-to-live for cached search queries (in seconds) |
| `SEARCH_CACHE_MAX_ENTRIES` | `100` | Maximum entries retained in LRU cache |

---

## Health Check & Monitoring Endpoints

- **Service Liveness Endpoint**:
  ```bash
  curl http://localhost:3000/api/health
  ```
  Returns `200 OK` with status:
  ```json
  {
    "status": "ok",
    "service": "si4k-search"
  }
  ```
  *Note: `/api/health` does NOT fail if Kiwix is temporarily offline.*

- **Kiwix Readiness Endpoint**:
  ```bash
  curl http://localhost:3000/api/health/ready
  ```
  Returns `200 OK` when Kiwix is reachable (`"kiwix": "reachable"`), or `503 Service Unavailable` when Kiwix is offline (`"kiwix": "unreachable"`).

---

## Mounting ZIM Library & External Kiwix Setup

### Mounting Host Knowledge Directory

ZIM knowledge libraries can be hundreds of gigabytes in size. **Do not copy ZIM files into Docker images.** Mount your host knowledge directory into the container:

```yaml
volumes:
  - /mnt/knowledge:/knowledge:ro
```

Expected directory layout on host:

```
/mnt/knowledge/
├── Metadata/
│   └── library.xml
└── ZIM/
    ├── wikipedia_en_all_maxi.zim
    ├── wikihow_en_maxi.zim
    └── archlinux_en_all_maxi.zim
```

---

## Resource Configuration & Limits

For modest server hardware (e.g. Intel i5 5th-Gen servers, 4GB–8GB RAM):

- **Internal Concurrency Valve**: Keep `SEARCH_MAX_CONCURRENT=2` and `SEARCH_MAX_ZIM_WORKERS=4`. This prevents CPU saturation during heavy concurrent search traffic.
- **Memory Overhead**: Si4k Search uses only **~160MB–230MB RSS** memory. No restrictive Docker RAM caps are required.

---

## Graceful Shutdown

During container shutdown or restarting (`docker stop` or `docker compose down`), Node.js catches `SIGTERM` and `SIGINT`:
1. Express stops accepting new HTTP connections.
2. Active search sessions and SSE streams are cleanly aborted/closed.
3. Process exits with code 0.

---

## Local Development & Manual Testing

### Building Locally

```bash
npm install
npm run build
```

### Running Automated Test Suite

```bash
npx tsc --noEmit && npm test
```

### Manual Verification Script

```bash
npx tsx src/server/dockerVerification.test.ts
```

---

## Troubleshooting

1. **`GET /api/health/ready` returns 503 Service Unavailable**:
   - Check if `KIWIX_URL` matches your Kiwix server address.
   - Verify network accessibility: `curl http://<KIWIX_HOST>:8080/`.
2. **Search results link to unreachable URLs**:
   - Ensure `KIWIX_PUBLIC_URL` matches the address accessible by your client browser.
3. **No ZIM sources discovered**:
   - Verify `KIWIX_LIBRARY_XML` path points to a valid `library.xml` file.
