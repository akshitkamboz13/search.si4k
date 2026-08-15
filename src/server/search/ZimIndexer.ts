import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import { config } from '../config.js';
import sourcesData from '../config/sources.json' with { type: 'json' };
import categoryKeywordsData from '../../../data/category-keywords.json' with { type: 'json' };

export interface IndexedZimSource {
  zimName: string;
  title: string;
  description: string;
  language: string;
  parentCategory: string;
  categories: string[];
  keywords: string[];
  tags: string[];
  basePriority: number;
  warnings?: string[];
}

export interface ZimIndexData {
  version: number;
  generatedAt: string;
  totalSources: number;
  sources: IndexedZimSource[];
}

export class ZimIndexer {
  private libraryXmlPath: string;
  private indexPath: string;
  private categoryKeywords: Record<string, string[]>;

  constructor(libraryXmlPath?: string, indexPath?: string) {
    this.libraryXmlPath = libraryXmlPath || config.kiwix.libraryXml;
    this.indexPath = indexPath || path.join(process.cwd(), 'data', 'zim-index.json');
    this.categoryKeywords = categoryKeywordsData as Record<string, string[]>;
  }

  /**
   * Build prebuilt ZIM category/relevance index from library.xml
   */
  public buildIndex(xmlContent: string): ZimIndexData {
    const $ = cheerio.load(xmlContent, { xmlMode: true });
    const sources: IndexedZimSource[] = [];
    const overrides = (sourcesData.overrides || {}) as Record<string, any>;

    const entries = $('entry, book');

    entries.each((_, el) => {
      const item = $(el);
      const title = item.attr('title') || item.find('title').first().text().trim();
      const description = item.attr('description') || item.find('summary, description, content').first().text().trim();
      const pathAttr = item.attr('path') || '';

      let zimName = '';
      if (pathAttr) {
        const match = pathAttr.match(/([^/\\]+)\.zim$/i);
        if (match && match[1]) zimName = match[1];
      }

      if (!zimName) {
        const links = item.find('link');
        links.each((_, linkEl) => {
          const href = $(linkEl).attr('href') || '';
          const match = href.match(/\/content\/([^/]+)/);
          if (match && match[1]) zimName = match[1];
        });
      }

      if (!zimName) {
        zimName = item.attr('name') || item.find('name').first().text().trim() || item.attr('id') || item.find('id').text().trim();
      }

      if (!title || !zimName) return;

      // Extract parent directory category from path (e.g. "../ZIM/Education/Programming/devdocs.zim" -> "Programming")
      const parentCategory = this.extractParentCategory(pathAttr);

      let lang = item.attr('language') || item.find('language, lang').first().text().trim() || 'en';
      if (lang === 'eng') lang = 'en';
      if (lang === 'hin') lang = 'hi';

      const tagsText = item.attr('tags') || item.find('tags, category').first().text().trim() || '';
      const tags = tagsText ? tagsText.split(/[;, ]+/).filter(Boolean) : [];

      const warnings: string[] = [];
      if (!description || description.length < 5) warnings.push('Sparse description');
      if (tags.length === 0) warnings.push('Missing tags');

      // Detect categories from parentCategory, tags, title, description
      const categories = this.detectCategories(zimName, title, description, tags, parentCategory);

      // Extract tokenized keywords
      const extractedKeywords = this.extractKeywords(title, description, tags, parentCategory);

      // Check overrides
      const overrideKey = this.matchOverrideKey(zimName, overrides);
      const sourceOverride = overrideKey ? overrides[overrideKey] : null;

      const keywords = sourceOverride?.keywords
        ? Array.from(new Set([...extractedKeywords, ...sourceOverride.keywords]))
        : extractedKeywords;

      const basePriority = sourceOverride?.basePriority ?? (sourceOverride?.priority ?? 5);

      sources.push({
        zimName,
        title,
        description: description || `Knowledge source: ${title}`,
        language: lang.substring(0, 2),
        parentCategory,
        categories,
        keywords,
        tags,
        basePriority,
        warnings: warnings.length > 0 ? warnings : undefined,
      });
    });

    const indexData: ZimIndexData = {
      version: 1,
      generatedAt: new Date().toISOString(),
      totalSources: sources.length,
      sources,
    };

    return indexData;
  }

