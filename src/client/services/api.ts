import { SearchResponse, SearchMode } from '../../shared/types.js';

export async function fetchSearchResults(query: string, mode: SearchMode = 'local'): Promise<SearchResponse> {
  const url = `/api/search?q=${encodeURIComponent(query)}&mode=${encodeURIComponent(mode)}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Search failed with status ${response.status}`);
  }

  return response.json();
}
