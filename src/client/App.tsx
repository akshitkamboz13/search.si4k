import React, { useState, useEffect } from 'react';
import { SearchResponse, SearchMode } from '../shared/types.js';
import { Header } from './components/Header.js';
import { SearchBar } from './components/SearchBar.js';
import { SearchResults } from './components/SearchResults.js';
import { LoadingState } from './components/LoadingState.js';
import { ErrorState } from './components/ErrorState.js';
import { fetchSearchResults } from './services/api.js';
import { BookOpen, MapPin, Database, Sparkles } from 'lucide-react';

export const App: React.FC = () => {
  const [query, setQuery] = useState<string>('');
  const [mode, setMode] = useState<SearchMode>('local');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<SearchResponse | null>(null);

  // Synchronize theme with DOM data-theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Read URL query param on initial load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialQ = params.get('q');
    const initialMode = params.get('mode') as SearchMode;

    if (initialMode === 'online' || initialMode === 'local') {
      setMode(initialMode);
    }

    if (initialQ) {
      setQuery(initialQ);
      executeSearch(initialQ, initialMode || 'local');
    }
  }, []);

  const executeSearch = async (searchQuery: string, searchMode: SearchMode = mode) => {
    setLoading(true);
    setError(null);

    // Update URL history state without reloading
    const newUrl = `${window.location.pathname}?q=${encodeURIComponent(searchQuery)}&mode=${encodeURIComponent(searchMode)}`;
    window.history.pushState({ path: newUrl }, '', newUrl);

    try {
      const data = await fetchSearchResults(searchQuery, searchMode);
      setResponse(data);
    } catch (err) {
      console.error('Search request failed:', err);
      setError(err instanceof Error ? err.message : 'Unable to connect to Si4k Search API');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (newQuery: string) => {
    setQuery(newQuery);
    executeSearch(newQuery, mode);
  };

  const handleModeChange = (newMode: SearchMode) => {
    setMode(newMode);
    if (query) {
      executeSearch(query, newMode);
    }
  };

  const handleThemeToggle = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleHomeClick = () => {
    setQuery('');
    setResponse(null);
    setError(null);
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

        {loading && <LoadingState />}

        {!loading && error && (
          <ErrorState message={error} onRetry={() => executeSearch(query, mode)} />
        )}

        {!loading && !error && response && (
          <SearchResults response={response} />
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
