import { SearchResponse, SearchMode, StreamEventPayload } from '../../shared/types.js';

export interface EnvironmentResponse {
  environment: 'local' | 'internet';
  mode: SearchMode;
  publicUrl: string;
  clientIp?: string;
  isDevOverride?: boolean;
}

export async function fetchEnvironment(): Promise<EnvironmentResponse> {
  const response = await fetch('/api/environment');
  if (!response.ok) {
    return { environment: 'local', mode: 'local', publicUrl: '' };
  }
  return response.json();
}

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

// ─── Config API ───────────────────────────────────────────────────────────────

export interface ConfigEntry {
  key: string;
  value: string;
  label: string;
  group: string;
  description: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  options?: string[];
  lanOnly?: boolean;
}

export interface ConfigResponse {
  isLan: boolean;
  environment: 'local' | 'internet';
  clientIp: string;
  fields: ConfigEntry[];
}

export async function fetchConfig(): Promise<ConfigResponse> {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error(`Failed to fetch config: ${res.status}`);
  return res.json();
}

export interface SaveConfigResult {
  success: boolean;
  updated: string[];
  rejected?: string[];
  message: string;
}

export async function saveConfig(updates: Record<string, string>): Promise<SaveConfigResult> {
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Save failed: ${res.status}`);
  return data;
}
