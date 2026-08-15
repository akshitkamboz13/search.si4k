import { SearchResult } from '../../shared/types.js';
import { ArticleScorer } from './ArticleScorer.js';

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
   * Mix and rank results across sources query-aware for a target size (default 140).
   * 
   * Scoring formula per article:
   * finalScore = nativeSearchScore + keywordMatchScore + categoryMatchScore + effectiveSourcePriority
   * 
   * Deterministic sorting:
   * 1. finalScore descending
   * 2. nativeSearchScore descending
   * 3. title alphabetical tie-breaker
   */
  public mixResults(groups: SourceResultsGroup[], targetSize: number = 140, query: string = ''): SearchResult[] {
    if (groups.length === 0) return [];

    const allScoredResults: SearchResult[] = [];

    // 1. Score every article inside each source group relative to the query
    for (const group of groups) {
      if (group.results.length === 0) continue;

      group.results.forEach((item, index) => {
        this.articleScorer.scoreArticle(
          item,
          query,
          { basePriority: 5, effectivePriority: group.effectivePriority, categories: [group.sourceName.toLowerCase()] },
          index
        );
        allScoredResults.push(item);
      });
    }

    if (allScoredResults.length === 0) return [];

    // 2. Deterministic cross-source sorting by finalScore DESC
    allScoredResults.sort((a, b) => {
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
    });

    // Development logging of top article-level scoring breakdown
    if (process.env.NODE_ENV === 'development' && query) {
      console.log(`\n[ArticleRanking] Query: "${query}" (Total Candidates: ${allScoredResults.length})`);
      allScoredResults.slice(0, 6).forEach(r => {
        console.log(` - "${r.title}" (${r.source}) -> finalScore=${r.finalScore} (native=${r.nativeSearchScore}, kwScore=${r.keywordMatchScore}, catScore=${r.categoryMatchScore}, srcPrio=${r.effectivePriority})`);
      });
    }

    return allScoredResults.slice(0, targetSize);
  }
}
