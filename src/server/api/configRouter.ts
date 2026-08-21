import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EnvironmentDetector } from '../search/EnvironmentDetector.js';
import { SearchEngine } from '../search/SearchEngine.js';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve .env path relative to project root (3 levels up from src/server/api)
const ENV_FILE_PATH = path.resolve(__dirname, '../../../.env');

const envDetector = new EnvironmentDetector();

/**
 * Whitelisted env keys that LAN users are allowed to view and edit.
 * Filesystem paths are shown read-only to internet users but fully editable on LAN.
 * Sensitive server keys (PORT, NODE_ENV) are intentionally excluded.
 */
export const CONFIG_FIELDS: ConfigField[] = [
  // --- Environment & Network ---
  {
    key: 'ENVIRONMENT_OVERRIDE',
    label: 'Environment Override',
    group: 'Environment & Network',
    description: 'Force environment detection: "auto", "local", or "internet".',
    type: 'select',
    options: ['auto', 'local', 'internet'],
  },
  {
    key: 'LOCAL_NETWORKS',
    label: 'Local Networks (CIDR)',
    group: 'Environment & Network',
    description: 'Comma-separated CIDR blocks considered local/LAN.',
    type: 'text',
  },

  // --- Kiwix URLs ---
  {
    key: 'KIWIX_LOCAL_URL',
    label: 'Kiwix Local URL',
    group: 'Kiwix URLs',
    description: 'Internal URL used by the server to reach Kiwix on LAN.',
    type: 'text',
  },
  {
    key: 'KIWIX_LOCAL_PUBLIC_URL',
    label: 'Kiwix Local Public URL',
    group: 'Kiwix URLs',
    description: 'Public-facing URL for LAN users to open Kiwix articles.',
    type: 'text',
  },
  {
    key: 'KIWIX_ONLINE_URL',
    label: 'Kiwix Online URL',
    group: 'Kiwix URLs',
    description: 'Internal URL used by the server to reach Kiwix from internet.',
    type: 'text',
  },
  {
    key: 'KIWIX_ONLINE_PUBLIC_URL',
    label: 'Kiwix Online Public URL',
    group: 'Kiwix URLs',
    description: 'Public-facing URL for internet users to open Kiwix articles.',
    type: 'text',
  },

  // --- Kiwix Data Paths ---
  {
    key: 'KIWIX_DATA_DIR',
    label: 'Kiwix Data Directory',
    group: 'Kiwix Data Paths',
    description: 'Absolute filesystem path where ZIM files are stored.',
    type: 'text',
    lanOnly: true,
  },
  {
    key: 'KIWIX_LIBRARY_XML',
    label: 'Kiwix Library XML',
    group: 'Kiwix Data Paths',
    description: 'Absolute path to the Kiwix library.xml metadata file.',
    type: 'text',
    lanOnly: true,
  },

  // --- Candidate & Fetch Limits ---
  {
    key: 'KIWIX_CANDIDATE_LIMIT',
    label: 'Candidate Limit',
    group: 'Candidate & Fetch Limits',
    description: 'Max candidate results fetched per ZIM source per search.',
    type: 'number',
  },
  {
    key: 'KIWIX_MAX_SEARCH_SOURCES',
    label: 'Max Search Sources',
    group: 'Candidate & Fetch Limits',
    description: 'Max number of ZIM sources queried per search. Leave empty for all.',
    type: 'number',
  },
  {
    key: 'MAX_CONCURRENT_ZIM_SEARCHES',
    label: 'Max Concurrent ZIM Searches',
    group: 'Candidate & Fetch Limits',
    description: 'Concurrent parallel ZIM fetch calls allowed.',
    type: 'number',
  },
  {
    key: 'KIWIX_CACHE_TTL_SECONDS',
    label: 'Kiwix Cache TTL (seconds)',
    group: 'Candidate & Fetch Limits',
    description: 'Time-to-live for Kiwix provider result cache.',
    type: 'number',
  },

  // --- Search Scoring Weights ---
  {
    key: 'SEARCH_KEYWORD_WEIGHT',
    label: 'Keyword Weight',
    group: 'Search Scoring Weights',
    description: 'Multiplier applied to keyword match score.',
    type: 'number',
  },
  {
    key: 'SEARCH_BASE_PRIORITY_WEIGHT',
    label: 'Base Priority Weight',
    group: 'Search Scoring Weights',
    description: 'Multiplier applied to source base priority.',
    type: 'number',
  },
  {
    key: 'SEARCH_MIN_SOURCE_SCORE',
    label: 'Min Source Score',
    group: 'Search Scoring Weights',
    description: 'Minimum relevance score for a source to be included.',
    type: 'number',
  },

  // --- Concurrency & Protection ---
  {
    key: 'SEARCH_MAX_CONCURRENT',
    label: 'Max Concurrent Search Sessions',
    group: 'Concurrency & Protection',
    description: 'Max simultaneous search sessions.',
    type: 'number',
  },
  {
    key: 'SEARCH_MAX_ZIM_WORKERS',
    label: 'Max ZIM Workers',
    group: 'Concurrency & Protection',
    description: 'Max concurrent ZIM worker threads per session.',
    type: 'number',
  },
  {
    key: 'SEARCH_REQUEST_TIMEOUT_MS',
    label: 'Request Timeout (ms)',
    group: 'Concurrency & Protection',
    description: 'Max milliseconds a search session can run before timeout.',
    type: 'number',
  },
  {
    key: 'SEARCH_MAX_MIXED_RESULTS',
    label: 'Max Mixed Results Pool',
    group: 'Concurrency & Protection',
    description: 'Max candidate articles kept after cross-ZIM mixing.',
    type: 'number',
  },
  {
    key: 'SEARCH_MIN_SOURCES_BEFORE_STREAM_MIX',
    label: 'Min Sources Before Stream Mix',
    group: 'Concurrency & Protection',
    description: 'Number of ZIM sources required before emitting progressive mix (if > searched ZIMs, mixes once at end).',
    type: 'number',
  },

  // --- Search Cache ---
  {
    key: 'SEARCH_CACHE_ENABLED',
    label: 'Cache Enabled',
    group: 'Search Cache',
    description: 'Enable or disable search result caching.',
    type: 'boolean',
  },
  {
    key: 'SEARCH_CACHE_TTL_SECONDS',
    label: 'Cache TTL (seconds)',
    group: 'Search Cache',
    description: 'How long cached search results live.',
    type: 'number',
  },
  {
    key: 'SEARCH_CACHE_MAX_ENTRIES',
    label: 'Cache Max Entries',
    group: 'Search Cache',
    description: 'Maximum number of cached search queries.',
    type: 'number',
  },
  {
    key: 'SEARCH_CACHE_DEBUG',
    label: 'Cache Debug Logging',
    group: 'Search Cache',
    description: 'Enable verbose cache hit/miss logging.',
    type: 'boolean',
  },
];