  /**
   * Save generated index to data/zim-index.json
   */
  public saveIndex(indexData: ZimIndexData): void {
    const dir = path.dirname(this.indexPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.indexPath, JSON.stringify(indexData, null, 2), 'utf-8');
    this.printIndexReport(indexData);
  }

  /**
   * Load index from disk if available
   */
  public loadIndex(): ZimIndexData | null {
    if (fs.existsSync(this.indexPath)) {
      try {
        const raw = fs.readFileSync(this.indexPath, 'utf-8');
        return JSON.parse(raw) as ZimIndexData;
      } catch (err) {
        console.warn(`[ZimIndexer] Error reading index file at ${this.indexPath}:`, err);
      }
    }
    return null;
  }

  /**
   * Categorize user query against data/category-keywords.json
   */
  public categorizeQuery(query: string): Record<string, number> {
    if (!query || !query.trim()) return {};

    const normalized = query.toLowerCase().trim();
    const tokens = normalized.split(/\s+/).filter(Boolean);
    const categoryScores: Record<string, number> = {};

    for (const [cat, keywords] of Object.entries(this.categoryKeywords)) {
      let score = 0;
      for (const kw of keywords) {
        const kwLower = kw.toLowerCase();
        if (kwLower.includes(' ') && normalized.includes(kwLower)) {
          score += 5;
        } else if (!kwLower.includes(' ') && tokens.includes(kwLower)) {
          score += 3;
        }
      }
      if (score > 0) {
        categoryScores[cat] = score;
      }
    }

    return categoryScores;
  }

  private extractParentCategory(pathAttr: string): string {
    if (!pathAttr) return 'General';
    const parts = pathAttr.replace(/\\/g, '/').split('/').filter(Boolean);
    if (parts.length >= 2) {
      const parent = parts[parts.length - 2];
      if (parent && parent !== 'ZIM' && parent !== 'Metadata') {
        return parent.replace(/_/g, ' ');
      }
    }
    return 'General';
  }

  private detectCategories(
    zimName: string,
    title: string,
    description: string,
    tags: string[],
    parentCategory: string
  ): string[] {
    const text = `${zimName} ${title} ${description} ${tags.join(' ')} ${parentCategory}`.toLowerCase();
    const categoriesSet = new Set<string>();

    for (const [cat, keywords] of Object.entries(this.categoryKeywords)) {
      for (const kw of keywords) {
        if (text.includes(kw.toLowerCase())) {
          categoriesSet.add(cat);
          break;
        }
      }
    }

    if (categoriesSet.size === 0) {
      categoriesSet.add('general');
    }

    return Array.from(categoriesSet);
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

  private extractKeywords(title: string, description: string, tags: string[], parentCategory: string): string[] {
    const text = `${title} ${description} ${tags.join(' ')} ${parentCategory}`.toLowerCase();
    const tokens = text.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
    return Array.from(new Set(tokens)).slice(0, 20);
  }

  /**
   * Print comprehensive index report to console
   */
  public printIndexReport(indexData: ZimIndexData): void {
    console.log(`====================================================`);
    console.log(` Si4k ZIM Index Report`);
    console.log(`----------------------------------------------------`);
    console.log(` ZIMs discovered:    ${indexData.totalSources}`);

    const categoryCounts: Record<string, number> = {};
    let totalKeywords = 0;
    let warningsCount = 0;

    indexData.sources.forEach(s => {
      totalKeywords += s.keywords.length;
      if (s.warnings) warningsCount += s.warnings.length;
      s.categories.forEach(c => {
        categoryCounts[c] = (categoryCounts[c] || 0) + 1;
      });
    });

    const sortedCategories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);

    console.log(` Unique Categories:  ${sortedCategories.length}`);
    console.log(` Total Keywords:     ${totalKeywords}`);
    console.log(` Warnings Logged:    ${warningsCount}`);
    console.log(`\n Top Categories:`);
    sortedCategories.slice(0, 7).forEach(([cat, count]) => {
      console.log(`   ${cat.padEnd(14, ' ')} ${count}`);
    });

    console.log(`\n Sample Source Classifications:`);
    indexData.sources.slice(0, 5).forEach(s => {
      console.log(`   ${s.title} (${s.zimName}) -> ${s.categories.join(', ')} [Parent: ${s.parentCategory}]`);
    });
    console.log(`====================================================`);
  }
}
