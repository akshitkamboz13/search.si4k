import fs from 'fs';
import { SearchSourceConfig } from '../../shared/types.js';
import { config } from '../config.js';
import { ZimIndexer, ZimIndexData, IndexedZimSource } from './ZimIndexer.js';

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
  private cacheTtlMs: number;
  private lastXmlContent: string = '';
  private refreshPromise: Promise<DiscoveredZim[]> | null = null;
  private isShutdown: boolean = false;
  private shutdownToken: number = 0;

  constructor(libraryXmlPath?: string, kiwixServerUrl?: string, cacheTtlMs?: number) {
    this.libraryXmlPath = libraryXmlPath || config.kiwix.libraryXml;
    this.kiwixServerUrl = (kiwixServerUrl || config.kiwix.localUrl).replace(/\/$/, '');
    this.zimIndexer = new ZimIndexer(this.libraryXmlPath);
    this.cacheTtlMs = cacheTtlMs !== undefined ? cacheTtlMs : config.kiwix.cacheTtlMs;
  }

  public getCacheTtl(): number {
    return this.cacheTtlMs;
  }

  public setCacheTtl(ms: number): void {
    this.cacheTtlMs = ms;
  }

  public getLastFetchTimeMs(): number {
    return this.lastFetchTimeMs;
  }

  public shutdown(): void {
    console.log('[ZimLibrary] Shutting down ZIM library manager...');
    this.isShutdown = true;
    this.shutdownToken++;
    this.refreshPromise = null;
  }

  /**
   * Load discovered ZIM sources with periodic catalog reconciliation
   */
  async getDiscoveredSources(forceReload: boolean = false): Promise<DiscoveredZim[]> {
    if (this.isShutdown) {
      return this.discoveredSources;
    }

    const now = Date.now();
    const isFresh = (now - this.lastFetchTimeMs) < this.cacheTtlMs;

    // 1. If cached sources exist, not forcing reload, and TTL is still valid -> return cached array immediately
    if (!forceReload && this.discoveredSources.length > 0 && isFresh) {
      return this.discoveredSources;
    }

    // 2. Share active in-flight refresh promise to prevent concurrent duplicate catalog requests
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const currentToken = this.shutdownToken;
    this.refreshPromise = this.performRefresh(forceReload, currentToken).finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  private mapIndexedSourcesToDiscovered(sources: IndexedZimSource[]): DiscoveredZim[] {
    return sources.map((s, idx) => ({
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
  }

  private async performRefresh(forceReload: boolean, currentToken: number): Promise<DiscoveredZim[]> {
    const now = Date.now();

    let libraryFileMtime = 0;
    if (fs.existsSync(this.libraryXmlPath)) {
      try {
        libraryFileMtime = fs.statSync(this.libraryXmlPath).mtimeMs;
      } catch {
        libraryFileMtime = 0;
      }
    }

    // Attempt 1: Try loading from prebuilt index if discoveredSources is empty and prebuilt index is valid
    if (!forceReload && this.discoveredSources.length === 0) {
      const prebuiltIndex = this.zimIndexer.loadIndex();
      if (prebuiltIndex && prebuiltIndex.sources.length > 0) {
        const indexTime = new Date(prebuiltIndex.generatedAt).getTime();
        if (libraryFileMtime === 0 || indexTime >= libraryFileMtime) {
          if (this.isShutdown || currentToken !== this.shutdownToken) {
            return this.discoveredSources;
          }
          console.log(`[ZimLibrary] Loading ${prebuiltIndex.totalSources} ZIM sources from prebuilt index data/zim-index.json`);
          const newSources = this.mapIndexedSourcesToDiscovered(prebuiltIndex.sources);
          this.discoveredSources = newSources; // Atomic swap
          this.lastMtimeMs = libraryFileMtime;
          this.lastFetchTimeMs = now;
          return this.discoveredSources;
        }
      }
    }

    // Attempt 2: Fetch current catalog (HTTP catalog feed preferred, with local library.xml fallback)
    let xmlContent = '';
    let xmlSource = '';

    // First try fetching live HTTP catalog if available
    try {
      const catalogUrl = `${this.kiwixServerUrl}/catalog/v2/entries?count=1000`;
      const res = await fetch(catalogUrl, {
        headers: { 'Accept': 'application/atom+xml, application/xml, */*' }
      });
      if (res.ok) {
        xmlContent = await res.text();
        xmlSource = 'http-catalog';
      }
    } catch (err) {
      // Kiwix HTTP endpoint unavailable
    }

    // Fallback to local library.xml if HTTP fetch returned no content
    if (!xmlContent && fs.existsSync(this.libraryXmlPath)) {
      try {
        xmlContent = fs.readFileSync(this.libraryXmlPath, 'utf-8');
        xmlSource = 'local-file';
      } catch (err) {
        console.warn(`[ZimLibrary] Error reading local library.xml at ${this.libraryXmlPath}:`, err);
      }
    }

    // Shutdown protection check before proceeding with parsing or state mutation
    if (this.isShutdown || currentToken !== this.shutdownToken) {
      return this.discoveredSources;
    }

    if (xmlContent) {
      // Check if catalog XML content is identical to last processed feed
      if (xmlContent === this.lastXmlContent && this.discoveredSources.length > 0) {
        console.log(`[ZimLibrary] Catalog feed unchanged (${xmlSource}). Preserving existing index.`);
        this.lastFetchTimeMs = now;
        return this.discoveredSources;
      }

      console.log(`[ZimLibrary] Reconciling ZIM catalog (${xmlSource}). Building index...`);
      const newIndexData = this.zimIndexer.buildIndex(xmlContent);
      const newSources = this.mapIndexedSourcesToDiscovered(newIndexData.sources);

      if (this.isShutdown || currentToken !== this.shutdownToken) {
        return this.discoveredSources;
      }

      // Persist index to disk and perform atomic in-memory swap
      this.zimIndexer.saveIndex(newIndexData);
      this.lastXmlContent = xmlContent;
      this.discoveredSources = newSources; // Atomic swap
      this.lastMtimeMs = libraryFileMtime;
      this.lastFetchTimeMs = now;
      console.log(`[ZimLibrary] Catalog reconciliation complete. Discovered ${newSources.length} ZIM sources.`);
      return this.discoveredSources;
    }

    // Catalog unreachable: preserve last known-good index if present
    if (this.discoveredSources.length > 0) {
      console.warn(`[ZimLibrary] Catalog refresh failed. Preserving last known-good index with ${this.discoveredSources.length} sources.`);
      this.lastFetchTimeMs = now; // Reset TTL so retry happens on next interval
      return this.discoveredSources;
    }

    console.warn(`[ZimLibrary] Catalog refresh failed and no pre-existing index available.`);
    return this.discoveredSources;
  }
}
