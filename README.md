# Si4k Search Engine

Unified, high-performance offline-first knowledge search engine for Kiwix and local ZIM collections including Wikipedia, wikiHow, iFixit, Stack Overflow, and other datasets. Optimized for modest home servers and offline knowledge infrastructure.

### Screenshots

| Landing & Search View | Real-Time Progressive Stream |
| :---: | :---: |
| ![Si4k Search Landing Page](docs/images/landing.png) | ![Si4k Search Results View](docs/images/search_results.png) |

| Dark Mode Theme |
| :---: |
| ![Si4k Search Dark Mode View](docs/images/dark_mode.png) |

---

## Why Si4k?

Kiwix makes offline knowledge available, but large ZIM collections can contain hundreds of independent knowledge sources.

Si4k Search provides a unified search layer across those sources.

Instead of:

```
User ──→ one ZIM ──→ search
```

Si4k provides:

```
User ──→ Si4k Search ──→ relevant ZIMs ──→ unified results
```

- **Priority-Aware Search**: Dynamically routes queries to intent-matched ZIM sources first (e.g., ArchWiki for Linux setup queries, Stack Overflow for coding questions).
- **Progressive Results**: Streams search matches to the user in real-time over SSE as individual ZIM sources complete.
- **Full-Library Traversal**: Never terminates early or restricts total candidate search scope — continues traversing the entire library to guarantee deterministic completeness.
- **Unified Pagination & Ranking**: Interleaves and re-ranks articles from multiple ZIMs using keyword frequency, category match, and source priority.
- **Modest Hardware Optimization**: Designed to run efficiently on low-resource home servers (such as older Intel i5 5th-Gen servers).
- **Configurable Deployment**: Easy to deploy via Docker, Docker Compose, or standalone Node.js daemon.

---

## Architecture Overview

```
                         ┌─────────────────┐
                         │   User Query    │
                         └────────┬────────┘
                                  │
                                  ▼
                       ┌─────────────────────┐
                       │ Query / Intent      │
                       │ Classification      │
                       └─────────┬───────────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
              Priority Sources          Remaining Sources
                    │                         │
                    └────────────┬────────────┘
                                 ▼
                       ┌──────────────────┐
                       │ Kiwix Providers  │
                       └────────┬─────────┘
                                ▼
                       ┌──────────────────┐
                       │ Result Mixer     │
                       │ + Ranking        │
                       └────────┬─────────┘
                                ▼
                       ┌──────────────────┐
                       │ Progressive SSE  │
                       └────────┬─────────┘
                                ▼
                         Search Results
```

### Key Components

- **Two-Wave Priority Search Model**:
  - **Wave 1**: Searches high-relevance prioritized ZIM sources.
  - **Wave 2**: Continues searching remaining eligible ZIM sources until the configured search scope is exhausted or the search is cancelled.
  - Priority determines search order, **never search scope**.
- **Progressive SSE Result Streaming**:
  - Emits progressive result batches over Server-Sent Events (SSE) as ZIM sources complete.
  - Real-time client rendering with monotonic execution time tracking (`executionTimeMs`).
- **User-Configurable LRU Search Cache**:
  - Deterministic caching controlled via `.env` (`SEARCH_CACHE_ENABLED`, `SEARCH_CACHE_TTL_SECONDS`, `SEARCH_CACHE_MAX_ENTRIES`).
  - Only complete search sessions enter the cache to prevent partial result pollution.
- **Server Concurrency Valve & Resource Protection**:
  - Queue-backed concurrency controls (`SEARCH_MAX_CONCURRENT=2`, `SEARCH_MAX_ZIM_WORKERS=4`, `SEARCH_REQUEST_TIMEOUT_MS=10000`).
  - Automatic `AbortSignal` propagation cancels worker HTTP fetches when clients disconnect.
- **Offline-first & Self-Contained UI**:
  - Standalone inline SVG logo (`Si4kIcon`), inline SVG favicon, zero external network fonts/CDNs, and native system font stack.

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

### Docker Build Requirements

The Docker image does not require a running Kiwix server during build.

