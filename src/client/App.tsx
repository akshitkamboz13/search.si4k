import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SearchResponse, SearchMode, StreamEventPayload } from '../shared/types.js';
import { Header } from './components/Header.js';
import { SearchBar } from './components/SearchBar.js';
import { SearchResults } from './components/SearchResults.js';
import { LoadingState } from './components/LoadingState.js';
import { ErrorState } from './components/ErrorState.js';
import { streamSearchResults } from './services/api.js';
import { BookOpen, MapPin, Database } from 'lucide-react';

export const App: React.FC = () => {
  const [query, setQuery] = useState<string>('');
  const [mode, setMode] = useState<SearchMode>('local');
  const [page, setPage] = useState<number>(1);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [streamStatus, setStreamStatus] = useState<string>('');

  const cancelStreamRef = useRef<(() => void) | null>(null);

  // Synchronize theme with DOM data-theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const executeSearch = useCallback(
    (searchQuery: string, searchMode: SearchMode = mode, searchPage: number = page) => {
      // Cancel any ongoing stream
      if (cancelStreamRef.current) {
        cancelStreamRef.current();
        cancelStreamRef.current = null;
      }

      setLoading(true);
      setError(null);
      setStreamStatus('Initiating search...');

      // Build updated URL preserving q, mode, page
      const params = new URLSearchParams();
      params.set('q', searchQuery);
      params.set('mode', searchMode);
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
          } else if (payload.event === 'results') {
            setLoading(false);
            if (payload.data.results) {
              setResponse(payload.data as SearchResponse);
            }
            if (payload.data.meta?.statusText) {
              setStreamStatus(payload.data.meta.statusText);
            }
          } else if (payload.event === 'complete') {
            setLoading(false);
            if (payload.data.results) {
              setResponse(payload.data as SearchResponse);
            }
            setStreamStatus('Search complete');
          }
        },
        (err: Error) => {
          console.error('Streaming search error:', err);
          setError(err.message || 'Unable to connect to Si4k Search API');
          setLoading(false);
        }
      );
    },
    [mode, page]
  );

  // Initial URL parsing & Browser Back/Forward (popstate) support
  useEffect(() => {
    const handleUrlState = () => {
      const params = new URLSearchParams(window.location.search);
      const initialQ = params.get('q') || '';
      const initialMode = (params.get('mode') as SearchMode) || 'local';
      const initialPage = parseInt(params.get('page') || '1', 10);

      setMode(initialMode);
      const validPage = isNaN(initialPage) || initialPage < 1 ? 1 : initialPage;
      setPage(validPage);

      if (initialQ) {
        setQuery(initialQ);
        executeSearch(initialQ, initialMode, validPage);
      } else {
        setQuery('');
        setResponse(null);
      }
    };

    handleUrlState();

    window.addEventListener('popstate', handleUrlState);
    return () => {
      window.removeEventListener('popstate', handleUrlState);
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
      executeSearch(query, mode, newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleModeChange = (newMode: SearchMode) => {
    setMode(newMode);
    setPage(1);
    if (query) {
      executeSearch(query, newMode, 1);
    }
  };

  const handleThemeToggle = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleHomeClick = () => {
    if (cancelStreamRef.current) {
      cancelStreamRef.current();
      cancelStreamRef.current = null;
    }
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
      <Header
        mode={mode}
        onModeChange={handleModeChange}
        theme={theme}
        onThemeToggle={handleThemeToggle}
        onHomeClick={handleHomeClick}
      />

      <main className={`main-content ${!hasSearched ? 'centered' : ''}`}>
        {!hasSearched && (
          <div className="hero-section">
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

        {loading && !response && <LoadingState />}

        {!loading && error && (
          <ErrorState message={error} onRetry={() => executeSearch(query, mode, page)} />
        )}

        {response && (
          <SearchResults
            response={response}
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
