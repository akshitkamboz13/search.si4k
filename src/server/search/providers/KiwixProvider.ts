import * as cheerio from 'cheerio';
import { SearchProvider } from '../types.js';
import { SearchResult, SearchOptions, SearchSourceConfig } from '../../../shared/types.js';

export interface KiwixProviderOptions {
  internalUrl: string;    // Server-to-server HTTP request base URL (KIWIX_URL)
  publicUrl: string;      // Public URL exposed to browser clients (KIWIX_PUBLIC_URL)
  sources?: SearchSourceConfig[];
}

export class KiwixProvider implements SearchProvider {
  readonly name = 'kiwix';
  private internalUrl: string;
  private publicUrl: string;
  private sourcesList: SearchSourceConfig[] = [];

  constructor(options: KiwixProviderOptions) {
    this.internalUrl = options.internalUrl.replace(/\/$/, '');
    this.publicUrl = options.publicUrl.replace(/\/$/, '');

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
   * Search full-text contents inside a single ZIM file independently.
   * Endpoint: GET /search?content={zimName}&pattern={query}
   */
  async searchZimSource(source: SearchSourceConfig, query: string): Promise<SearchResult[]> {
    if (!query || !query.trim()) return [];

    const trimmedQuery = query.trim();
    const searchUrl = `${this.internalUrl}/search?content=${encodeURIComponent(source.zimName)}&pattern=${encodeURIComponent(trimmedQuery)}`;

    try {
      const response = await fetch(searchUrl, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Si4k-Search-Engine/1.0',
        },
      });

      if (!response.ok) {
        console.warn(`[KiwixProvider] ${source.name} (${source.zimName}) request returned HTTP ${response.status}`);
        return [];
      }

      const html = await response.text();
      return this.parseKiwixHtml(html, source);
    } catch (err) {
      console.error(`[KiwixProvider] Error querying ZIM '${source.zimName}' (${source.name}):`, err);
      return [];
    }
  }

  /**
   * Execute full-text search across all enabled ZIM sources in parallel.
   */
  async search(query: string, _options?: SearchOptions): Promise<SearchResult[]> {
    if (!query || !query.trim()) return [];

    const trimmedQuery = query.trim();
    const activeSources = this.sourcesList;

    console.log(`[KiwixProvider] Searching ${activeSources.length} ZIM sources for "${trimmedQuery}"`);

    // Issue parallel searches for each ZIM independently
    const searchPromises = activeSources.map(async (source) => {
      const results = await this.searchZimSource(source, trimmedQuery);
      console.log(`[KiwixProvider] ${source.name} -> ${results.length} results`);
      return results;
    });

    const resultsPerSource = await Promise.all(searchPromises);
    return resultsPerSource.flat();
  }

  /**
   * Parses HTML response from kiwix-serve /search?content=...&pattern=...
   * Selects items inside .results ul li or div.results li
   */
  public parseKiwixHtml(html: string, source: SearchSourceConfig): SearchResult[] {
    if (!html || !html.trim()) return [];

    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const seenPaths = new Set<string>();

    // Select result items from kiwix-serve HTML
    const listItems = $('.results ul li, div.results li, .results li');

    if (listItems.length > 0) {
      listItems.each((_, el) => {
        const item = $(el);
        const link = item.find('a[href]').first();
        if (!link.length) return;

        const rawHref = link.attr('href') || '';
        // Extract ACTUAL article title from <a> tag
        const title = link.text().trim();
        // Extract ACTUAL text snippet from <cite> tag
        const snippet = item.find('cite').first().text().trim();

        if (title && rawHref && !rawHref.startsWith('javascript:')) {
          const res = this.formatResult(title, rawHref, snippet, source, seenPaths);
          if (res) results.push(res);
        }
      });
    }

    // Generic fallback if listItems container is absent
    if (results.length === 0) {
      $('a[href]').each((_, el) => {
        const link = $(el);
        const rawHref = link.attr('href') || '';
        const title = link.text().trim();

        if (title && title.length > 1 && rawHref && !rawHref.startsWith('javascript:') && !rawHref.startsWith('#')) {
          const citeText = link.parent().find('cite').text().trim() || link.parent().text().replace(title, '').trim();
          const res = this.formatResult(title, rawHref, citeText, source, seenPaths);
          if (res) results.push(res);
        }
      });
    }

    return results;
  }

  /**
   * Formats result, enforces KIWIX_PUBLIC_URL, and deduplicates within the SAME ZIM.
   */
  public formatResult(
    title: string,
    rawHref: string,
    snippet: string,
    source: SearchSourceConfig,
    seenPaths: Set<string>
  ): SearchResult | null {
    let cleanPath = rawHref;

    // Strip hostname if absolute URL
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

    // Ensure path includes the exact zimName
    // Patterns: /content/{zimName}/... OR /{zimName}/...
    if (!cleanPath.includes(source.zimName)) {
      cleanPath = `/content/${source.zimName}${cleanPath}`;
    }

    // Deduplicate only identical results from the SAME ZIM
    const dedupeKey = `${source.zimName}:${cleanPath}`;
    if (seenPaths.has(dedupeKey)) {
      return null;
    }
    seenPaths.add(dedupeKey);

    // Build browser-facing URL strictly using KIWIX_PUBLIC_URL
    const publicUrl = `${this.publicUrl}${cleanPath}`;

    return {
      id: dedupeKey,                // Deterministic ID: zimName:path
      source: source.name,         // Exact source name (e.g. "wikiHow", "Wikipedia", "iFixit", "Arch Wiki")
      provider: 'kiwix',           // Provider name
      zimName: source.zimName,     // Exact ZIM name
      sourceId: source.id,
      type: 'article',
      title,                        // Actual article title from Kiwix HTML <a> tag
      description: snippet || `Article from ${source.name}`, // Actual snippet
      url: publicUrl,              // Uses KIWIX_PUBLIC_URL
    };
  }
}
