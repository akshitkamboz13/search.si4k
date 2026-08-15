import React, { useState, useRef, useEffect } from 'react';
import { SearchResponse, SearchResult } from '../../shared/types.js';
import { ResultCard } from './ResultCard.js';
import { Pagination } from './Pagination.js';
import { Loader2 } from 'lucide-react';

interface SearchResultsProps {
  response: SearchResponse;
  allResults: SearchResult[];
  onPageChange: (page: number) => void;
  streamStatus?: string;
}

export const SearchResults: React.FC<SearchResultsProps> = ({
  response,
  allResults,
  onPageChange,
  streamStatus,
}: SearchResultsProps) => {
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [filterPage, setFilterPage] = useState<number>(1);
  const pillsRef = useRef<HTMLDivElement | null>(null);

  // Use allResults if available; fallback to response.results
  const fullCandidateList = (allResults && allResults.length > 0) ? allResults : response.results;

  // Reset filterPage to 1 whenever selectedSource or fullCandidateList length changes
  useEffect(() => {
    setFilterPage(1);
  }, [selectedSource, fullCandidateList.length]);

  // Calculate dynamic counts per source across ALL accumulated results
  const sourceCountsMap: Record<string, number> = {};
  fullCandidateList.forEach((r) => {
    if (r.source) {
      sourceCountsMap[r.source] = (sourceCountsMap[r.source] || 0) + 1;
    }
  });

  // Only display sources that have at least 1 matching result
  const sourcesList = Object.keys(sourceCountsMap).filter((src) => sourceCountsMap[src] > 0);

  // Attach native non-passive wheel event listener for smooth mouse wheel horizontal scrolling
  useEffect(() => {
    const el = pillsRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Filter fullCandidateList across ALL pages when a source pill is selected
  const filteredAllResults = selectedSource
    ? fullCandidateList.filter((r) => r.source.toLowerCase() === selectedSource.toLowerCase())
    : fullCandidateList;

  // Pagination calculation for filtered vs global mode
  const pageSize = 20;
  const isFiltered = selectedSource !== null;

  const activePage = isFiltered ? filterPage : response.pagination.page;
  const totalFilteredResults = isFiltered ? filteredAllResults.length : response.pagination.totalResults;
  const totalPages = isFiltered
    ? (totalFilteredResults > 0 ? Math.ceil(totalFilteredResults / pageSize) : 1)
    : response.pagination.totalPages;

  const hasNextPage = activePage < totalPages;
  const hasPreviousPage = activePage > 1;

  // Slice displayed results for active page
  const startIndex = (activePage - 1) * pageSize;
  const displayedResults = isFiltered
    ? filteredAllResults.slice(startIndex, startIndex + pageSize)
    : response.results;

  const handlePaginationChange = (newPage: number) => {
    if (isFiltered) {
      setFilterPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      onPageChange(newPage);
    }
  };

  const isStreaming = response.meta.isStreaming || (streamStatus && !streamStatus.includes('complete'));

  return (
    <div className="search-results-wrapper">
      <div className="results-meta">
        <div>
          Found <strong>{totalFilteredResults}</strong> result{totalFilteredResults !== 1 ? 's' : ''} in{' '}
          <strong>{(response.meta.executionTimeMs || 0).toLocaleString()}ms</strong> (Page {activePage} of {totalPages})
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

      {sourcesList.length >= 1 && (
        <div className="filter-pills" ref={pillsRef}>
          <button
            type="button"
            className={`filter-pill ${selectedSource === null ? 'active' : ''}`}
            onClick={() => setSelectedSource(null)}
          >
            All Sources ({fullCandidateList.length})
          </button>
          {sourcesList.map((src) => (
            <button
              key={src}
              type="button"
              className={`filter-pill ${selectedSource === src ? 'active' : ''}`}
              onClick={() => setSelectedSource(src)}
            >
              {src} ({sourceCountsMap[src]})
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
            page={activePage}
            totalPages={totalPages}
            hasNextPage={hasNextPage}
            hasPreviousPage={hasPreviousPage}
            onPageChange={handlePaginationChange}
          />
        </>
      )}
    </div>
  );
};
