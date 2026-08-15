import fs from 'fs';
import { SearchSourceConfig } from '../../shared/types.js';
import { config } from '../config.js';
import { ZimIndexer, ZimIndexData } from './ZimIndexer.js';

export interface DiscoveredZim extends SearchSourceConfig {
  title?: string;
  tags: string[];
  description: string;
  parentCategory?: string;
  categories?: string[];
  lastUpdated?: string;
}

export class ZimLibrary {
  private libraryXmlPath: string;
  private kiwixServerUrl: string;
  private zimIndexer: ZimIndexer;
  private discoveredSources: DiscoveredZim[] = [];
  private lastMtimeMs: number = 0;
  private lastFetchTimeMs: number = 0;
  private cacheTtlMs: number = 5 * 60 * 1000; // 5 minutes cache TTL

  constructor(libraryXmlPath?: string, kiwixServerUrl?: string) {
    this.libraryXmlPath = libraryXmlPath || config.kiwix.libraryXml;
    this.kiwixServerUrl = (kiwixServerUrl || config.kiwix.localUrl).replace(/\/$/, '');
    this.zimIndexer = new ZimIndexer(this.libraryXmlPath);
  }

  /**
   * Load discovered ZIM sources using prebuilt data/zim-index.json when available
   */
  async getDiscoveredSources(forceReload: boolean = false): Promise<DiscoveredZim[]> {
    const now = Date.now();

    // 1. Try loading from prebuilt index (data/zim-index.json) if valid
    if (!forceReload && this.discoveredSources.length > 0) {
      return this.discoveredSources;
    }

    const prebuiltIndex = this.zimIndexer.loadIndex();
    let libraryFileMtime = 0;

    if (fs.existsSync(this.libraryXmlPath)) {
      try {
        libraryFileMtime = fs.statSync(this.libraryXmlPath).mtimeMs;
      } catch {
        libraryFileMtime = 0;
      }
    }

    // Check if prebuilt index is fresh
    if (!forceReload && prebuiltIndex && prebuiltIndex.sources.length > 0) {
      const indexTime = new Date(prebuiltIndex.generatedAt).getTime();
      if (libraryFileMtime === 0 || indexTime >= libraryFileMtime) {
        console.log(`[ZimLibrary] Loading ${prebuiltIndex.totalSources} ZIM sources from prebuilt index data/zim-index.json`);
        this.discoveredSources = prebuiltIndex.sources.map((s, idx) => ({
          id: `zim-${idx}-${s.zimName}`,
          zimName: s.zimName,
          name: s.title,
          title: s.title,
          provider: 'kiwix',
          lang: s.language,
          basePriority: s.basePriority,
          category: s.categories[0] || 'general',
          parentCategory: s.parentCategory,
          categories: s.categories,
          enabled: true,
          keywords: s.keywords,
          tags: s.tags,
          description: s.description,
        }));
        this.lastMtimeMs = libraryFileMtime;
        return this.discoveredSources;
      }
    }

    // 2. Rebuild index if missing or stale from local XML or HTTP catalog
    console.log(`[ZimLibrary] Prebuilt index missing or stale. Rebuilding ZIM index...`);
    let xmlContent = '';

    if (fs.existsSync(this.libraryXmlPath)) {
      try {
        xmlContent = fs.readFileSync(this.libraryXmlPath, 'utf-8');
      } catch (err) {
        console.warn(`[ZimLibrary] Error reading local library.xml at ${this.libraryXmlPath}:`, err);
      }
    }

    if (!xmlContent) {
      try {
        const catalogUrl = `${this.kiwixServerUrl}/catalog/v2/entries?count=1000`;
        const res = await fetch(catalogUrl, { headers: { 'Accept': 'application/atom+xml, application/xml, */*' } });
        if (res.ok) xmlContent = await res.text();
      } catch (err) {
        console.error(`[ZimLibrary] Failed to fetch catalog feed from ${this.kiwixServerUrl}:`, err);
      }
    }

    if (xmlContent) {
      const newIndexData = this.zimIndexer.buildIndex(xmlContent);
      this.zimIndexer.saveIndex(newIndexData);
      this.discoveredSources = newIndexData.sources.map((s, idx) => ({
        id: `zim-${idx}-${s.zimName}`,
        zimName: s.zimName,
        name: s.title,
        title: s.title,
        provider: 'kiwix',
        lang: s.language,
        basePriority: s.basePriority,
        category: s.categories[0] || 'general',
        parentCategory: s.parentCategory,
        categories: s.categories,
        enabled: true,
        keywords: s.keywords,
        tags: s.tags,
        description: s.description,
      }));
      this.lastMtimeMs = libraryFileMtime;
      this.lastFetchTimeMs = now;
    }

    return this.discoveredSources;
  }
}
