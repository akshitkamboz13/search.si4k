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
  prioritySources: DiscoveredZim[];
  remainingSources: DiscoveredZim[];
  allRankedSources: DiscoveredZim[];
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
   * Priority ZIM selection determines search order, NEVER search scope.
   * Orders all eligible ZIMs in the library into Wave 1 (Priority sources) and Wave 2 (Remaining sources).
   */
  public selectRelevantSources(
    query: string,
    discoveredSources: DiscoveredZim[],
    priorityThresholdCount: number = 16
  ): SelectedSourcesResult {
    if (!query || !query.trim() || discoveredSources.length === 0) {
      const priority = discoveredSources.slice(0, priorityThresholdCount);
      const remaining = discoveredSources.slice(priorityThresholdCount);
      return {
        highlyRelevant: [],
        moderatelyRelevant: [],
        generalFallback: priority,
        selectedSources: priority,
        prioritySources: priority,
        remainingSources: remaining,
        allRankedSources: discoveredSources,
        intents: [],
        scoredRanks: [],
      };
    }

    const normalizedQuery = query.toLowerCase().trim();
    const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

    // 1. Detect query intent categories
    const intents = this.zimIndexer.categorizeQueryIntents(normalizedQuery);

    const keywordWeight = config.search.keywordWeight || 10;
    const basePriorityWeight = config.search.basePriorityWeight || 1;

    // 2. Score every single discovered ZIM source in the library
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
        intersectionBonus += 35;
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

    // Sort ALL ZIMs in the library by effectivePriority descending
    scoredRanks.sort((a, b) => b.effectivePriority - a.effectivePriority);

    const allRankedSources = scoredRanks.map(r => r.source);

    // Wave 1: Priority sources (Top N highest priority sources)
    const prioritySources = allRankedSources.slice(0, Math.min(priorityThresholdCount, allRankedSources.length));

    // Wave 2: Remaining sources (All other ZIMs in the library)
    const remainingSources = allRankedSources.slice(prioritySources.length);

    // Development logging for search routing decisions
    if (config.nodeEnv === 'development') {
      console.log(`\n[SearchRouting] Query: "${normalizedQuery}"`);
      console.log(`[SearchRouting] Detected Categories:`, intents.map(i => `${i.name} (score=${i.score})`).join(', ') || 'None');
      console.log(`[SearchRouting] Priority Sources (${prioritySources.length}):`, prioritySources.map(s => s.name).join(', '));
      console.log(`[SearchRouting] Remaining Sources (${remainingSources.length}):`, remainingSources.length);
    }

    return {
      highlyRelevant: prioritySources,
      moderatelyRelevant: [],
      generalFallback: remainingSources,
      selectedSources: prioritySources,
      prioritySources,
      remainingSources,
      allRankedSources,
      intents,
      scoredRanks,
    };
  }
}
