import React, { useState } from 'react';
import { SearchResponse, SearchResult } from '../../shared/types.js';
import { ResultCard } from './ResultCard.js';
import { Pagination } from './Pagination.js';

interface SearchResultsProps {
  response: SearchResponse;
  onPageChange: (page: number) => void;
}

export const SearchResults: React.FC<SearchResultsProps> = ({ response, onPageChange }) => {
  const [selectedSource, setSelectedSource] = useState<string | null>(null);

  const sourcesList = Object.keys(response.sources);

  // Filter results if a source filter pill is selected
  const displayedResults = selectedSource
    ? response.results.filter((r) => r.source.toLowerCase() === selectedSource.toLowerCase())
    : response.results;

  const { page, totalPages, hasNextPage, hasPreviousPage, totalResults } = response.pagination;

  return (
    <div className="search-results-wrapper">
      <div className="results-meta">
        <div>
          Found <strong>{totalResults}</strong> result{totalResults !== 1 ? 's' : ''} in{' '}
          <strong>{response.meta.executionTimeMs}ms</strong> (Page {page} of {totalPages})
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
          <div className="state-title">No matching results found</div>
          <div className="state-desc">
            Try adjusting your search terms or verify your offline Kiwix dataset index.
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
