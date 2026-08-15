import { SearchResponse, SearchMode, StreamEventPayload } from '../../shared/types.js';

export async function fetchSearchResults(
  query: string,
  mode: SearchMode = 'local',
  page: number = 1
): Promise<SearchResponse> {
  const url = `/api/search?q=${encodeURIComponent(query)}&mode=${encodeURIComponent(mode)}&page=${page}`;
  const response = await fetch(url);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Search failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * Stream search results progressively using Server-Sent Events (SSE)
 */
export function streamSearchResults(
  query: string,
  mode: SearchMode = 'local',
  page: number = 1,
  onPayload: (payload: StreamEventPayload) => void,
  onError: (err: Error) => void
): () => void {
  const url = `/api/search/stream?q=${encodeURIComponent(query)}&mode=${encodeURIComponent(mode)}&page=${page}`;
  const eventSource = new EventSource(url);

  eventSource.addEventListener('progress', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      onPayload({ event: 'progress', data });
    } catch {
      // Ignore JSON parse errors
    }
  });

  eventSource.addEventListener('results', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      onPayload({ event: 'results', data });
    } catch {
      // Ignore JSON parse errors
    }
  });

  eventSource.addEventListener('complete', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      onPayload({ event: 'complete', data });
    } catch {
      // Ignore JSON parse errors
    }
    eventSource.close();
  });

  eventSource.addEventListener('error', (event: MessageEvent) => {
    try {
      if (event.data) {
        const data = JSON.parse(event.data);
        onError(new Error(data.message || 'Streaming search failed'));
      } else {
        // Normal close on stream end
        eventSource.close();
      }
    } catch {
      eventSource.close();
    }
  });

  return () => {
    eventSource.close();
  };
}
