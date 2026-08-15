import { SearchProvider } from './types.js';
import { SearchResult, SearchResponse, SearchOptions, SearchSourceConfig, ScoringConfig } from '../../shared/types.js';
import { SourceRanker } from './sourceRanker.js';
import { ResultMixer, SourceResultsGroup } from './resultMixer.js';
import sourcesData from '../config/sources.json' with { type: 'json' };

export interface CacheEntry {
  response: SearchResponse;
  timestamp: number;
}

export class SearchEngine {
  private providers: Map<string, SearchProvider> = new Map();
  private sources: SearchSourceConfig[];
  private sourceRanker: SourceRanker;
  private resultMixer: ResultMixer;
  private cache: Map<string, CacheEntry> = new Map();
  private readonly ttlMs: number = 10 * 60 * 1000; // 10 minutes TTL

  constructor(customSources?: SearchSourceConfig[], customScoring?: ScoringConfig) {
    this.sources = customSources || (sourcesData.sources as SearchSourceConfig[]);
    const scoring = customScoring || (sourcesData.scoringConfig as ScoringConfig);
    this.sourceRanker = new SourceRanker(scoring);
    this.resultMixer = new ResultMixer();
  }

  public registerProvider(provider: SearchProvider): void {
    this.providers.set(provider.name, provider);
  }

  public getRegisteredProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  public getSources(): SearchSourceConfig[] {
    return this.sources;
  }

  /**
   * Main Search entry point
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    const startTime = Date.now();
    const mode = options.mode || 'local';
    const lang = options.lang || 'en';
    const page = options.page || 1;
    const pageSize = options.pageSize || 20;

    const trimmedQuery = query ? query.trim() : '';

    if (!trimmedQuery) {
      return {
        query: '',
        mode,
        results: [],
        sources: {},
        pagination: { page: 1, pageSize, totalResults: 0, hasMore: false },
        meta: { total: 0, executionTimeMs: 0, providers: this.getRegisteredProviders() },
      };
    }

    // Check LRU Cache for exact page request
    const cacheKey = `${trimmedQuery.toLowerCase()}:${mode}:${lang}:${page}`;
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.ttlMs)) {
      console.log(`[SearchEngine] Cache HIT for key '${cacheKey}'`);
      return {
        ...cached.response,
        meta: {
          ...cached.response.meta,
          executionTimeMs: Date.now() - startTime,
        },
      };
    }

    // 1. Calculate query-dependent source relevance (effectivePriority)
    const rankedSources = this.sourceRanker.rankSources(this.sources, trimmedQuery);
    const activeSources = rankedSources.filter(s => s.lang === lang || !s.lang);

    // 2. Fetch results per active provider / source
    const groups: SourceResultsGroup[] = [];
    const sourceCounts: Record<string, { count: number; effectivePriority?: number }> = {};

    for (const source of activeSources) {
      const provider = this.providers.get(source.provider);
      if (!provider) continue;

      try {
        // Query provider for candidate results
        const sourceResults = await provider.search(trimmedQuery, {
          mode,
          lang,
          page,
          pageSize,
        });

        // Filter results belonging to this specific source if tagged
        const matchingResults = sourceResults.filter(r => !r.sourceId || r.sourceId === source.id);

        groups.push({
          sourceId: source.id,
          sourceName: source.name,
          effectivePriority: source.effectivePriority,
          results: matchingResults,
        });

        sourceCounts[source.name] = {
          count: matchingResults.length,
          effectivePriority: source.effectivePriority,
        };
      } catch (err) {
        console.error(`[SearchEngine] Error querying source '${source.name}' via provider '${source.provider}':`, err);
      }
    }

    // 3. Adaptive Result-Mixing Algorithm for requested page (page 1)
    const page1Results = this.resultMixer.mixResults(groups, pageSize);

    // 4. Generate & Cache Page 2 if candidates remain
    const totalCandidateCount = groups.reduce((acc, g) => acc + g.results.length, 0);
    const hasMore = totalCandidateCount > page1Results.length;

    const response: SearchResponse = {
      query: trimmedQuery,
      mode,
      results: page1Results,
      sources: sourceCounts,
      pagination: {
        page,
        pageSize,
        totalResults: totalCandidateCount,
        hasMore,
      },
      meta: {
        total: page1Results.length,
        executionTimeMs: Date.now() - startTime,
        providers: this.getRegisteredProviders(),
      },
    };

    // Cache the response
    this.cache.set(cacheKey, { response, timestamp: Date.now() });

    // Limit cache size to 100 entries
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    return response;
  }
}
