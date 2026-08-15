import { SearchProvider } from './types.js';
import { SearchResult, SearchResponse, SearchOptions, SearchSourceConfig, ScoringConfig, StreamEventPayload } from '../../shared/types.js';
import { SourceRanker } from './sourceRanker.js';
import { ResultMixer, SourceResultsGroup } from './resultMixer.js';
import { ZimLibrary, DiscoveredZim } from './ZimLibrary.js';
import { SourceRelevance } from './SourceRelevance.js';
import { config } from '../config.js';
import sourcesData from '../config/sources.json' with { type: 'json' };

export interface QueryCacheEntry {
  key: string;
  unifiedResults: SearchResult[];
  sourceCounts: Record<string, { count: number; effectivePriority?: number }>;
  timestamp: number;
}

export class SearchCache {
  private cache: Map<string, QueryCacheEntry> = new Map();

  public get(key: string): QueryCacheEntry | null {
    if (!config.cache.enabled) return null;

    const entry = this.cache.get(key);
    if (!entry) {
      if (config.cache.debug) {
        console.log(`[Cache] MISS key=${key}`);
      }
      return null;
    }

    const ageSeconds = (Date.now() - entry.timestamp) / 1000;
    if (ageSeconds > config.cache.ttlSeconds) {
      this.cache.delete(key);
      if (config.cache.debug) {
        console.log(`[Cache] EXPIRED key=${key}`);
      }
      return null;
    }

    // Refresh LRU position (move to end)
    this.cache.delete(key);
    this.cache.set(key, entry);

    if (config.cache.debug) {
      console.log(`[Cache] HIT key=${key} age=${Math.round(ageSeconds)}s`);
    }
    return entry;
  }

  public set(key: string, data: Omit<QueryCacheEntry, 'key' | 'timestamp'>): void {
    if (!config.cache.enabled) return;

    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    while (this.cache.size >= config.cache.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
        if (config.cache.debug) {
          console.log(`[Cache] EVICT key=${oldestKey}`);
        }
      } else {
        break;
      }
    }

    const fullEntry: QueryCacheEntry = {
      key,
      ...data,
      timestamp: Date.now(),
    };

    this.cache.set(key, fullEntry);

    if (config.cache.debug) {
      console.log(`[Cache] STORE key=${key} entries=${this.cache.size}`);
    }
  }

  public clear(): void {
    this.cache.clear();
  }

  public get size(): number {
    return this.cache.size;
  }
}

export class SearchEngine {
  private providers: Map<string, SearchProvider> = new Map();
  private zimLibrary: ZimLibrary;
  private sourceRelevance: SourceRelevance;
  private sourceRanker: SourceRanker;
  private resultMixer: ResultMixer;
  public searchCache: SearchCache = new SearchCache();

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
    const startedAt = performance.now();
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

    const cacheKey = `${trimmedQuery.toLowerCase()}:${mode}:${lang}:v1`;
    let cached = this.searchCache.get(cacheKey);

    if (!cached) {
      const allDiscovered = await this.zimLibrary.getDiscoveredSources();
      const langSources = allDiscovered.filter(s => s.lang === lang || !s.lang);

      const relevanceSelection = this.sourceRelevance.selectRelevantSources(trimmedQuery, langSources, 16);
      const selectedZims = relevanceSelection.allRankedSources;

      const kiwixProvider = this.providers.get('kiwix');
      if (kiwixProvider && 'setSources' in kiwixProvider) {
        (kiwixProvider as any).setSources(selectedZims);
      }

      const groups: SourceResultsGroup[] = [];
      const sourceCounts: Record<string, { count: number; effectivePriority?: number }> = {};

      for (const source of selectedZims) {
        const provider = this.providers.get(source.provider);
        if (!provider) continue;

        try {
          const sourceResults = await provider.search(trimmedQuery, { mode, lang });
          const matchingResults = sourceResults.filter(r => !r.sourceId || r.sourceId === source.id);

          groups.push({
            sourceId: source.id,
            sourceName: source.name,
            effectivePriority: source.basePriority,
            results: matchingResults,
          });

          sourceCounts[source.name] = {
            count: matchingResults.length,
            effectivePriority: source.basePriority,
          };
        } catch (err) {
          console.error(`[SearchEngine] Error querying source '${source.name}':`, err);
        }
      }

      const totalCandidatesReceived = groups.reduce((acc, g) => acc + g.results.length, 0);
      const unifiedResults = this.resultMixer.mixResults(groups, 500, trimmedQuery);

      console.log(`[Mixer]`);
      console.log(`inputCandidates=${totalCandidatesReceived}`);
      console.log(`outputCandidates=${unifiedResults.length}\n`);

      cached = {
        key: cacheKey,
        unifiedResults,
        sourceCounts,
        timestamp: Date.now(),
      };

      this.searchCache.set(cacheKey, cached);
    }

    const requestedPage = options.page ?? 1;
    const paginationResult = this.paginateResults(cached.unifiedResults, requestedPage, pageSize);
    const executionTimeMs = Math.max(1, Math.round(performance.now() - startedAt));

