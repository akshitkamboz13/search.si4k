import { SearchProvider } from './types.js';
import { SearchResult, SearchResponse, SearchOptions, SearchSourceConfig, ScoringConfig, StreamEventPayload } from '../../shared/types.js';
import { SourceRanker } from './sourceRanker.js';
import { ResultMixer, SourceResultsGroup } from './resultMixer.js';
import { ZimLibrary, DiscoveredZim } from './ZimLibrary.js';
import { SourceRelevance } from './SourceRelevance.js';
import { config } from '../config.js';
import sourcesData from '../config/sources.json' with { type: 'json' };

export interface QueryCacheEntry {
  unifiedResults: SearchResult[];
  sourceCounts: Record<string, { count: number; effectivePriority?: number }>;
  timestamp: number;
}

export class SearchEngine {
  private providers: Map<string, SearchProvider> = new Map();
  private zimLibrary: ZimLibrary;
  private sourceRelevance: SourceRelevance;
  private sourceRanker: SourceRanker;
  private resultMixer: ResultMixer;
  private queryCache: Map<string, QueryCacheEntry> = new Map();
  private readonly ttlMs: number = 10 * 60 * 1000; // 10 minutes TTL

  constructor(customLibrary?: ZimLibrary | SearchSourceConfig[], customScoring?: ScoringConfig) {
    if (customLibrary && Array.isArray(customLibrary)) {
      const mockSources: DiscoveredZim[] = customLibrary.map(s => ({
        ...s,
        tags: s.keywords || [],
        description: s.name,
      }));
      this.zimLibrary = {
        getDiscoveredSources: async () => mockSources,
        parseLibraryXml: () => mockSources,
      } as unknown as ZimLibrary;
    } else if (customLibrary) {
      this.zimLibrary = customLibrary as ZimLibrary;
    } else {
      this.zimLibrary = new ZimLibrary();
    }

    this.sourceRelevance = new SourceRelevance();
    const scoring = customScoring || (sourcesData.scoringConfig as ScoringConfig);
    this.sourceRanker = new SourceRanker(scoring);
    this.resultMixer = new ResultMixer();

    this.initAsyncDiscovery();
  }

  private async initAsyncDiscovery(): Promise<void> {
    try {
      if (this.zimLibrary && typeof this.zimLibrary.getDiscoveredSources === 'function') {
        await this.zimLibrary.getDiscoveredSources();
      }
    } catch (err) {
      console.error('[SearchEngine] Error during initial ZimLibrary discovery:', err);
    }
  }

  public registerProvider(provider: SearchProvider): void {
    this.providers.set(provider.name, provider);
  }

