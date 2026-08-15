import React, { useState } from 'react';
import { SearchResponse, SearchResult } from '../../shared/types.js';
import { ResultCard } from './ResultCard.js';

interface SearchResultsProps {
  response: SearchResponse;
}

export const SearchResults: React.FC<SearchResultsProps> = ({ response }) => {
  const [selectedSource, setSelectedSource] = useState<string | null>(null);

  const sourcesList = Object.keys(response.sources);

  // Filter results if a source filter pill is selected, preserving provider ordering
  const displayedResults = selectedSource
    ? response.results.filter((r) => r.source.toLowerCase() === selectedSource.toLowerCase())
    : response.results;

  return (
    <div className="search-results-wrapper">
      <div className="results-meta">
        <div>
          Found <strong>{response.meta.total}</strong> result{response.meta.total !== 1 ? 's' : ''} in{' '}
          <strong>{response.meta.executionTimeMs}ms</strong>
        </div>
        <div>Mode: <strong style={{ textTransform: 'capitalize' }}>{response.mode}</strong></div>
      </div>

      {sourcesList.length > 1 && (
        <div className="filter-pills">
          <button
            type="button"
            className={`filter-pill ${selectedSource === null ? 'active' : ''}`}
            onClick={() => setSelectedSource(null)}
          >
            All Sources ({response.meta.total})
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
          <div className="state-title">No matching results found</div>
          <div className="state-desc">
            Try adjusting your search terms or verify your offline Kiwix dataset index.
          </div>
        </div>
      ) : (
        <div className="results-list">
          {displayedResults.map((result: SearchResult) => (
            <ResultCard key={result.id} result={result} />
          ))}
        </div>
      )}
    </div>
  );
};
