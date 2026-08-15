import { DiscoveredZim } from './ZimLibrary.js';
import { SourceRanker } from './sourceRanker.js';
import sourcesData from '../config/sources.json' with { type: 'json' };

export interface SelectedSourcesResult {
  highlyRelevant: DiscoveredZim[];
  moderatelyRelevant: DiscoveredZim[];
  generalFallback: DiscoveredZim[];
  selectedSources: DiscoveredZim[];
}

export class SourceRelevance {
  private sourceRanker: SourceRanker;

  constructor() {
    this.sourceRanker = new SourceRanker(sourcesData.scoringConfig);
  }

  /**
   * Two-Stage Source Relevance Selection:
   * Evaluates user query against title, description, tags, keywords, and categories.
   * Selects candidate ZIMs without blindly searching hundreds of ZIM files.
   */
  public selectRelevantSources(
    query: string,
    discoveredSources: DiscoveredZim[],
    maxSourcesToQuery: number = 8
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

    // 1. Calculate effective priority score per discovered ZIM
    const scoredSources = discoveredSources.map(source => {
      let score = this.sourceRanker.calculateEffectivePriority(source, query);

      // Additional text relevance matching against title, description, tags
      const titleLower = (source.title || source.name).toLowerCase();
      const descLower = (source.description || '').toLowerCase();
      const tagsLower = (source.tags || []).join(' ').toLowerCase();

      for (const token of queryTokens) {
        if (token.length > 2) {
          if (titleLower.includes(token)) score += 4;
          if (tagsLower.includes(token)) score += 3;
          if (descLower.includes(token)) score += 1;
        }
      }

      // Domain intent boosts
      if (normalizedQuery.includes('cook') || normalizedQuery.includes('recipe') || normalizedQuery.includes('paneer') || normalizedQuery.includes('food')) {
        if (source.category === 'guides' || titleLower.includes('cook') || tagsLower.includes('recipe')) score += 8;
      }
      if (normalizedQuery.includes('arch') || normalizedQuery.includes('pacman') || normalizedQuery.includes('linux')) {
        if (source.zimName.includes('arch') || titleLower.includes('arch')) score += 10;
      }
      if (normalizedQuery.includes('iphone') || normalizedQuery.includes('battery') || normalizedQuery.includes('repair')) {
        if (source.zimName.includes('ifixit') || titleLower.includes('ifixit')) score += 10;
      }

      return {
        source,
        score,
      };
    });

    // Sort by score descending
    scoredSources.sort((a, b) => b.score - a.score);

    const highlyRelevant: DiscoveredZim[] = [];
    const moderatelyRelevant: DiscoveredZim[] = [];
    const generalFallback: DiscoveredZim[] = [];

    for (const item of scoredSources) {
      if (item.score >= 12) {
        highlyRelevant.push(item.source);
      } else if (item.score >= 7) {
        moderatelyRelevant.push(item.source);
      } else if (item.source.category === 'general' || item.source.zimName.includes('wikipedia')) {
        generalFallback.push(item.source);
      }
    }

    // Combine into final selected candidate sources list (capped at maxSourcesToQuery)
    const selected: DiscoveredZim[] = [];

    // Always include highly relevant sources first
    for (const s of highlyRelevant) {
      if (selected.length < maxSourcesToQuery && !selected.some(x => x.id === s.id)) {
        selected.push(s);
      }
    }

    // Then moderately relevant sources
    for (const s of moderatelyRelevant) {
      if (selected.length < maxSourcesToQuery && !selected.some(x => x.id === s.id)) {
        selected.push(s);
      }
    }

    // Always ensure at least one general fallback source (e.g. Wikipedia) is present
    for (const s of generalFallback) {
      if (selected.length < maxSourcesToQuery && !selected.some(x => x.id === s.id)) {
        selected.push(s);
      }
    }

    // Fallback if less than 4 sources selected
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
    };
  }
}