export interface ConfigField {
  key: string;
  label: string;
  group: string;
  description: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  options?: string[];    // for select type
  lanOnly?: boolean;     // if true, hidden entirely from internet users
}

export interface ConfigEntry {
  key: string;
  value: string;
  label: string;
  group: string;
  description: string;
  type: ConfigField['type'];
  options?: string[];
  lanOnly?: boolean;
}

const WHITELISTED_KEYS = new Set(CONFIG_FIELDS.map((f) => f.key));

/**
 * Sanitize a config value: strip newlines and null bytes to prevent .env injection.
 */
function sanitizeValue(val: string): string {
  return val.replace(/[\r\n\0]/g, '').trim();
}

/**
 * Parse an existing .env file into a key-value map (preserves comments & ordering).
 */
function parseEnvFile(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    map.set(key, value);
  }
  return map;
}

/**
 * Write updated values back into the .env file, preserving comments and line order.
 * Keys not already present are appended at the end.
 */
function writeEnvFile(updates: Record<string, string>): void {
  let content = fs.existsSync(ENV_FILE_PATH) ? fs.readFileSync(ENV_FILE_PATH, 'utf8') : '';

  const updatedKeys = new Set<string>();

  // Replace existing key=value lines in-place
  content = content.replace(/^([A-Z_][A-Z0-9_]*)=(.*)$/gm, (match, key) => {
    if (key in updates) {
      updatedKeys.add(key);
      return `${key}=${updates[key]}`;
    }
    return match;
  });

  // Append any new keys that didn't exist
  for (const [key, value] of Object.entries(updates)) {
    if (!updatedKeys.has(key)) {
      content += `\n${key}=${value}`;
    }
  }

  fs.writeFileSync(ENV_FILE_PATH, content, 'utf8');
}

/**
 * Read current .env values into the whitelisted config fields.
 */
