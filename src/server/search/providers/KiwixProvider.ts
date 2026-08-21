import * as cheerio from 'cheerio';
import { SearchProvider } from '../types.js';
import { SearchResult, SearchOptions, SearchSourceConfig, SearchMode } from '../../../shared/types.js';
import { config } from '../../config.js';

export interface KiwixProviderOptions {
  localUrl: string;           // Local internal backend URL (KIWIX_LOCAL_URL)
  localPublicUrl: string;     // Local public browser URL (KIWIX_LOCAL_PUBLIC_URL)
  onlineUrl?: string;         // Online internal backend URL (KIWIX_ONLINE_URL)
  onlinePublicUrl?: string;   // Online public browser URL (KIWIX_ONLINE_PUBLIC_URL)
  sources?: SearchSourceConfig[];
  maxCandidatesPerSource?: number; // Target per-source candidate pool limit (defaults to KIWIX_CANDIDATE_LIMIT)
}

export class KiwixProvider implements SearchProvider {
  readonly name = 'kiwix';
  private localUrl: string;
  private localPublicUrl: string;
  private onlineUrl: string;
  private onlinePublicUrl: string;
  private sourcesList: SearchSourceConfig[] = [];
  private explicitMaxCandidates?: number;

  constructor(options: KiwixProviderOptions) {
    this.localUrl = options.localUrl.replace(/\/$/, '');
    this.localPublicUrl = options.localPublicUrl.replace(/\/$/, '');
    this.onlineUrl = (options.onlineUrl || options.localUrl).replace(/\/$/, '');
    this.onlinePublicUrl = (options.onlinePublicUrl || options.localPublicUrl).replace(/\/$/, '');
    this.explicitMaxCandidates = options.maxCandidatesPerSource;

    if (options.sources) {
      this.setSources(options.sources);
    }
  }

  public getEffectiveCandidateLimit(): number {
    return this.explicitMaxCandidates !== undefined 
      ? this.explicitMaxCandidates 
      : (config.kiwix.candidateLimit || 100);
  }

  public setSources(sources: SearchSourceConfig[]): void {
    this.sourcesList = sources.filter(s => s.enabled && s.provider === 'kiwix');
  }

  public getSources(): SearchSourceConfig[] {
    return this.sourcesList;
  }

  public updateUrls(options: { localUrl?: string; localPublicUrl?: string; onlineUrl?: string; onlinePublicUrl?: string }): void {
    if (options.localUrl) this.localUrl = options.localUrl.replace(/\/$/, '');
    if (options.localPublicUrl) this.localPublicUrl = options.localPublicUrl.replace(/\/$/, '');
    if (options.onlineUrl) this.onlineUrl = options.onlineUrl.replace(/\/$/, '');
    if (options.onlinePublicUrl) this.onlinePublicUrl = options.onlinePublicUrl.replace(/\/$/, '');
  }

  /**
   * Resolve internal backend URL and public browser target URL based on mode
   */
  public getUrlsForMode(mode: SearchMode = 'local') {
    if (mode === 'online') {
      return {
        internalUrl: (config.kiwix.onlineUrl || this.onlineUrl).replace(/\/$/, ''),
        publicUrl: (config.kiwix.onlinePublicUrl || this.onlinePublicUrl).replace(/\/$/, ''),
      };
    }
    return {
      internalUrl: (config.kiwix.localUrl || this.localUrl).replace(/\/$/, ''),
      publicUrl: (config.kiwix.localPublicUrl || this.localPublicUrl).replace(/\/$/, ''),
    };
  }

  /**
   * Performs quick HTTP ping to verify Kiwix endpoint accessibility
   */
  public async checkReadiness(): Promise<boolean> {
    try {
      const { internalUrl } = this.getUrlsForMode('local');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      let res = await fetch(internalUrl, { signal: controller.signal, method: 'HEAD' }).catch(() => null);
      if (!res || res.status >= 500 || res.status === 405) {
        res = await fetch(internalUrl, { signal: controller.signal, method: 'GET' }).catch(() => null);
      }
      clearTimeout(timeoutId);
      return res !== null && res.status < 500;
    } catch (err) {
      console.warn(`[KiwixProvider] checkReadiness ping failed for '${this.localUrl}':`, err);
      return false;
    }
  }

