import React, { useState } from 'react';
import { SearchResponse, SearchResult } from '../../shared/types.js';
import { ResultCard } from './ResultCard.js';
import { Pagination } from './Pagination.js';
import { Loader2 } from 'lucide-react';

interface SearchResultsProps {
  response: SearchResponse;
  onPageChange: (page: number) => void;
  streamStatus?: string;
}

export const SearchResults: React.FC<SearchResultsProps> = ({
  response,
  onPageChange,
  streamStatus,
}) => {
  const [selectedSource, setSelectedSource] = useState<string | null>(null);

  const sourcesList = Object.keys(response.sources);

  // Filter results if a source filter pill is selected
  const displayedResults = selectedSource
    ? response.results.filter((r) => r.source.toLowerCase() === selectedSource.toLowerCase())
    : response.results;

  const { page, totalPages, hasNextPage, hasPreviousPage, totalResults } = response.pagination;
  const isStreaming = response.meta.isStreaming || (streamStatus && !streamStatus.includes('complete'));

  return (
    <div className="search-results-wrapper">
      <div className="results-meta">
        <div>
          Found <strong>{totalResults}</strong> result{totalResults !== 1 ? 's' : ''} in{' '}
          <strong>{response.meta.executionTimeMs}ms</strong> (Page {page} of {totalPages})
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {isStreaming && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--brand-color)', fontSize: '0.85rem', fontWeight: 600 }}>
              <Loader2 size={14} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
              <span>{streamStatus || 'Searching sources...'}</span>
            </div>
          )}
          {!isStreaming && streamStatus && (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{streamStatus}</span>
          )}
          <div>Mode: <strong style={{ textTransform: 'capitalize' }}>{response.mode}</strong></div>
        </div>
      </div>

      {sourcesList.length > 1 && (
        <div className="filter-pills">
          <button
            type="button"
            className={`filter-pill ${selectedSource === null ? 'active' : ''}`}
            onClick={() => setSelectedSource(null)}
          >
            All Sources ({totalResults})
          </button>
          {sourcesList.map((src) => (
            <button
              key={src}
              type="button"
              className={`filter-pill ${selectedSource === src ? 'active' : ''}`}
              onClick={() => setSelectedSource(src)}
            >
              {src} ({response.sources[src].count})
            </button>
          ))}
        </div>
      )}

      {displayedResults.length === 0 ? (
        <div className="state-box">
          <div className="state-title">
            {isStreaming ? 'Searching knowledge sources...' : 'No matching results found'}
          </div>
          <div className="state-desc">
            {isStreaming
              ? 'Results will appear here as soon as the first knowledge source finishes.'
              : 'Try adjusting your search terms or verify your offline Kiwix dataset index.'}
          </div>
        </div>
      ) : (
        <>
          <div className="results-list">
            {displayedResults.map((result: SearchResult) => (
              <ResultCard key={result.id} result={result} />
            ))}
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            hasNextPage={hasNextPage}
            hasPreviousPage={hasPreviousPage}
            onPageChange={onPageChange}
          />
        </>
      )}
    </div>
  );
};
