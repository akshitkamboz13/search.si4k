import { SearchProvider } from './types.js';
import { SearchResult, SearchResponse, SearchOptions, SearchSourceConfig, ScoringConfig } from '../../shared/types.js';
import { SourceRanker } from './sourceRanker.js';
import { ResultMixer, SourceResultsGroup } from './resultMixer.js';
import sourcesData from '../config/sources.json' with { type: 'json' };

export interface QueryCacheEntry {
  unifiedResults: SearchResult[];
  sourceCounts: Record<string, { count: number; effectivePriority?: number }>;
  timestamp: number;
}

export class SearchEngine {
  private providers: Map<string, SearchProvider> = new Map();
  private sources: SearchSourceConfig[];
  private sourceRanker: SourceRanker;
  private resultMixer: ResultMixer;
  private queryCache: Map<string, QueryCacheEntry> = new Map();
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
   * Helper method to paginate any pre-ordered array of SearchResults safely.
   */
  public paginateResults(
    unifiedList: SearchResult[],
    requestedPage: number = 1,
    pageSize: number = 20
  ) {
    const totalResults = unifiedList.length;
    const safePageSize = Math.max(1, pageSize);
    const totalPages = totalResults > 0 ? Math.ceil(totalResults / safePageSize) : 1;

    let page = Math.floor(requestedPage);
    if (isNaN(page) || page < 1) {
      page = 1;
    } else if (page > totalPages) {
      page = totalPages;
    }

    const startIndex = (page - 1) * safePageSize;
    const pageResults = unifiedList.slice(startIndex, startIndex + safePageSize);

    return {
      page,
      pageSize: safePageSize,
      totalResults,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      results: pageResults,
    };
  }

  /**
   * Main Search Entry Point with Server-Side Mode Selection & Caching
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    const startTime = Date.now();
    const mode = options.mode || 'local';
    const lang = options.lang || 'en';
    const pageSize = options.pageSize || 20;

    const trimmedQuery = query ? query.trim() : '';

    if (!trimmedQuery) {
      return {
        query: '',
        mode,
        results: [],
        sources: {},
        pagination: {
          page: 1,
          pageSize,
          totalResults: 0,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
        meta: {
          mode,
          total: 0,
          executionTimeMs: 0,
          providers: this.getRegisteredProviders(),
        },
      };
    }

    const cacheKey = `${trimmedQuery.toLowerCase()}:${mode}:${lang}`;
    let cached = this.queryCache.get(cacheKey);

    if (!cached || (Date.now() - cached.timestamp > this.ttlMs)) {
      const rankedSources = this.sourceRanker.rankSources(this.sources, trimmedQuery);
      const activeSources = rankedSources.filter(s => s.lang === lang || !s.lang);

      const groups: SourceResultsGroup[] = [];
      const sourceCounts: Record<string, { count: number; effectivePriority?: number }> = {};

      for (const source of activeSources) {
        const provider = this.providers.get(source.provider);
        if (!provider) continue;

        try {
          const sourceResults = await provider.search(trimmedQuery, { mode, lang });
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
          console.error(`[SearchEngine] Error querying source '${source.name}':`, err);
        }
      }

      const unifiedResults = this.resultMixer.mixResults(groups, 140);

      cached = {
        unifiedResults,
        sourceCounts,
        timestamp: Date.now(),
      };

      this.queryCache.set(cacheKey, cached);

      if (this.queryCache.size > 100) {
        const firstKey = this.queryCache.keys().next().value;
        if (firstKey) this.queryCache.delete(firstKey);
      }
    } else {
      console.log(`[SearchEngine] Cache HIT for key '${cacheKey}'`);
    }

    const requestedPage = options.page ?? 1;
    const paginationResult = this.paginateResults(cached.unifiedResults, requestedPage, pageSize);

    return {
      query: trimmedQuery,
      mode,
      results: paginationResult.results,
      sources: cached.sourceCounts,
      pagination: {
        page: paginationResult.page,
        pageSize: paginationResult.pageSize,
        totalResults: paginationResult.totalResults,
        totalPages: paginationResult.totalPages,
        hasNextPage: paginationResult.hasNextPage,
        hasPreviousPage: paginationResult.hasPreviousPage,
      },
      meta: {
        mode,
        total: paginationResult.results.length,
        executionTimeMs: Date.now() - startTime,
        providers: this.getRegisteredProviders(),
      },
    };
  }
}
