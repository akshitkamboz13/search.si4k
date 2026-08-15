import { SearchSourceConfig, ScoringConfig } from '../../shared/types.js';

export interface RankedSource extends SearchSourceConfig {
  effectivePriority: number;
}

export class SourceRanker {
  private scoringConfig: ScoringConfig;

  constructor(scoringConfig: ScoringConfig) {
    this.scoringConfig = scoringConfig;
  }

  /**
   * Calculate effective priority for a source given a query
   */
  public calculateEffectivePriority(source: SearchSourceConfig, query: string): number {
    if (!query || !query.trim()) {
      return source.basePriority;
    }

    const normalizedQuery = query.toLowerCase().trim();
    const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
    let boost = 0;

    // 1. Strong Domain / Source Name Match (+7 by default)
    // E.g. "arch" in "how to make folder in Arch" matching "Arch Wiki" or source.id
    const normalizedName = source.name.toLowerCase();
    const nameTokens = normalizedName.split(/\s+/).filter(t => t !== 'wiki' && t.length > 2);

    for (const nameToken of nameTokens) {
      if (queryTokens.includes(nameToken)) {
        boost += this.scoringConfig.exactDomainMatchScore;
        break;
      }
    }

    // 2. Keyword Phrase & Token Matches
    for (const kw of source.keywords) {
      const normalizedKw = kw.toLowerCase().trim();

      // Multi-word exact phrase match (e.g. "how to")
      if (normalizedKw.includes(' ') && normalizedQuery.includes(normalizedKw)) {
        boost += this.scoringConfig.exactPhraseKeywordScore;
      } else if (!normalizedKw.includes(' ') && queryTokens.includes(normalizedKw)) {
        boost += this.scoringConfig.singleKeywordScore;
      }
    }

    // 3. Category / Intent Heuristics (+3 by default)
    if (source.category === 'guides' || source.category === 'repair') {
      if (normalizedQuery.startsWith('how to') || normalizedQuery.includes('fix') || normalizedQuery.includes('repair')) {
        boost += this.scoringConfig.categoryMatchScore;
      }
    } else if (source.category === 'technical') {
      if (normalizedQuery.includes('arch') || normalizedQuery.includes('linux') || normalizedQuery.includes('pacman') || normalizedQuery.includes('systemd')) {
        boost += this.scoringConfig.categoryMatchScore;
      }
    }

    return source.basePriority + boost;
  }

  /**
   * Rank all enabled sources for a query
   */
  public rankSources(sources: SearchSourceConfig[], query: string): RankedSource[] {
    return sources
      .filter(s => s.enabled)
      .map(s => ({
        ...s,
        effectivePriority: this.calculateEffectivePriority(s, query),
      }))
      .sort((a, b) => b.effectivePriority - a.effectivePriority);
  }
}
