import { SearchResult, SearchOptions, SearchSourceConfig, SearchMode } from '../../shared/types.js';

export interface SearchProvider {
  name: string;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  searchZimSource?(source: SearchSourceConfig, query: string, mode?: SearchMode): Promise<SearchResult[]>;
}