If the Kiwix catalog is unavailable while building, Si4k Search preserves the prebuilt ZIM index included with the repository. Kiwix connectivity is configured at runtime through `KIWIX_URL`.

For Docker Compose, the default is:

`http://kiwix:8080`

This allows the image to be built independently of the host's Kiwix installation or private network.

---

## Performance & Benchmarks

In current development benchmarks, Si4k Search remained around **160–230 MB RSS** memory under the tested workloads. Actual usage depends on query volume, ZIM count, concurrency, and configuration.

### Development Benchmark Summary

| Workload / Metric | Result |
| :--- | ---: |
| **ZIM sources searched** | 127 ZIM collections |
| **Concurrent search sessions** | 2 |
| **ZIM workers / search** | 4 |
| **Peak Node RSS Memory** | ~230 MB |
| **1 Uncached Search (Full Library Traversal)** | ~25 s |
| **10 Concurrent Requests** | 0 failures / timeouts |
| **Sustained Memory Leak Test (20 searches)** | No memory growth observed |

*Note: Benchmarks were performed on the development host. Target-server performance will vary by hardware, storage, network, and ZIM configuration.*

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
  Returns `200 OK`:
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

## Extensibility & Extension Roadmap

### Core Design Principle
> **Optional capabilities must never become mandatory dependencies of the core search engine.**
>
> Si4k Search operates out of the box as **Search Core + Knowledge Providers**. Additional capabilities (+ Voice, + Translation, + Dictionary, + AI, + Maps) are pluggable extension interfaces that can be activated independently.

### Extension Phases

#### Phase 1: Knowledge Providers (`SearchProvider`)
- Kiwix / ZIM (Wikipedia, wikiHow, iFixit, Stack Overflow, DevDocs)
- Offline Documents (PDF, ePub, Markdown)
- OpenStreetMap / Nominatim location datasets
- Custom structured JSON/XML datasets

#### Phase 2: Local Language Capabilities (`LanguageProvider`)
- Offline language detection
- Downloadable offline dictionaries & term lookup
- Query translation (e.g. English query routed to Hindi ZIMs with cross-lingual unified ranking)
- Multilingual query expansion

```
User Query ──→ Language Detection
                    │
                    ├── original query ──→ English ZIMs ──┐
                    │                                     ├──→ Unified Ranking
                    └── translation ────→ Hindi ZIMs ────┘
```

#### Phase 3: Voice Search (`SpeechToTextProvider`)
- Optional local speech-to-text (STT) provider (`Microphone ──→ Local STT ──→ Search Query`).
- Completely decoupled; core search requires zero voice or STT packages.

#### Phase 4: AI-Assisted Search (`SummaryProvider`)
- Optional grounded summary generation using local LLMs (e.g. Ollama/llama.cpp) or custom AI endpoints.
- Pipeline: `Search ──→ Top N Ranked Results ──→ SummaryProvider ──→ Grounded Summary + Source Citations`.
- Core search remains 100% operational without an AI model.

---

## Troubleshooting

1. **`GET /api/health/ready` returns 503 Service Unavailable**:
   - Check if `KIWIX_URL` matches your Kiwix server address.
   - Verify network accessibility: `curl http://<KIWIX_HOST>:8080/`.
2. **Search results link to unreachable URLs**:
   - Ensure `KIWIX_PUBLIC_URL` matches the address accessible by your client browser.
3. **No ZIM sources discovered**:
   - Verify `KIWIX_LIBRARY_XML` path points to a valid `library.xml` file.

---

## Contributing

Contributions are welcome! Key areas where contributions are particularly useful:

- Search providers (OSM, PDF, EPUB, Structured Datasets)
- Ranking & relevance algorithms
- ZIM discovery & categorization
- Performance & memory optimization
- Multilingual language support & dictionaries
- Local AI / Summary providers
- UI / UX enhancements
- Docker & home-server deployment guides

---

## License

Si4k Search is open-source software licensed under the [MIT License](LICENSE).

*Note: Individual ZIM datasets, books, and articles indexed by Kiwix may have their own licenses and redistribution terms. Check the license of each specific dataset before redistributing ZIM files.*
