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
  url: string;           // Target URL using KIWIX_LOCAL_PUBLIC_URL or KIWIX_ONLINE_PUBLIC_URL
  zimName?: string;      // ZIM book identifier
  score?: number;
  sourceId?: string;
  effectivePriority?: number;
  nativeSearchScore?: number;
  keywordMatchScore?: number;
  categoryMatchScore?: number;
  finalScore?: number;
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
    mode: SearchMode;
    total: number;
    executionTimeMs: number;
    providers: string[];
    isStreaming?: boolean;
    pendingSources?: number;
    completedSources?: number;
    totalSourcesCount?: number;
    statusText?: string;
  };
}

export interface SearchOptions {
  mode?: SearchMode;
  lang?: string;
  page?: number;
  pageSize?: number;
  maxConcurrency?: number;
}

export interface StreamEventPayload {
  event: 'progress' | 'results' | 'complete' | 'error';
  data: Partial<SearchResponse> & {
    pendingSources?: number;
    completedSources?: number;
    totalSourcesCount?: number;
    statusText?: string;
    message?: string;
  };
}
