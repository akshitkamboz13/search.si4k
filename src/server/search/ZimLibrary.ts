import fs from 'fs';
import * as cheerio from 'cheerio';
import { SearchSourceConfig } from '../../shared/types.js';
import { config } from '../config.js';
import sourcesData from '../config/sources.json' with { type: 'json' };

export interface DiscoveredZim extends SearchSourceConfig {
  title?: string;
  tags: string[];
  description: string;
  lastUpdated?: string;
}

export class ZimLibrary {
  private libraryXmlPath: string;
  private kiwixServerUrl: string;
  private discoveredSources: DiscoveredZim[] = [];
  private lastMtimeMs: number = 0;
  private lastFetchTimeMs: number = 0;
  private cacheTtlMs: number = 5 * 60 * 1000; // 5 minutes cache TTL

  constructor(libraryXmlPath?: string, kiwixServerUrl?: string) {
    this.libraryXmlPath = libraryXmlPath || config.kiwix.libraryXml;
    this.kiwixServerUrl = (kiwixServerUrl || config.kiwix.localUrl).replace(/\/$/, '');
  }

  /**
   * Load or refresh discovered ZIM sources from library.xml or catalog API fallback
   */
  async getDiscoveredSources(forceReload: boolean = false): Promise<DiscoveredZim[]> {
    const now = Date.now();

    // Check if local library.xml metadata file exists on disk
    if (fs.existsSync(this.libraryXmlPath)) {
      try {
        const stats = fs.statSync(this.libraryXmlPath);
        if (forceReload || stats.mtimeMs > this.lastMtimeMs) {
          console.log(`[ZimLibrary] Loading ZIM metadata entries from local library.xml: ${this.libraryXmlPath}`);
          const xmlContent = fs.readFileSync(this.libraryXmlPath, 'utf-8');
          this.discoveredSources = this.parseLibraryXml(xmlContent);
          this.lastMtimeMs = stats.mtimeMs;
          this.logDiscoverySummary();
        }
        return this.discoveredSources;
      } catch (err) {
        console.warn(`[ZimLibrary] Error reading local library.xml at ${this.libraryXmlPath}:`, err);
      }
    }

    // Fallback if library.xml file absent: fetch catalog entries over HTTP
    if (forceReload || this.discoveredSources.length === 0 || (now - this.lastFetchTimeMs > this.cacheTtlMs)) {
      console.log(`[ZimLibrary] Local metadata file '${this.libraryXmlPath}' absent. Fetching dynamic ZIM catalog from Kiwix server (${this.kiwixServerUrl})...`);
      try {
        const catalogUrl = `${this.kiwixServerUrl}/catalog/v2/entries?count=1000`;
        const response = await fetch(catalogUrl, {
          headers: { 'Accept': 'application/atom+xml, application/xml, */*' }
        });

        if (response.ok) {
          const xmlContent = await response.text();
          this.discoveredSources = this.parseLibraryXml(xmlContent);
          this.lastFetchTimeMs = now;
          this.logDiscoverySummary();
        } else {
          console.error(`[ZimLibrary] Catalog HTTP request returned status ${response.status} from ${catalogUrl}`);
        }
      } catch (err) {
        console.error(`[ZimLibrary] Failed to fetch catalog entries from ${this.kiwixServerUrl}:`, err);
      }
    }

    return this.discoveredSources;
  }