function readCurrentEnvValues(isLan: boolean): ConfigEntry[] {
  const envContent = fs.existsSync(ENV_FILE_PATH) ? fs.readFileSync(ENV_FILE_PATH, 'utf8') : '';
  const envMap = parseEnvFile(envContent);

  return CONFIG_FIELDS
    .filter((field) => isLan || !field.lanOnly)
    .map((field) => ({
      key: field.key,
      value: envMap.get(field.key) ?? (process.env[field.key] ?? ''),
      label: field.label,
      group: field.group,
      description: field.description,
      type: field.type,
      options: field.options,
      lanOnly: field.lanOnly,
    }));
}

export function createConfigRouter(searchEngine?: SearchEngine): Router {
  const router = Router();

  /**
   * GET /api/config
   * Returns current config values. LAN users see all fields; internet users see non-lanOnly fields.
   */
  router.get('/', (req: Request, res: Response) => {
    const detection = envDetector.detectEnvironment(req);
    const isLan = detection.environment === 'local';

    const entries = readCurrentEnvValues(isLan);

    res.json({
      isLan,
      environment: detection.environment,
      clientIp: detection.clientIp,
      fields: entries,
    });
  });

  /**
   * POST /api/config
   * Updates .env values. **LAN only.** Internet requests are rejected with 403.
   * Body: { updates: Record<string, string> }
   */
  router.post('/', (req: Request, res: Response) => {
    const detection = envDetector.detectEnvironment(req);

    if (detection.environment !== 'local') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Config editing is only allowed from LAN connections.',
        clientIp: detection.clientIp,
      });
      return;
    }

    const body = req.body as { updates?: Record<string, string> };
    if (!body || typeof body.updates !== 'object' || Array.isArray(body.updates)) {
      res.status(400).json({ error: 'Bad Request', message: 'Expected body: { updates: Record<string, string> }' });
      return;
    }

    const safeUpdates: Record<string, string> = {};
    const rejected: string[] = [];

    for (const [key, rawValue] of Object.entries(body.updates)) {
      if (!WHITELISTED_KEYS.has(key)) {
        rejected.push(key);
        continue;
      }
      if (typeof rawValue !== 'string') {
        rejected.push(key);
        continue;
      }
      safeUpdates[key] = sanitizeValue(rawValue);
    }

    if (Object.keys(safeUpdates).length === 0) {
      res.status(400).json({
        error: 'No valid updates',
        message: 'None of the provided keys are whitelisted.',
        rejected,
      });
      return;
    }

    try {
      writeEnvFile(safeUpdates);

      // Hot-patch process.env so new values take effect immediately (without restart)
      for (const [key, value] of Object.entries(safeUpdates)) {
        process.env[key] = value;
      }

      // Update in-memory config fields where possible
      if (safeUpdates.ENVIRONMENT_OVERRIDE !== undefined) {
        const raw = safeUpdates.ENVIRONMENT_OVERRIDE.toLowerCase();
        config.environment.override = (raw === 'local' || raw === 'internet') ? raw : 'auto';
      }
      if (safeUpdates.LOCAL_NETWORKS !== undefined) {
        config.environment.localNetworks = safeUpdates.LOCAL_NETWORKS.split(',').map((s) => s.trim()).filter(Boolean);
      }
      if (safeUpdates.KIWIX_LOCAL_URL !== undefined) config.kiwix.localUrl = safeUpdates.KIWIX_LOCAL_URL.replace(/\/$/, '');
      if (safeUpdates.KIWIX_LOCAL_PUBLIC_URL !== undefined) config.kiwix.localPublicUrl = safeUpdates.KIWIX_LOCAL_PUBLIC_URL.replace(/\/$/, '');
      if (safeUpdates.KIWIX_ONLINE_URL !== undefined) config.kiwix.onlineUrl = safeUpdates.KIWIX_ONLINE_URL.replace(/\/$/, '');
      if (safeUpdates.KIWIX_ONLINE_PUBLIC_URL !== undefined) config.kiwix.onlinePublicUrl = safeUpdates.KIWIX_ONLINE_PUBLIC_URL.replace(/\/$/, '');
      if (safeUpdates.KIWIX_CANDIDATE_LIMIT !== undefined) config.kiwix.candidateLimit = parseInt(safeUpdates.KIWIX_CANDIDATE_LIMIT, 10) || config.kiwix.candidateLimit;
      if (safeUpdates.MAX_CONCURRENT_ZIM_SEARCHES !== undefined) config.kiwix.maxConcurrentSearches = parseInt(safeUpdates.MAX_CONCURRENT_ZIM_SEARCHES, 10) || config.kiwix.maxConcurrentSearches;
      if (safeUpdates.KIWIX_CACHE_TTL_SECONDS !== undefined) config.kiwix.cacheTtlMs = (parseInt(safeUpdates.KIWIX_CACHE_TTL_SECONDS, 10) || 300) * 1000;
      if (safeUpdates.SEARCH_KEYWORD_WEIGHT !== undefined) config.search.keywordWeight = parseFloat(safeUpdates.SEARCH_KEYWORD_WEIGHT) || config.search.keywordWeight;
      if (safeUpdates.SEARCH_BASE_PRIORITY_WEIGHT !== undefined) config.search.basePriorityWeight = parseFloat(safeUpdates.SEARCH_BASE_PRIORITY_WEIGHT) || config.search.basePriorityWeight;
      if (safeUpdates.SEARCH_MIN_SOURCE_SCORE !== undefined) config.search.minSourceScore = parseFloat(safeUpdates.SEARCH_MIN_SOURCE_SCORE) || config.search.minSourceScore;
      if (safeUpdates.SEARCH_MAX_CONCURRENT !== undefined) config.search.maxConcurrentSessions = parseInt(safeUpdates.SEARCH_MAX_CONCURRENT, 10) || config.search.maxConcurrentSessions;
      if (safeUpdates.SEARCH_MAX_ZIM_WORKERS !== undefined) config.search.maxZimWorkers = parseInt(safeUpdates.SEARCH_MAX_ZIM_WORKERS, 10) || config.search.maxZimWorkers;
      if (safeUpdates.SEARCH_REQUEST_TIMEOUT_MS !== undefined) config.search.requestTimeoutMs = parseInt(safeUpdates.SEARCH_REQUEST_TIMEOUT_MS, 10) || config.search.requestTimeoutMs;
      if (safeUpdates.SEARCH_MAX_MIXED_RESULTS !== undefined) config.search.maxMixedResults = parseInt(safeUpdates.SEARCH_MAX_MIXED_RESULTS, 10) || config.search.maxMixedResults;
      if (safeUpdates.SEARCH_MIN_SOURCES_BEFORE_STREAM_MIX !== undefined) config.search.minSourcesBeforeStreamMix = parseInt(safeUpdates.SEARCH_MIN_SOURCES_BEFORE_STREAM_MIX, 10) || config.search.minSourcesBeforeStreamMix;
      if (safeUpdates.SEARCH_CACHE_ENABLED !== undefined) config.cache.enabled = safeUpdates.SEARCH_CACHE_ENABLED !== 'false';
      if (safeUpdates.SEARCH_CACHE_TTL_SECONDS !== undefined) config.cache.ttlSeconds = parseInt(safeUpdates.SEARCH_CACHE_TTL_SECONDS, 10) || config.cache.ttlSeconds;
      if (safeUpdates.SEARCH_CACHE_MAX_ENTRIES !== undefined) config.cache.maxEntries = parseInt(safeUpdates.SEARCH_CACHE_MAX_ENTRIES, 10) || config.cache.maxEntries;
      if (safeUpdates.SEARCH_CACHE_DEBUG !== undefined) config.cache.debug = safeUpdates.SEARCH_CACHE_DEBUG === 'true';

      if (searchEngine) {
        searchEngine.searchCache.clear();
        const providers = searchEngine.getRegisteredProviders();
        for (const pName of providers) {
          const provider = (searchEngine as any).providers?.get(pName);
          if (provider && typeof provider.updateUrls === 'function') {
            provider.updateUrls({
              localUrl: config.kiwix.localUrl,
              localPublicUrl: config.kiwix.localPublicUrl,
              onlineUrl: config.kiwix.onlineUrl,
              onlinePublicUrl: config.kiwix.onlinePublicUrl,
            });
          }
        }
        console.log('[ConfigRouter] Cleared query cache & hot-patched provider URLs.');
      }

      console.log(`[ConfigRouter] LAN user (${detection.clientIp}) updated config keys: ${Object.keys(safeUpdates).join(', ')}`);

      res.json({
        success: true,
        updated: Object.keys(safeUpdates),
        rejected: rejected.length > 0 ? rejected : undefined,
        message: `${Object.keys(safeUpdates).length} config value(s) saved and applied in-memory.`,
      });
    } catch (err) {
      console.error('[ConfigRouter] Failed to write .env:', err);
      res.status(500).json({
        error: 'Write failed',
        message: err instanceof Error ? err.message : 'Unknown error writing .env file',
      });
    }
  });

  return router;
}
