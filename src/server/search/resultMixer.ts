import { SearchResult } from '../../shared/types.js';

export interface SourceResultsGroup {
  sourceId: string;
  sourceName: string;
  effectivePriority: number;
  results: SearchResult[];
}

export class ResultMixer {
  /**
   * Mix results across sources adaptively for a target page size (default 20).
   */
  public mixResults(groups: SourceResultsGroup[], targetSize: number = 20): SearchResult[] {
    if (groups.length === 0) return [];

    // 1. Sort source groups by effective priority descending
    const sortedGroups = [...groups].sort((a, b) => b.effectivePriority - a.effectivePriority);

    // Filter out groups with 0 results
    const activeGroups = sortedGroups.filter(g => g.results.length > 0);
    if (activeGroups.length === 0) return [];

    // Create pools of remaining results per source
    const pools = activeGroups.map(g => ({
      group: g,
      remaining: [...g.results],
    }));

    const mixedResults: SearchResult[] = [];
    const sourcePickedCounts: Record<string, number> = {};
    activeGroups.forEach(g => { sourcePickedCounts[g.sourceId] = 0; });

    // Calculate initial allocation caps per rank position
    // Rank 0: 6, Rank 1: 5, Rank 2: 4, Rank 3+: 3
    const initialCaps = activeGroups.map((_, index) => {
      if (index === 0) return 6;
      if (index === 1) return 5;
      if (index === 2) return 4;
      return 3;
    });

    // Pass 1: Round-robin pick up to initial caps
    let addedInPass = true;
    while (mixedResults.length < targetSize && addedInPass) {
      addedInPass = false;

      for (let i = 0; i < pools.length; i++) {
        if (mixedResults.length >= targetSize) break;

        const pool = pools[i];
        const cap = initialCaps[i];
        const currentPicked = sourcePickedCounts[pool.group.sourceId];

        if (currentPicked < cap && pool.remaining.length > 0) {
          const item = pool.remaining.shift()!;
          item.effectivePriority = pool.group.effectivePriority;
          mixedResults.push(item);
          sourcePickedCounts[pool.group.sourceId] += 1;
          addedInPass = true;
        }
      }
    }

    // Pass 2: Adaptive deficit redistribution
    // If we haven't reached targetSize (20), take available results from higher priority sources that have remaining items
    while (mixedResults.length < targetSize) {
      let candidateFound = false;

      for (let i = 0; i < pools.length; i++) {
        if (mixedResults.length >= targetSize) break;

        const pool = pools[i];
        if (pool.remaining.length > 0) {
          const item = pool.remaining.shift()!;
          item.effectivePriority = pool.group.effectivePriority;
          mixedResults.push(item);
          sourcePickedCounts[pool.group.sourceId] += 1;
          candidateFound = true;
        }
      }

      if (!candidateFound) break;
    }

    return mixedResults;
  }
}
