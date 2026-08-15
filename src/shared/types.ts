export type SearchMode = 'local' | 'online';

export interface SearchSourceConfig {
  id: string;
  zimName: string;
  name: string;
  provider: string;
  lang: string;
  basePriority: number;
  category: string;
  enabled: boolean;
  keywords: string[];
}

export interface ScoringConfig {
  exactDomainMatchScore: number;
  exactPhraseKeywordScore: number;
  singleKeywordScore: number;
  categoryMatchScore: number;
}

export interface SearchResult {
  id: string;
  source: string;        // e.g. "Arch Wiki", "wikiHow", "Wikipedia"
  provider: string;      // e.g. "kiwix"
  type: string;          // e.g. "article"
  title: string;
  description: string;
  url: string;           // Target URL using KIWIX_PUBLIC_URL
  zimName?: string;      // ZIM book identifier
  score?: number;
  sourceId?: string;
  effectivePriority?: number;
}

export interface SearchResponse {
  query: string;
  mode: SearchMode;
  results: SearchResult[];
  sources: Record<string, { count: number; effectivePriority?: number }>;
  pagination: {
    page: number;
    pageSize: number;
    totalResults: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  meta: {
    total: number;
    executionTimeMs: number;
    providers: string[];
  };
}

export interface SearchOptions {
  mode?: SearchMode;
  lang?: string;
  page?: number;
  pageSize?: number;
}
