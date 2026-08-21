import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface EnvironmentConfig {
  override: 'auto' | 'local' | 'internet';
  localNetworks: string[];
}

export interface KiwixConfig {
  dataDir: string;
  libraryXml: string;
  localUrl: string;
  localPublicUrl: string;
  onlineUrl: string;
  onlinePublicUrl: string;
  candidateLimit: number;
  maxConcurrentSearches: number;
  cacheTtlMs: number;
  maxSearchSources?: number;
}

export interface SearchConfig {
  keywordWeight: number;
  basePriorityWeight: number;
  minSourceScore: number;
  maxConcurrentSessions: number;
  maxZimWorkers: number;
  requestTimeoutMs: number;
  maxMixedResults: number;
  minSourcesBeforeStreamMix: number;
}

export interface CacheConfig {
  enabled: boolean;
  ttlSeconds: number;
  maxEntries: number;
  debug: boolean;
}

export interface Config {
  port: number;
  nodeEnv: string;
  environment: EnvironmentConfig;
  kiwix: KiwixConfig;
  search: SearchConfig;
  cache: CacheConfig;
}

const dataDir = process.env.KIWIX_DATA_DIR || '/mnt/knowledge';
const libraryXml = process.env.KIWIX_LIBRARY_XML || path.join(dataDir, 'Metadata', 'library.xml');

const defaultLocalUrl = process.env.KIWIX_LOCAL_URL || process.env.KIWIX_URL || 'http://kiwix:8080';
const defaultLocalPublicUrl = process.env.KIWIX_LOCAL_PUBLIC_URL || process.env.KIWIX_PUBLIC_URL || 'http://si4k-server.local:8080';

const defaultOnlineUrl = process.env.KIWIX_ONLINE_URL || process.env.KIWIX_URL || 'http://kiwix:8080';
const defaultOnlinePublicUrl = process.env.KIWIX_ONLINE_PUBLIC_URL || process.env.KIWIX_PUBLIC_URL || 'https://wiki.si4k.online';

const rawOverride = (process.env.ENVIRONMENT_OVERRIDE || 'auto').toLowerCase();
const envOverride = (rawOverride === 'local' || rawOverride === 'internet') ? rawOverride : 'auto';

const rawLocalNetworks = process.env.LOCAL_NETWORKS || '192.168.0.0/16,10.0.0.0/8,172.16.0.0/12,127.0.0.1/32,::1/128';
const localNetworks = rawLocalNetworks.split(',').map(s => s.trim()).filter(Boolean);

export function parseMaxSearchSources(rawVal?: string): number | undefined {
  if (!rawVal || !rawVal.trim()) return undefined;
  const parsed = parseInt(rawVal.trim(), 10);
  if (isNaN(parsed) || parsed <= 0) {
    console.warn(`[Config] Invalid KIWIX_MAX_SEARCH_SOURCES value '${rawVal}'. Falling back to searching all relevant sources.`);
    return undefined;
  }
  return parsed;
}

export const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  environment: {
    override: envOverride,
    localNetworks,
  },
  kiwix: {
    dataDir: dataDir.replace(/\/$/, ''),
    libraryXml,
    localUrl: defaultLocalUrl.replace(/\/$/, ''),
    localPublicUrl: defaultLocalPublicUrl.replace(/\/$/, ''),
    onlineUrl: defaultOnlineUrl.replace(/\/$/, ''),
    onlinePublicUrl: defaultOnlinePublicUrl.replace(/\/$/, ''),
    candidateLimit: parseInt(process.env.KIWIX_CANDIDATE_LIMIT || '100', 10),
    maxConcurrentSearches: parseInt(process.env.MAX_CONCURRENT_ZIM_SEARCHES || '8', 10),
    cacheTtlMs: parseInt(process.env.KIWIX_CACHE_TTL_SECONDS || process.env.ZIM_CACHE_TTL_SECONDS || '300', 10) * 1000,
    maxSearchSources: parseMaxSearchSources(process.env.KIWIX_MAX_SEARCH_SOURCES || process.env.SEARCH_MAX_SOURCES),
  },
  search: {
    keywordWeight: parseFloat(process.env.SEARCH_KEYWORD_WEIGHT || '10'),
    basePriorityWeight: parseFloat(process.env.SEARCH_BASE_PRIORITY_WEIGHT || '1'),
    minSourceScore: parseFloat(process.env.SEARCH_MIN_SOURCE_SCORE || '5'),
    maxConcurrentSessions: parseInt(process.env.SEARCH_MAX_CONCURRENT || '2', 10),
    maxZimWorkers: parseInt(process.env.SEARCH_MAX_ZIM_WORKERS || '4', 10),
    requestTimeoutMs: parseInt(process.env.SEARCH_REQUEST_TIMEOUT_MS || '10000', 10),
    maxMixedResults: parseInt(process.env.SEARCH_MAX_MIXED_RESULTS || '500', 10),
    minSourcesBeforeStreamMix: parseInt(process.env.SEARCH_MIN_SOURCES_BEFORE_STREAM_MIX || '1', 10),
  },
  cache: {
    enabled: process.env.SEARCH_CACHE_ENABLED !== 'false',
    ttlSeconds: parseInt(process.env.SEARCH_CACHE_TTL_SECONDS || '300', 10),
    maxEntries: parseInt(process.env.SEARCH_CACHE_MAX_ENTRIES || '100', 10),
    debug: process.env.SEARCH_CACHE_DEBUG === 'true',
  },
};
