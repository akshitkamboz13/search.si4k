import { DiscoveredZim } from './ZimLibrary.js';
import { ZimIndexer, CategoryIntent } from './ZimIndexer.js';
import { config } from '../config.js';

export interface SourceRoutingScore {
  source: DiscoveredZim;
  effectivePriority: number;
  keywordPriority: number;
  basePriority: number;
  intersectionBonus: number;
  matchedCategories: string[];
  matchedKeywords: string[];
}

export interface SelectedSourcesResult {
  highlyRelevant: DiscoveredZim[];
  moderatelyRelevant: DiscoveredZim[];
  generalFallback: DiscoveredZim[];
  selectedSources: DiscoveredZim[];
  intents: CategoryIntent[];
  scoredRanks: SourceRoutingScore[];
}

export class SourceRelevance {
  private zimIndexer: ZimIndexer;

  constructor() {
    this.zimIndexer = new ZimIndexer();
  }

  /**
   * Refactored ZIM Search Routing:
   * Driven primarily by query keyword/category matches, with predefined basePriority fallback.
   */
  public selectRelevantSources(
    query: string,
    discoveredSources: DiscoveredZim[],
    maxSourcesToQuery: number = 10
  ): SelectedSourcesResult {
    if (!query || !query.trim() || discoveredSources.length === 0) {
      const fallback = discoveredSources.slice(0, maxSourcesToQuery);
      return {
        highlyRelevant: [],
        moderatelyRelevant: [],
        generalFallback: fallback,
        selectedSources: fallback,
        intents: [],
        scoredRanks: [],
      };
    }

    const normalizedQuery = query.toLowerCase().trim();
    const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

    // 1. Detect query intent categories
    const intents = this.zimIndexer.categorizeQueryIntents(normalizedQuery);
    const matchedCategoryNames = intents.map(i => i.name);

    const keywordWeight = config.search.keywordWeight || 10;
    const basePriorityWeight = config.search.basePriorityWeight || 1;
    const minSourceScore = config.search.minSourceScore || 5;

    // 2. Score each discovered ZIM source
    const scoredRanks: SourceRoutingScore[] = discoveredSources.map(source => {
      let keywordPriority = 0;
      let intersectionBonus = 0;
      const matchedCategories: string[] = [];
      const matchedKeywords: string[] = [];

      const sourceCats = source.categories || [source.category];
      const sourceKeywords = (source.keywords || []).map(k => k.toLowerCase());
      const titleLower = (source.title || source.name).toLowerCase();
      const descLower = (source.description || '').toLowerCase();
      const tagsLower = (source.tags || []).map(t => t.toLowerCase());
      const parentLower = (source.parentCategory || '').toLowerCase();

      // A. Category matching & intersection bonus
      for (const intent of intents) {
        if (sourceCats.includes(intent.name) || parentLower.includes(intent.name)) {
          keywordPriority += intent.score;
          matchedCategories.push(intent.name);
          matchedKeywords.push(...intent.matchedKeywords);
        }
      }

      const uniqueMatchedCats = Array.from(new Set(matchedCategories));
      if (uniqueMatchedCats.length === 1) {
        intersectionBonus += 10;
      } else if (uniqueMatchedCats.length >= 2) {
        intersectionBonus += 35; // 20 base + 15 intersection bonus
      }

      // B. Metadata matching (Title, Tags, Parent Category, Keywords)
      for (const token of queryTokens) {
        if (token.length > 2) {
          if (titleLower.includes(token)) {
            keywordPriority += 10;
            matchedKeywords.push(token);
          }
          if (tagsLower.includes(token) || sourceKeywords.includes(token)) {
            keywordPriority += 8;
            matchedKeywords.push(token);
          }
          if (parentLower.includes(token)) {
            keywordPriority += 6;
            matchedKeywords.push(token);
          }
          // Loose description match is kept very low (+1)
          if (descLower.includes(token)) {
            keywordPriority += 1;
          }
        }
      }

      // 3. Two-layer Effective Priority Weighting Formula
      const effectivePriority =
        (keywordPriority * keywordWeight) +
        (source.basePriority * basePriorityWeight) +
        intersectionBonus;

      return {
        source,
        effectivePriority,
        keywordPriority,
        basePriority: source.basePriority,
        intersectionBonus,
        matchedCategories: uniqueMatchedCats,
        matchedKeywords: Array.from(new Set(matchedKeywords)),
      };
    });

    // Sort all ZIMs by effectivePriority descending
    scoredRanks.sort((a, b) => b.effectivePriority - a.effectivePriority);

    // Development logging for search routing decisions
    if (config.nodeEnv === 'development') {
      console.log(`\n[SearchRouting] Query: "${normalizedQuery}"`);
      console.log(`[SearchRouting] Detected Categories:`, intents.map(i => `${i.name} (score=${i.score})`).join(', ') || 'None');
      console.log(`[SearchRouting] Top ZIM Routing:`);
      scoredRanks.slice(0, 8).forEach(r => {
        console.log(` - ${r.source.name.padEnd(25, ' ')} score=${r.effectivePriority} (kwPrio=${r.keywordPriority}, basePrio=${r.basePriority}, cats=[${r.matchedCategories.join(',')}])`);
      });
    }

    const highlyRelevant: DiscoveredZim[] = [];
    const moderatelyRelevant: DiscoveredZim[] = [];
    const generalFallback: DiscoveredZim[] = [];

    for (const rank of scoredRanks) {
      if (rank.effectivePriority >= 100) {
        highlyRelevant.push(rank.source);
      } else if (rank.effectivePriority >= minSourceScore) {
        moderatelyRelevant.push(rank.source);
      } else if (rank.source.category === 'general' || rank.source.zimName.includes('wikipedia') || rank.source.zimName.includes('gutenberg')) {
        generalFallback.push(rank.source);
      }
    }

    const selected: DiscoveredZim[] = [];

    // Wave 1: Highest relevance ZIMs
    for (const s of highlyRelevant) {
      if (selected.length < maxSourcesToQuery && !selected.some(x => x.id === s.id)) {
        selected.push(s);
      }
    }

    // Wave 2: Next relevant ZIMs
    for (const s of moderatelyRelevant) {
      if (selected.length < maxSourcesToQuery && !selected.some(x => x.id === s.id)) {
        selected.push(s);
      }
    }

    // Wave 3: General fallback ZIMs
    for (const s of generalFallback) {
      if (selected.length < maxSourcesToQuery && !selected.some(x => x.id === s.id)) {
        selected.push(s);
      }
    }

    // Fallback if less than 4 sources selected
    if (selected.length < 4) {
      for (const item of scoredRanks) {
        if (selected.length >= maxSourcesToQuery) break;
        if (!selected.some(x => x.id === item.source.id)) {
          selected.push(item.source);
        }
      }
    }

    return {
      highlyRelevant,
      moderatelyRelevant,
      generalFallback,
      selectedSources: selected,
      intents,
      scoredRanks,
    };
  }
}
