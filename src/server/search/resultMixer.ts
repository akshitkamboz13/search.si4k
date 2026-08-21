import { SearchResult } from '../../shared/types.js';
import { ArticleScorer } from './ArticleScorer.js';
import { config } from '../config.js';

export interface SourceResultsGroup {
  sourceId: string;
  sourceName: string;
  effectivePriority: number;
  results: SearchResult[];
}

export class ResultMixer {
  private articleScorer: ArticleScorer;

  constructor() {
    this.articleScorer = new ArticleScorer();
  }

  /**
   * Helper comparator: returns negative if a ranks before b (a higher score), positive if b ranks before a.
   */
  private compareResults(a: SearchResult, b: SearchResult): number {
    const scoreA = a.finalScore ?? 0;
    const scoreB = b.finalScore ?? 0;
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }
    const nativeA = a.nativeSearchScore ?? 0;
    const nativeB = b.nativeSearchScore ?? 0;
    if (nativeB !== nativeA) {
      return nativeB - nativeA;
    }
    return a.title.localeCompare(b.title);
  }

  /**
   * Mix and rank results across sources query-aware for a target size (default 140).
   * 
   * Enforces source diversity so no single site monopolizes top consecutive positions.
   * Filters out results below config.search.minSourceScore.
   */
  public mixResults(groups: SourceResultsGroup[], targetSize: number = 140, query: string = ''): SearchResult[] {
    if (groups.length === 0) return [];

    const minScore = config.search.minSourceScore ?? 5;

    // 1. Score every article inside each source group relative to the query
    const sourceQueues: Map<string, SearchResult[]> = new Map();

    for (const group of groups) {
      if (group.results.length === 0) continue;

      const scoredInGroup: SearchResult[] = [];
      group.results.forEach((item, index) => {
        this.articleScorer.scoreArticle(
          item,
          query,
          { basePriority: 5, effectivePriority: group.effectivePriority, categories: [group.sourceName.toLowerCase()] },
          index
        );
        if (item.finalScore !== undefined && item.finalScore >= minScore) {
          scoredInGroup.push(item);
        }
      });

      scoredInGroup.sort((a, b) => this.compareResults(a, b));

      const key = group.sourceId || group.sourceName;
      if (!sourceQueues.has(key)) {
        sourceQueues.set(key, []);
      }
      sourceQueues.get(key)!.push(...scoredInGroup);
    }

    // Sort each source queue
    for (const [, queue] of sourceQueues.entries()) {
      queue.sort((a, b) => this.compareResults(a, b));
    }

    const mixedResults: SearchResult[] = [];
    const MAX_CONSECUTIVE_PER_SOURCE = 2;

    let lastSourceKey: string | null = null;
    let consecutiveCount = 0;

    // 2. Priority & Score-preserving Diversity Interleaving Loop
    while (mixedResults.length < targetSize) {
      const availableSources = Array.from(sourceQueues.entries()).filter(([, q]) => q.length > 0);
      if (availableSources.length === 0) break;

      // Find the absolute highest scoring candidate among all source queue heads
      let bestSourceKey: string = availableSources[0][0];
      let bestItem: SearchResult = availableSources[0][1][0];

      for (let i = 1; i < availableSources.length; i++) {
        const [sKey, queue] = availableSources[i];
        const candidate = queue[0];
        if (this.compareResults(candidate, bestItem) < 0) {
          bestItem = candidate;
          bestSourceKey = sKey;
        }
      }

      let chosenSourceKey = bestSourceKey;
      let chosenItem = bestItem;

      // Enforce consecutive same-source cap
      if (
        lastSourceKey === bestSourceKey &&
        consecutiveCount >= MAX_CONSECUTIVE_PER_SOURCE &&
        availableSources.length > 1
      ) {
        let altSourceKey: string | null = null;
        let altItem: SearchResult | null = null;

        for (const [sKey, queue] of availableSources) {
          if (sKey === bestSourceKey) continue;
          const candidate = queue[0];
          if (!altItem || this.compareResults(candidate, altItem) < 0) {
            altItem = candidate;
            altSourceKey = sKey;
          }
        }

        if (altItem && altSourceKey) {
          chosenSourceKey = altSourceKey;
          chosenItem = altItem;
        }
      }

      const queue = sourceQueues.get(chosenSourceKey)!;
      queue.shift();
      mixedResults.push(chosenItem);

      if (lastSourceKey === chosenSourceKey) {
        consecutiveCount++;
      } else {
        lastSourceKey = chosenSourceKey;
        consecutiveCount = 1;
      }
    }

    // Development logging
    if (process.env.NODE_ENV === 'development' && query) {
      console.log(`\n[ArticleRanking] Query: "${query}" (Total Candidates: ${mixedResults.length})`);
      mixedResults.slice(0, 6).forEach(r => {
        console.log(` - "${r.title}" (${r.source}) -> finalScore=${r.finalScore} (native=${r.nativeSearchScore}, kwScore=${r.keywordMatchScore}, catScore=${r.categoryMatchScore}, srcPrio=${r.effectivePriority})`);
      });
    }

    return mixedResults;
  }
}
