import * as cheerio from 'cheerio';
import { SearchProvider } from '../types.js';
import { SearchResult, SearchOptions, SearchSourceConfig, SearchMode } from '../../../shared/types.js';

export interface KiwixProviderOptions {
  localUrl: string;           // Local internal backend URL (KIWIX_LOCAL_URL)
  localPublicUrl: string;     // Local public browser URL (KIWIX_LOCAL_PUBLIC_URL)
  onlineUrl?: string;         // Online internal backend URL (KIWIX_ONLINE_URL)
  onlinePublicUrl?: string;   // Online public browser URL (KIWIX_ONLINE_PUBLIC_URL)
  sources?: SearchSourceConfig[];
}

export class KiwixProvider implements SearchProvider {
  readonly name = 'kiwix';
  private localUrl: string;
  private localPublicUrl: string;
  private onlineUrl: string;
  private onlinePublicUrl: string;
  private sourcesList: SearchSourceConfig[] = [];

  constructor(options: KiwixProviderOptions) {
    this.localUrl = options.localUrl.replace(/\/$/, '');
    this.localPublicUrl = options.localPublicUrl.replace(/\/$/, '');
    this.onlineUrl = (options.onlineUrl || options.localUrl).replace(/\/$/, '');
    this.onlinePublicUrl = (options.onlinePublicUrl || options.localPublicUrl).replace(/\/$/, '');

    if (options.sources) {
      this.setSources(options.sources);
    }
  }

  public setSources(sources: SearchSourceConfig[]): void {
    this.sourcesList = sources.filter(s => s.enabled && s.provider === 'kiwix');
  }

  public getSources(): SearchSourceConfig[] {
    return this.sourcesList;
  }

  /**
   * Resolve internal backend URL and public browser target URL based on mode
   */
  public getUrlsForMode(mode: SearchMode = 'local') {
    if (mode === 'online') {
      return {
        internalUrl: this.onlineUrl,
        publicUrl: this.onlinePublicUrl,
      };
    }
    return {
      internalUrl: this.localUrl,
      publicUrl: this.localPublicUrl,
    };
  }

  /**
   * Search full-text contents inside a single ZIM file independently for a given mode.
   */
  async searchZimSource(
    source: SearchSourceConfig,
    query: string,
    mode: SearchMode = 'local'
  ): Promise<SearchResult[]> {
    if (!query || !query.trim()) return [];

    const trimmedQuery = query.trim();
    const { internalUrl, publicUrl } = this.getUrlsForMode(mode);

    // Kiwix search endpoint: /search?content={zimName}&pattern={query}
    const searchUrl = `${internalUrl}/search?content=${encodeURIComponent(source.zimName)}&pattern=${encodeURIComponent(trimmedQuery)}`;

    try {
      const response = await fetch(searchUrl, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Si4k-Search-Engine/1.0',
        },
      });

      if (!response.ok) {
        console.warn(`[KiwixProvider] ${source.name} (${source.zimName}) request returned HTTP ${response.status} from ${searchUrl}`);
        return [];
      }

      const html = await response.text();
      return this.parseKiwixHtml(html, source, publicUrl);
    } catch (err) {
      console.error(`[KiwixProvider] Error querying ZIM '${source.zimName}' (${source.name}) at ${searchUrl}:`, err);
      return [];
    }
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

    const searchPromises = activeSources.map(async (source) => {
      const results = await this.searchZimSource(source, trimmedQuery, mode);
      console.log(`[KiwixProvider] [Mode: ${mode}] ${source.name} -> ${results.length} results`);
      return results;
    });

    const resultsPerSource = await Promise.all(searchPromises);
    return resultsPerSource.flat();
  }

  /**
   * Parses HTML response from kiwix-serve search output.
   */
  public parseKiwixHtml(html: string, source: SearchSourceConfig, publicUrl: string = this.localPublicUrl): SearchResult[] {
    if (!html || !html.trim()) return [];

    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const seenPaths = new Set<string>();

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
