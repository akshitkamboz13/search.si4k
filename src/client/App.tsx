import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SearchResponse, SearchResult, SearchMode, StreamEventPayload } from '../shared/types.js';
import { Header } from './components/Header.js';
import { SearchBar } from './components/SearchBar.js';
import { SearchResults } from './components/SearchResults.js';
import { LoadingState } from './components/LoadingState.js';
import { ErrorState } from './components/ErrorState.js';
import { streamSearchResults, fetchEnvironment } from './services/api.js';
import { BookOpen, MapPin, Database } from 'lucide-react';
import { Si4kIcon } from './components/Si4kIcon.js';
import { ConfigPage } from './components/ConfigPage.js';

export const App: React.FC = () => {
  const [query, setQuery] = useState<string>('');
  const [mode, setMode] = useState<SearchMode>('local');
  const [environment, setEnvironment] = useState<'local' | 'internet'>('local');
  const [page, setPage] = useState<number>(1);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [streamStatus, setStreamStatus] = useState<string>('');
  const [completedSources, setCompletedSources] = useState<number>(0);
  const [totalSourcesCount, setTotalSourcesCount] = useState<number>(32);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  const cancelStreamRef = useRef<(() => void) | null>(null);
  const accumulatedResultsRef = useRef<SearchResult[]>([]);
  const seenResultIdsRef = useRef<Set<string>>(new Set());
  const sourcesMetadataRef = useRef<Record<string, { count: number; effectivePriority?: number }>>({});
  const executionTimeMsRef = useRef<number>(0);
  const isEnvInitializedRef = useRef<boolean>(false);

  // Synchronize theme with DOM data-theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const updateResponseState = useCallback((currentPage: number, searchMode: SearchMode, statusText?: string, isStreaming: boolean = true) => {
    const accumulated = accumulatedResultsRef.current;
    const pageSize = 20;
    const totalResults = accumulated.length;
    const totalPages = totalResults > 0 ? Math.ceil(totalResults / pageSize) : 1;

    let validPage = Math.floor(currentPage);
    if (isNaN(validPage) || validPage < 1) validPage = 1;
    if (validPage > totalPages) validPage = totalPages;

    const startIndex = (validPage - 1) * pageSize;
    const pageResults = accumulated.slice(startIndex, startIndex + pageSize);

    setResponse({
      query: query || '',
      mode: searchMode,
      results: pageResults,
      sources: { ...sourcesMetadataRef.current },
      pagination: {
        page: validPage,
        pageSize,
        totalResults,
        totalPages,
        hasNextPage: validPage < totalPages,
        hasPreviousPage: validPage > 1,
      },
      meta: {
        mode: searchMode,
        total: totalResults,
        executionTimeMs: executionTimeMsRef.current,
        providers: ['kiwix'],
        isStreaming,
        statusText,
      },
    });
  }, [query]);

  const executeSearch = useCallback(
    (searchQuery: string, searchMode: SearchMode = mode, searchPage: number = page) => {
      // 1. Cancel previous stream if active
      if (cancelStreamRef.current) {
        cancelStreamRef.current();
        cancelStreamRef.current = null;
      }

      // 2. Completely reset state for fresh deterministic search
      accumulatedResultsRef.current = [];
      seenResultIdsRef.current.clear();
      sourcesMetadataRef.current = {};
      executionTimeMsRef.current = 0;

      setLoading(true);
      setError(null);
      setResponse(null);
      setStreamStatus('Initiating search...');
      setCompletedSources(0);
      setTotalSourcesCount(32);

      const params = new URLSearchParams();
      params.set('q', searchQuery);
      if (searchPage > 1) {
        params.set('page', String(searchPage));
      }
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.pushState({ q: searchQuery, mode: searchMode, page: searchPage }, '', newUrl);

      cancelStreamRef.current = streamSearchResults(
        searchQuery,
        searchMode,
        searchPage,
        (payload: StreamEventPayload) => {
          if (payload.event === 'progress') {
            if (payload.data.statusText) {
              setStreamStatus(payload.data.statusText);
            }
            if (typeof payload.data.completedSources === 'number') {
              setCompletedSources(payload.data.completedSources);
            }
            if (typeof payload.data.totalSourcesCount === 'number') {
              setTotalSourcesCount(payload.data.totalSourcesCount);
            }
          } else if (payload.event === 'results' || payload.event === 'complete') {
            setLoading(false);

            if (payload.data.sources) {
              sourcesMetadataRef.current = { ...sourcesMetadataRef.current, ...payload.data.sources };
            }

            if (payload.data.meta && typeof payload.data.meta.executionTimeMs === 'number') {
              executionTimeMsRef.current = payload.data.meta.executionTimeMs;
            }

            if (payload.data.results && payload.data.results.length > 0) {
              const incoming = payload.data.results;
              const seen = seenResultIdsRef.current;
              const accumulated = accumulatedResultsRef.current;

              for (const item of incoming) {
                const dedupeKey = item.id || `${item.source}:${item.title}`;
                if (!seen.has(dedupeKey)) {
                  seen.add(dedupeKey);
                  accumulated.push(item);
                }
              }
            }

            const currentStatus = payload.event === 'complete' ? 'Search complete' : (payload.data.meta?.statusText || 'Searching sources...');
            setStreamStatus(currentStatus);
            updateResponseState(searchPage, searchMode, currentStatus, payload.event !== 'complete');
          }
        },
        (err: Error) => {
          console.error('Streaming search error:', err);
          setError(err.message || 'Unable to connect to Si4k Search API');
          setLoading(false);
        }
      );
    },
    [mode, page, updateResponseState]
  );

  // Initialize Environment first, then execute search cleanly from URL
  useEffect(() => {
    fetchEnvironment()
      .then((envRes) => {
        let activeMode: SearchMode = 'local';
        if (envRes && envRes.mode) {
          activeMode = envRes.mode;
          setMode(envRes.mode);
          setEnvironment(envRes.environment || 'local');
        }
        isEnvInitializedRef.current = true;

        const params = new URLSearchParams(window.location.search);
        const initialQ = params.get('q') || '';
        const initialPage = parseInt(params.get('page') || '1', 10);
        const validPage = isNaN(initialPage) || initialPage < 1 ? 1 : initialPage;
        setPage(validPage);

        if (initialQ) {
          setQuery(initialQ);
          executeSearch(initialQ, activeMode, validPage);
        }
      })
      .catch((err) => {
        console.warn('Environment detection error:', err);
        isEnvInitializedRef.current = true;
      });

    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const initialQ = params.get('q') || '';
      const initialPage = parseInt(params.get('page') || '1', 10);
      const validPage = isNaN(initialPage) || initialPage < 1 ? 1 : initialPage;
      setPage(validPage);

      if (initialQ) {
        setQuery(initialQ);
        executeSearch(initialQ, mode, validPage);
      } else {
        setQuery('');
        setResponse(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (cancelStreamRef.current) {
        cancelStreamRef.current();
      }
    };
  }, []);

  const handleSearchSubmit = (newQuery: string) => {
    setQuery(newQuery);
    setPage(1);
    executeSearch(newQuery, mode, 1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    if (query) {
      const params = new URLSearchParams(window.location.search);
      params.set('q', query);
      if (newPage > 1) {
        params.set('page', String(newPage));
      } else {
        params.delete('page');
      }
      window.history.pushState({ q: query, mode, page: newPage }, '', `${window.location.pathname}?${params.toString()}`);
      updateResponseState(newPage, mode, streamStatus, Boolean(response?.meta?.isStreaming));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleThemeToggle = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleSettingsClick = () => setShowSettings(true);
  const handleSettingsClose = () => setShowSettings(false);

  const handleHomeClick = () => {
    if (cancelStreamRef.current) {
      cancelStreamRef.current();
      cancelStreamRef.current = null;
    }
    accumulatedResultsRef.current = [];
    seenResultIdsRef.current.clear();
    sourcesMetadataRef.current = {};
    executionTimeMsRef.current = 0;
    setQuery('');
    setPage(1);
    setResponse(null);
    setError(null);
    setStreamStatus('');
    window.history.pushState({}, '', window.location.pathname);
  };

  const hasSearched = Boolean(query || response || loading || error);

  return (
    <div className="app-container">
      {showSettings && <ConfigPage onClose={handleSettingsClose} />}
      <Header
        mode={mode}
        environment={environment}
        theme={theme}
        onThemeToggle={handleThemeToggle}
        onHomeClick={handleHomeClick}
        onSettingsClick={handleSettingsClick}
      />

      <main className={`main-content ${!hasSearched ? 'centered' : ''}`}>
        {!hasSearched && (
          <div className="hero-section">
            <div style={{ display: 'inline-flex', marginBottom: '1rem', padding: '0.5rem', borderRadius: '16px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-md)' }}>
              <Si4kIcon size={64} />
            </div>
            <h1 className="hero-title">
              Offline <span>Knowledge</span> Engine
            </h1>
            <p className="hero-subtitle">
              Instant unified search across Wikipedia, wikiHow, iFixit & local ZIM collections.
            </p>
          </div>
        )}

        <SearchBar
          initialQuery={query}
          onSearch={handleSearchSubmit}
          autoFocus={true}
        />

        {loading && !response && (
          <LoadingState
            statusText={streamStatus}
            completedSources={completedSources}
            totalSourcesCount={totalSourcesCount}
            query={query}
          />
        )}

        {!loading && error && (
          <ErrorState message={error} onRetry={() => executeSearch(query, mode, page)} />
        )}

        {response && (
          <SearchResults
            response={response}
            allResults={accumulatedResultsRef.current}
            onPageChange={handlePageChange}
            streamStatus={streamStatus}
          />
        )}

        {!hasSearched && (
          <div style={{ marginTop: '3rem', width: '100%', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)' }}>
              <BookOpen size={20} style={{ color: 'var(--brand-color)', marginBottom: '0.5rem' }} />
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>ZIM Knowledge Base</div>
              <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>wikiHow, Wikipedia, iFixit, and technical guides.</div>
            </div>
            <div style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)' }}>
              <MapPin size={20} style={{ color: 'var(--brand-color)', marginBottom: '0.5rem' }} />
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Extensible Providers</div>
              <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>Ready for OpenStreetMap, Books & PDF documents.</div>
            </div>
            <div style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)' }}>
              <Database size={20} style={{ color: 'var(--brand-color)', marginBottom: '0.5rem' }} />
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>LAN & Offline First</div>
              <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>Operates completely locally without external internet.</div>
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <div>Si4k Search Engine • Unified Offline Knowledge Architecture</div>
      </footer>
    </div>
  );
};
