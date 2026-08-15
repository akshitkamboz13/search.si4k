import { DiscoveredZim } from './ZimLibrary.js';
import { SourceRanker } from './sourceRanker.js';
import { ZimIndexer } from './ZimIndexer.js';
import sourcesData from '../config/sources.json' with { type: 'json' };

export interface SelectedSourcesResult {
  highlyRelevant: DiscoveredZim[];
  moderatelyRelevant: DiscoveredZim[];
  generalFallback: DiscoveredZim[];
  selectedSources: DiscoveredZim[];
  queryCategories?: Record<string, number>;
}

export class SourceRelevance {
  private sourceRanker: SourceRanker;
  private zimIndexer: ZimIndexer;

  constructor() {
    this.sourceRanker = new SourceRanker(sourcesData.scoringConfig);
    this.zimIndexer = new ZimIndexer();
  }

  /**
   * Two-Stage Source Relevance Selection using Prebuilt Category-Keyword Intent Indexing
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
      };
    }

    const normalizedQuery = query.toLowerCase().trim();
    const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

    // 1. Query intent categorization via prebuilt category-keywords dataset
    const queryCategories = this.zimIndexer.categorizeQuery(trimmedQuery(query));

    // 2. Score each discovered ZIM source based on category match + title + description + tags + parentCategory + overrides
    const scoredSources = discoveredSources.map(source => {
      let score = this.sourceRanker.calculateEffectivePriority(source, query);

      // Match source categories against matched query categories
      const sourceCats = source.categories || [source.category];
      for (const [cat, catScore] of Object.entries(queryCategories)) {
        if (sourceCats.includes(cat) || (source.parentCategory && source.parentCategory.toLowerCase().includes(cat))) {
          score += catScore * 3;
        }
      }

      // Metadata matching (title, description, tags, parentCategory)
      const titleLower = (source.title || source.name).toLowerCase();
      const descLower = (source.description || '').toLowerCase();
      const tagsLower = (source.tags || []).join(' ').toLowerCase();
      const parentLower = (source.parentCategory || '').toLowerCase();

      for (const token of queryTokens) {
        if (token.length > 2) {
          if (titleLower.includes(token)) score += 4;
          if (tagsLower.includes(token)) score += 3;
          if (parentLower.includes(token)) score += 3;
          if (descLower.includes(token)) score += 1;
        }
      }

      return {
        source,
        score,
      };
    });

    scoredSources.sort((a, b) => b.score - a.score);

    const highlyRelevant: DiscoveredZim[] = [];
    const moderatelyRelevant: DiscoveredZim[] = [];
    const generalFallback: DiscoveredZim[] = [];

    for (const item of scoredSources) {
      if (item.score >= 12) {
        highlyRelevant.push(item.source);
      } else if (item.score >= 6) {
        moderatelyRelevant.push(item.source);
      } else if (item.source.category === 'general' || item.source.zimName.includes('wikipedia') || item.source.zimName.includes('gutenberg')) {
        generalFallback.push(item.source);
      }
    }

    const selected: DiscoveredZim[] = [];

    for (const s of highlyRelevant) {
      if (selected.length < maxSourcesToQuery && !selected.some(x => x.id === s.id)) {
        selected.push(s);
      }
    }

    for (const s of moderatelyRelevant) {
      if (selected.length < maxSourcesToQuery && !selected.some(x => x.id === s.id)) {
        selected.push(s);
      }
    }

    for (const s of generalFallback) {
      if (selected.length < maxSourcesToQuery && !selected.some(x => x.id === s.id)) {
        selected.push(s);
      }
    }

    if (selected.length < 4) {
      for (const item of scoredSources) {
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
      queryCategories,
    };
  }
}

function trimmedQuery(q: string): string {
  return q ? q.trim() : '';
}