  public getRegisteredProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  public async getDiscoveredSources(): Promise<DiscoveredZim[]> {
    return this.zimLibrary.getDiscoveredSources();
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
   * Standard Search Endpoint (Non-streaming compatibility)
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
      const allDiscovered = await this.zimLibrary.getDiscoveredSources();
      const langSources = allDiscovered.filter(s => s.lang === lang || !s.lang);

      const relevanceSelection = this.sourceRelevance.selectRelevantSources(trimmedQuery, langSources, 12);
      const selectedZims = relevanceSelection.selectedSources;

      const kiwixProvider = this.providers.get('kiwix');
      if (kiwixProvider && 'setSources' in kiwixProvider) {
        (kiwixProvider as any).setSources(selectedZims);
      }

      const rankedSelected = this.sourceRanker.rankSources(selectedZims, trimmedQuery);

      const groups: SourceResultsGroup[] = [];
      const sourceCounts: Record<string, { count: number; effectivePriority?: number }> = {};

      for (const source of rankedSelected) {
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

  /**
   * Progressive / Streaming Search Engine Worker
   * Executes controlled concurrent ZIM searches, buffering & streaming results progressively.
   */
  async searchProgressive(
    query: string,
    options: SearchOptions = {},
    onEvent: (payload: StreamEventPayload) => void
  ): Promise<void> {
    const startTime = Date.now();
    const mode = options.mode || 'local';
    const lang = options.lang || 'en';
    const pageSize = options.pageSize || 20;
    const requestedPage = options.page || 1;
    const maxConcurrency = options.maxConcurrency || config.kiwix.maxConcurrentSearches || 8;

    const trimmedQuery = query ? query.trim() : '';

    if (!trimmedQuery) {
      onEvent({
        event: 'complete',
        data: {
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
            statusText: 'Search complete',
          },
        },
      });
      return;
    }

    const cacheKey = `${trimmedQuery.toLowerCase()}:${mode}:${lang}`;
    const cached = this.queryCache.get(cacheKey);

    // Fast Path: Cache HIT
    if (cached && (Date.now() - cached.timestamp <= this.ttlMs)) {
      console.log(`[SearchEngine] Progressive Cache HIT for key '${cacheKey}'`);
      const paginated = this.paginateResults(cached.unifiedResults, requestedPage, pageSize);
      const payloadData: SearchResponse = {
        query: trimmedQuery,
        mode,
        results: paginated.results,
        sources: cached.sourceCounts,
        pagination: {
          page: paginated.page,
          pageSize: paginated.pageSize,
          totalResults: paginated.totalResults,
          totalPages: paginated.totalPages,
          hasNextPage: paginated.hasNextPage,
          hasPreviousPage: paginated.hasPreviousPage,
        },
        meta: {
          mode,
          total: paginated.totalResults,
          executionTimeMs: Date.now() - startTime,
          providers: this.getRegisteredProviders(),
          statusText: 'Search complete',
        },
      };

      onEvent({ event: 'results', data: payloadData });
      onEvent({ event: 'complete', data: payloadData });
      return;
    }

    // Stage 1: Load and rank candidate ZIM sources
    const allDiscovered = await this.zimLibrary.getDiscoveredSources();
    const langSources = allDiscovered.filter(s => s.lang === lang || !s.lang);

    const relevanceSelection = this.sourceRelevance.selectRelevantSources(trimmedQuery, langSources, 16);
    const selectedZims = relevanceSelection.selectedSources;

    const rankedSources = this.sourceRanker.rankSources(selectedZims, trimmedQuery);
    const totalSourcesCount = rankedSources.length;

    let pendingSources = totalSourcesCount;
    let completedSources = 0;

    onEvent({
      event: 'progress',
      data: {
        query: trimmedQuery,
        mode,
        pendingSources,
        completedSources: 0,
        totalSourcesCount,
        statusText: `Searching ${totalSourcesCount} sources...`,
      },
    });

    const groups: SourceResultsGroup[] = [];
    const sourceCounts: Record<string, { count: number; effectivePriority?: number }> = {};
    const kiwixProvider = this.providers.get('kiwix');

    let activeWorkers = 0;
    let queueIndex = 0;
    let flushTimer: NodeJS.Timeout | null = null;
    let isFinished = false;

    const emitCurrentBatch = () => {
      const unifiedResults = this.resultMixer.mixResults(groups, 140);
      const paginated = this.paginateResults(unifiedResults, requestedPage, pageSize);

      const statusText = pendingSources > 0 ? `Searching ${pendingSources} sources...` : 'Search complete';

      const payloadData: SearchResponse = {
        query: trimmedQuery,
        mode,
        results: paginated.results,
        sources: { ...sourceCounts },
        pagination: {
          page: paginated.page,
          pageSize: paginated.pageSize,
          totalResults: paginated.totalResults,
          totalPages: paginated.totalPages,
          hasNextPage: paginated.hasNextPage,
          hasPreviousPage: paginated.hasPreviousPage,
        },
        meta: {
          mode,
          total: paginated.totalResults,
          executionTimeMs: Date.now() - startTime,
          providers: this.getRegisteredProviders(),
          isStreaming: pendingSources > 0,
          pendingSources,
          completedSources,
          totalSourcesCount,
          statusText,
        },
      };

      onEvent({ event: 'results', data: payloadData });

      this.queryCache.set(cacheKey, {
        unifiedResults,
        sourceCounts: { ...sourceCounts },
        timestamp: Date.now(),
      });
    };

    const scheduleFlush = (immediate: boolean = false) => {
      if (immediate) {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        if (!isFinished) {
          emitCurrentBatch();
        }
        return;
      }

      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        if (!isFinished) {
          emitCurrentBatch();
        }
      }, 50);
    };

    return new Promise<void>((resolve) => {
      const processNextInQueue = () => {
        if (queueIndex >= totalSourcesCount && activeWorkers === 0) {
          isFinished = true;
          if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
          }

          const finalUnified = this.resultMixer.mixResults(groups, 140);
          const paginated = this.paginateResults(finalUnified, requestedPage, pageSize);

          this.queryCache.set(cacheKey, {
            unifiedResults: finalUnified,
            sourceCounts: { ...sourceCounts },
            timestamp: Date.now(),
          });

          const finalPayload: SearchResponse = {
            query: trimmedQuery,
            mode,
            results: paginated.results,
            sources: { ...sourceCounts },
            pagination: {
              page: paginated.page,
              pageSize: paginated.pageSize,
              totalResults: paginated.totalResults,
              totalPages: paginated.totalPages,
              hasNextPage: paginated.hasNextPage,
              hasPreviousPage: paginated.hasPreviousPage,
            },
            meta: {
              mode,
              total: paginated.totalResults,
              executionTimeMs: Date.now() - startTime,
              providers: this.getRegisteredProviders(),
              isStreaming: false,
              pendingSources: 0,
              completedSources: totalSourcesCount,
              totalSourcesCount,
              statusText: 'Search complete',
            },
          };

          onEvent({ event: 'results', data: finalPayload });
          onEvent({ event: 'complete', data: finalPayload });
          resolve();
          return;
        }

        while (activeWorkers < maxConcurrency && queueIndex < totalSourcesCount) {
          const source = rankedSources[queueIndex++];
          activeWorkers++;

          (async () => {
            let hasResults = false;
            try {
              if (kiwixProvider && 'searchZimSource' in kiwixProvider) {
                const results = await (kiwixProvider as any).searchZimSource(source, trimmedQuery, mode);
                const matchingResults = results.filter((r: SearchResult) => !r.sourceId || r.sourceId === source.id);

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
                if (matchingResults.length > 0) {
                  hasResults = true;
                }
              }
            } catch (err) {
              console.warn(`[SearchEngine] Progressive search failed for ZIM '${source.name}':`, err);
            } finally {
              activeWorkers--;
              completedSources++;
              pendingSources = Math.max(0, totalSourcesCount - completedSources);

              scheduleFlush(hasResults);
              processNextInQueue();
            }
          })();
        }
      };

      processNextInQueue();
    });
  }
}