  /**
   * Parse XML content from library.xml (attributes & elements) or catalog Atom OPDS feed
   */
  public parseLibraryXml(xmlContent: string): DiscoveredZim[] {
    const $ = cheerio.load(xmlContent, { xmlMode: true });
    const discovered: DiscoveredZim[] = [];
    const overrides = (sourcesData.overrides || {}) as Record<string, any>;

    const entries = $('entry, book');

    entries.each((index, el) => {
      const item = $(el);

      // Support both XML attributes (<book name="..." title="..." description="..." tags="...">) and child elements (<entry><title>...</title></entry>)
      const title = item.attr('title') || item.find('title').first().text().trim();
      const description = item.attr('description') || item.find('summary, description, content').first().text().trim();
      
      let zimName = '';

      // Primary: extract exact ZIM filename from path attribute if present (e.g. path="../ZIM/Operating_Systems/archlinux_en_all_maxi_2026-07.zim")
      const pathAttr = item.attr('path');
      if (pathAttr) {
        const match = pathAttr.match(/([^/\\]+)\.zim$/i);
        if (match && match[1]) {
          zimName = match[1];
        }
      }

      // Secondary: link href attribute if /content/{zimName} present
      if (!zimName) {
        const links = item.find('link');
        links.each((_, linkEl) => {
          const href = $(linkEl).attr('href') || '';
          const match = href.match(/\/content\/([^/]+)/);
          if (match && match[1]) {
            zimName = match[1];
          }
        });
      }

      // Fallback to name or id attribute
      if (!zimName) {
        zimName = item.attr('name') || item.find('name').first().text().trim() || item.attr('id') || item.find('id').text().trim();
      }

      if (!title || !zimName) return;

      // Language extraction (default 'en')
      let lang = item.attr('language') || item.find('language, lang').first().text().trim() || 'en';
      if (lang === 'eng') lang = 'en';
      if (lang === 'hin') lang = 'hi';

      // Tags extraction
      const tagsText = item.attr('tags') || item.find('tags, category').first().text().trim() || '';
      const tags = tagsText ? tagsText.split(/[;, ]+/).filter(Boolean) : [];

      // Clean human display name
      const name = this.deriveDisplayName(title, zimName);

      // Check matching overrides in sources.json
      const overrideKey = this.matchOverrideKey(zimName, overrides);
      const sourceOverride = overrideKey ? overrides[overrideKey] : null;

      // Build keywords list from title, description, tags, + overrides
      const extractedKeywords = this.extractKeywords(title, description, tags);
      const keywords = sourceOverride?.keywords
        ? Array.from(new Set([...extractedKeywords, ...sourceOverride.keywords]))
        : extractedKeywords;

      const basePriority = sourceOverride?.basePriority ?? (sourceOverride?.priority ?? 5);
      const category = sourceOverride?.category || this.detectCategory(zimName, title, tags);

      discovered.push({
        id: `zim-${index}-${zimName}`,
        zimName,
        name,
        title,
        provider: 'kiwix',
        lang: lang.substring(0, 2),
        basePriority,
        category,
        enabled: true,
        keywords,
        tags,
        description,
      });
    });

    return discovered;
  }

  private deriveDisplayName(title: string, zimName: string): string {
    if (zimName.includes('archlinux')) return 'Arch Wiki';
    if (zimName.includes('wikihow')) return title.includes('wikiHow') ? 'wikiHow' : title;
    if (zimName.includes('ifixit')) return 'iFixit';
    if (zimName.includes('wikipedia')) return title.includes('Wikipedia') || title.includes('विकिपीडिया') ? title : 'Wikipedia';
    if (zimName.includes('gutenberg')) return 'Project Gutenberg';
    if (zimName.includes('stackoverflow')) return 'Stack Overflow';
    return title.split(/[:-]/)[0].trim() || zimName;
  }

  private matchOverrideKey(zimName: string, overrides: Record<string, any>): string | null {
    const lower = zimName.toLowerCase();
    for (const key of Object.keys(overrides)) {
      if (lower.includes(key.toLowerCase())) {
        return key;
      }
    }
    return null;
  }

  private detectCategory(zimName: string, title: string, tags: string[]): string {
    const combined = `${zimName} ${title} ${tags.join(' ')}`.toLowerCase();
    if (combined.includes('arch') || combined.includes('devdocs') || combined.includes('code') || combined.includes('linux')) return 'technical';
    if (combined.includes('how') || combined.includes('guide') || combined.includes('recipe') || combined.includes('cook')) return 'guides';
    if (combined.includes('repair') || combined.includes('fix') || combined.includes('ifixit')) return 'repair';
    return 'general';
  }

  private extractKeywords(title: string, description: string, tags: string[]): string[] {
    const text = `${title} ${description} ${tags.join(' ')}`.toLowerCase();
    const tokens = text.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
    return Array.from(new Set(tokens)).slice(0, 15);
  }

  private logDiscoverySummary(): void {
    console.log(`====================================================`);
    console.log(` [ZimLibrary] Discovered ${this.discoveredSources.length} ZIM Knowledge Sources`);
    const sample = this.discoveredSources.slice(0, 5);
    sample.forEach(s => {
      console.log(` - ${s.name} (${s.zimName}) [Lang: ${s.lang}, Cat: ${s.category}, Priority: ${s.basePriority}]`);
    });
    if (this.discoveredSources.length > 5) {
      console.log(` ... and ${this.discoveredSources.length - 5} more ZIM sources.`);
    }
    console.log(`====================================================`);
  }
}
