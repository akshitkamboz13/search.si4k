import { SearchResult, SearchOptions } from '../../shared/types.js';

export interface SearchProvider {
  name: string;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}