    console.log(`[Pagination]`);
    console.log(`totalResults=${cached.unifiedResults.length}`);
    console.log(`pageSize=${pageSize}`);
    console.log(`page=${requestedPage}\n`);

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
        executionTimeMs,
        providers: this.getRegisteredProviders(),
      },
    };
  }

  /**
   * Progressive / Streaming Search Engine Worker
   */
  async searchProgressive(
    query: string,
    options: SearchOptions = {},
    onEvent: (payload: StreamEventPayload) => void
  ): Promise<void> {
    const startedAt = performance.now();
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

    const getElapsedMs = () => Math.max(1, Math.round(performance.now() - startedAt));
    const cacheKey = `${trimmedQuery.toLowerCase()}:${mode}:${lang}:v1`;
    const cached = this.searchCache.get(cacheKey);

    if (cached) {
      console.log(`[SearchEngine] Progressive Cache HIT for key '${cacheKey}'`);
      const paginated = this.paginateResults(cached.unifiedResults, requestedPage, pageSize);
      const executionTimeMs = getElapsedMs();
      const payloadData: SearchResponse = {
        query: trimmedQuery,
        mode,
        results: cached.unifiedResults,
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
          executionTimeMs,
          providers: this.getRegisteredProviders(),
          statusText: 'Search complete',
        },
      };

      onEvent({ event: 'results', data: payloadData });
      onEvent({ event: 'complete', data: payloadData });
      return;
    }

    const allDiscovered = await this.zimLibrary.getDiscoveredSources();
    const langSources = allDiscovered.filter(s => s.lang === lang || !s.lang);

    const relevanceSelection = this.sourceRelevance.selectRelevantSources(trimmedQuery, langSources, 16);
    const prioritySources = relevanceSelection.prioritySources;
    const remainingSources = relevanceSelection.remainingSources;
    const rankedSources = relevanceSelection.allRankedSources;
    const totalSourcesCount = rankedSources.length;

    console.log(`\n[QUERY] ${trimmedQuery}`);
    console.log(`[Search] priority sources: ${prioritySources.length}`);
    console.log(`[Search] remaining sources: ${remainingSources.length}\n`);

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

    let activeWorkers = 0;
    let queueIndex = 0;
    let flushTimer: NodeJS.Timeout | null = null;
    let isFinished = false;

    const emitCurrentBatch = () => {
      const totalCandidatesReceived = groups.reduce((acc, g) => acc + g.results.length, 0);
      const unifiedResults = this.resultMixer.mixResults(groups, 500, trimmedQuery);
      const paginated = this.paginateResults(unifiedResults, requestedPage, pageSize);
      const executionTimeMs = getElapsedMs();

      console.log(`[Mixer]`);
      console.log(`inputCandidates=${totalCandidatesReceived}`);
      console.log(`outputCandidates=${unifiedResults.length}\n`);

      console.log(`[Pagination]`);
      console.log(`totalResults=${unifiedResults.length}`);
      console.log(`pageSize=${pageSize}`);
      console.log(`page=${requestedPage}\n`);

      const statusText = pendingSources > 0 ? `Searching ${pendingSources} sources...` : 'Search complete';

      const payloadData: SearchResponse = {
        query: trimmedQuery,
        mode,
        results: unifiedResults,
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
          executionTimeMs,
          providers: this.getRegisteredProviders(),
          isStreaming: pendingSources > 0,
          pendingSources,
          completedSources,
          totalSourcesCount,
          statusText,
        },
      };

      // NOTE: Do NOT store intermediate batches in searchCache!
      onEvent({ event: 'results', data: payloadData });
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

          const totalCandidatesReceived = groups.reduce((acc, g) => acc + g.results.length, 0);
          const finalUnified = this.resultMixer.mixResults(groups, 500, trimmedQuery);
          const paginated = this.paginateResults(finalUnified, requestedPage, pageSize);
          const finalExecutionTimeMs = getElapsedMs();

          console.log(`\n[GLOBAL]`);
          console.log(`candidates before mixing: ${totalCandidatesReceived}`);
          console.log(`candidates after mixing: ${finalUnified.length}`);
          console.log(`[Search] final results: ${finalUnified.length}\n`);

          // CRITICAL: Cache ONLY upon complete search session
          this.searchCache.set(cacheKey, {
            unifiedResults: finalUnified,
            sourceCounts: { ...sourceCounts },
          });

          const finalPayload: SearchResponse = {
            query: trimmedQuery,
            mode,
            results: finalUnified,
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
              executionTimeMs: finalExecutionTimeMs,
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

          console.log(`[Search] started: ${source.name}`);

          (async () => {
            let hasResults = false;
            let resultsCount = 0;
            try {
              const provider = this.providers.get(source.provider);
              if (provider) {
                let results: SearchResult[] = [];
                if (source.provider === 'kiwix' && 'searchZimSource' in provider) {
                  results = await (provider as any).searchZimSource(source, trimmedQuery, mode);
                } else {
                  results = await provider.search(trimmedQuery, { mode, lang });
                }

                const matchingResults = results.filter((r: SearchResult) => !r.sourceId || r.sourceId === source.id);
                resultsCount = matchingResults.length;

                groups.push({
                  sourceId: source.id,
                  sourceName: source.name,
                  effectivePriority: source.basePriority,
                  results: matchingResults,
                });

                sourceCounts[source.name] = {
                  count: matchingResults.length,
                  effectivePriority: source.basePriority,
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

              console.log(`[Search] completed: ${source.name}, results=${resultsCount}`);
              console.log(`[Search] sources searched: ${completedSources}/${totalSourcesCount}`);

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
