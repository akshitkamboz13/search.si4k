import { SearchResult, SearchSourceConfig } from '../../shared/types.js';
import { ZimIndexer, CategoryIntent } from './ZimIndexer.js';
import { config } from '../config.js';

export interface ArticleScoreBreakdown {
  result: SearchResult;
  query: string;
  sourceName: string;
  basePriority: number;
  effectivePriority: number;
  nativeSearchScore: number;
  keywordMatchScore: number;
  categoryMatchScore: number;
  finalScore: number;
}

export class ArticleScorer {
  private zimIndexer: ZimIndexer;

  constructor() {
    this.zimIndexer = new ZimIndexer();
  }

  /**
   * Score an individual article result in a query-aware cross-ZIM context.
   */
  public scoreArticle(
    result: SearchResult,
    query: string,
    sourceConfig?: SearchSourceConfig | { basePriority: number; effectivePriority?: number; categories?: string[] },
    nativeRankIndex: number = 0
  ): ArticleScoreBreakdown {
    const trimmedQuery = query ? query.toLowerCase().trim() : '';
    const queryTokens = trimmedQuery.split(/\s+/).filter(Boolean);

    // 1. Normalize Xapian Native Search Score within ZIM group (Rank 0 = 100, Rank 1 = 90, etc.)
    const nativeSearchScore = Math.max(10, 100 - (nativeRankIndex * 10));

    // 2. Base & Effective Source Priority
    const basePriority = sourceConfig?.basePriority ?? 5;
    const effectivePriority = (sourceConfig as any)?.effectivePriority ?? (basePriority * (config.search.basePriorityWeight || 1));

    // 3. Query Keyword Match on Article Title & Description
    let keywordMatchScore = 0;
    const titleLower = (result.title || '').toLowerCase();
    const descLower = (result.description || '').toLowerCase();

    if (trimmedQuery && titleLower.includes(trimmedQuery)) {
      keywordMatchScore += 50; // Exact full phrase match in article title
    }

    for (const token of queryTokens) {
      if (token.length > 2) {
        if (titleLower.includes(token)) {
          keywordMatchScore += 25; // Individual token in title
        }
        if (descLower.includes(token)) {
          keywordMatchScore += 10; // Individual token in snippet
        }
      }
    }

    // 4. Category Relevance on Article
    let categoryMatchScore = 0;
    const intents = this.zimIndexer.categorizeQueryIntents(trimmedQuery);
    const sourceCats = (sourceConfig as any)?.categories || [(sourceConfig as any)?.category || 'general'];

    for (const intent of intents) {
      const isSourceInIntentCategory = sourceCats.includes(intent.name);
      
      // Check if title/snippet also matches intent keywords
      let articleMatchesIntentKw = false;
      for (const kw of intent.matchedKeywords) {
        if (titleLower.includes(kw) || descLower.includes(kw)) {
          articleMatchesIntentKw = true;
          break;
        }
      }

      if (isSourceInIntentCategory && articleMatchesIntentKw) {
        categoryMatchScore += 100 * (intent.score / 5); // Strong domain + article match
      } else if (isSourceInIntentCategory) {
        categoryMatchScore += 30; // Domain match only
      } else if (articleMatchesIntentKw) {
        categoryMatchScore += 15; // Loose article match in non-domain ZIM
      }
    }

    // 5. Query-aware Cross-ZIM Final Score Formula
    const finalScore = nativeSearchScore + keywordMatchScore + categoryMatchScore + effectivePriority;

    const breakdown: ArticleScoreBreakdown = {
      result,
      query: trimmedQuery,
      sourceName: result.source,
      basePriority,
      effectivePriority,
      nativeSearchScore,
      keywordMatchScore,
      categoryMatchScore,
      finalScore,
    };

    // Attach debug scores to result object
    result.nativeSearchScore = nativeSearchScore;
    result.keywordMatchScore = keywordMatchScore;
    result.categoryMatchScore = categoryMatchScore;
    result.effectivePriority = effectivePriority;
    result.finalScore = finalScore;
    result.score = finalScore;

    return breakdown;
  }

  /**
   * Rank and score an array of results from a single ZIM group or combined candidates.
   */
  public scoreAndRankResults(
    results: SearchResult[],
    query: string,
    sourceConfig?: SearchSourceConfig | any
  ): SearchResult[] {
    const scoredList = results.map((res, index) => {
      const breakdown = this.scoreArticle(res, query, sourceConfig, index);
      return breakdown.result;
    });

    return scoredList.sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
  }
}