  /**
   * Helper to fetch a single HTML page from Kiwix search endpoint
   */
  private async fetchHtmlPage(internalUrl: string, zimName: string, query: string, start: number, signal?: AbortSignal): Promise<string | null> {
    const searchUrl = `${internalUrl}/search?content=${encodeURIComponent(zimName)}&pattern=${encodeURIComponent(query)}&start=${start}`;
    try {
      const response = await fetch(searchUrl, {
        signal,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Si4k-Search-Engine/1.0',
        },
      });

      if (!response.ok) {
        return null;
      }
      return await response.text();
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        return null;
      }
      console.error(`[KiwixProvider] Fetch error for '${zimName}' start=${start}:`, err);
      return null;
    }
  }

  /**
   * Parse total matches reported by Kiwix HTML (e.g., "Results 1-25 of 312")
   */
  public parseKiwixReportedTotal(html: string): number {
    if (!html) return 0;
    const match = html.match(/Results\s*<b>\d+-\d+<\/b>\s*of\s*<b>([\d,]+)<\/b>/i);
    if (match && match[1]) {
      const parsed = parseInt(match[1].replace(/,/g, ''), 10);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  /**
   * Search full-text contents inside a single ZIM file across multiple pages up to maxCandidatesPerSource.
   */
  async searchZimSource(
    source: SearchSourceConfig,
    query: string,
    mode: SearchMode = 'local',
    signal?: AbortSignal,
    candidateLimitOverride?: number
  ): Promise<SearchResult[]> {
    if (!query || !query.trim() || signal?.aborted) return [];

    const trimmedQuery = query.trim();
    const { internalUrl, publicUrl } = this.getUrlsForMode(mode);
    const targetCandidateLimit = candidateLimitOverride !== undefined && candidateLimitOverride > 0
      ? candidateLimitOverride
      : this.getEffectiveCandidateLimit();

    // 1. Fetch initial Page 1 (start=0)
    const firstHtml = await this.fetchHtmlPage(internalUrl, source.zimName, trimmedQuery, 0, signal);
    if (!firstHtml || signal?.aborted) {
      console.log(`[Kiwix]\nsource=${source.name}\nrawCandidates=0\ncandidateLimit=${targetCandidateLimit}\ncandidatesAfterLimit=0\n`);
      return [];
    }

    const kiwixReportedTotal = this.parseKiwixReportedTotal(firstHtml);
    const seenPaths = new Set<string>();
    const page0Results = this.parseKiwixHtml(firstHtml, source, publicUrl, seenPaths);
    let allParsedCount = page0Results.length;

    const accumulatedResults: SearchResult[] = [...page0Results];

    // 2. Fetch additional pages if Kiwix reports more matches than 25
    const pageSize = 25;

    if (kiwixReportedTotal > pageSize && accumulatedResults.length < targetCandidateLimit && !signal?.aborted) {
      const pageStarts: number[] = [];
      for (let start = pageSize; start < Math.min(kiwixReportedTotal, targetCandidateLimit); start += pageSize) {
        pageStarts.push(start);
      }

      // Fetch remaining pages concurrently
      const pageHtmls = await Promise.all(
        pageStarts.map(start => this.fetchHtmlPage(internalUrl, source.zimName, trimmedQuery, start, signal))
      );

      for (const html of pageHtmls) {
        if (html && !signal?.aborted) {
          const pageItems = this.parseKiwixHtml(html, source, publicUrl, seenPaths);
          allParsedCount += pageItems.length;
          accumulatedResults.push(...pageItems);
          if (accumulatedResults.length >= targetCandidateLimit) {
            break;
          }
        }
      }
    }

    const finalResults = accumulatedResults.slice(0, targetCandidateLimit);
    const rawCandidates = kiwixReportedTotal || allParsedCount;

    // Required Diagnostics Log per Source
    console.log(`[Kiwix]\nsource=${source.name}\nrawCandidates=${rawCandidates}\ncandidateLimit=${targetCandidateLimit}\ncandidatesAfterLimit=${finalResults.length}\n`);

    return finalResults;
  }

  /**
   * Execute full-text search across all enabled ZIM sources in parallel for requested mode.
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!query || !query.trim()) return [];

    const trimmedQuery = query.trim();
    const mode = options.mode || 'local';
    const activeSources = this.sourcesList;

    const { internalUrl, publicUrl } = this.getUrlsForMode(mode);
    console.log(`[KiwixProvider] [Mode: ${mode}] Searching ${activeSources.length} ZIM sources via ${internalUrl} (Public target: ${publicUrl}) for "${trimmedQuery}"`);

    const maxConcurrency = config.kiwix.maxConcurrentSearches || 8;
    const results: SearchResult[] = [];
    let queueIndex = 0;

    const workerPool = Array.from({ length: Math.min(maxConcurrency, activeSources.length) }, async () => {
      while (queueIndex < activeSources.length) {
        const source = activeSources[queueIndex++];
        try {
          const sourceResults = await this.searchZimSource(source, trimmedQuery, mode);
          results.push(...sourceResults);
        } catch (err) {
          console.error(`[KiwixProvider] Error searching source '${source.name}':`, err);
        }
      }
    });

    await Promise.all(workerPool);
    return results;
  }

  /**
   * Parses HTML response from kiwix-serve search output.
   */
  public parseKiwixHtml(
    html: string,
    source: SearchSourceConfig,
    publicUrl: string = this.localPublicUrl,
    seenPaths: Set<string> = new Set<string>()
  ): SearchResult[] {
    if (!html || !html.trim()) return [];

    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    const listItems = $('.results ul li, div.results li, .results li');

    if (listItems.length > 0) {
      listItems.each((_, el) => {
        const item = $(el);
        const link = item.find('a[href]').first();
        if (!link.length) return;

        const rawHref = link.attr('href') || '';
        const title = link.text().trim();
        const snippet = item.find('cite').first().text().trim();

        if (title && rawHref && !rawHref.startsWith('javascript:')) {
          const res = this.formatResult(title, rawHref, snippet, source, publicUrl, seenPaths);
          if (res) results.push(res);
        }
      });
    }

    if (results.length === 0) {
      $('a[href]').each((_, el) => {
        const link = $(el);
        const rawHref = link.attr('href') || '';
        const title = link.text().trim();

        if (title && title.length > 1 && rawHref && !rawHref.startsWith('javascript:') && !rawHref.startsWith('#')) {
          const citeText = link.parent().find('cite').text().trim() || link.parent().text().replace(title, '').trim();
          const res = this.formatResult(title, rawHref, citeText, source, publicUrl, seenPaths);
          if (res) results.push(res);
        }
      });
    }

    return results;
  }

  /**
   * Formats raw result into SearchResult object.
   */
  public formatResult(
    title: string,
    rawHref: string,
    snippet: string,
    source: SearchSourceConfig,
    publicUrl: string,
    seenPaths: Set<string>
  ): SearchResult | null {
    let cleanPath = rawHref;

    if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
      try {
        const parsed = new URL(cleanPath);
        cleanPath = parsed.pathname + parsed.search + parsed.hash;
      } catch {
        // Retain rawHref
      }
    }

    if (!cleanPath.startsWith('/')) {
      cleanPath = '/' + cleanPath;
    }

    if (!cleanPath.includes(source.zimName)) {
      cleanPath = `/content/${source.zimName}${cleanPath}`;
    }

    const dedupeKey = `${source.zimName}:${cleanPath}`;
    if (seenPaths.has(dedupeKey)) {
      return null;
    }
    seenPaths.add(dedupeKey);

    const targetUrl = `${publicUrl}${cleanPath}`;

    return {
      id: dedupeKey,
      source: source.name,
      provider: 'kiwix',
      zimName: source.zimName,
      sourceId: source.id,
      type: 'article',
      title,
      description: snippet || `Article from ${source.name}`,
      url: targetUrl,
    };
  }
}
