import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onPageChange: (newPage: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  hasNextPage,
  hasPreviousPage,
  onPageChange,
}) => {
  if (totalPages <= 1) return null;

  // Build page numbers array with ellipses if totalPages > 7
  const getPageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      let start = Math.max(2, page - 1);
      let end = Math.min(totalPages - 1, page + 1);

      if (page <= 3) {
        end = maxVisiblePages - 1;
      } else if (page >= totalPages - 2) {
        start = totalPages - maxVisiblePages + 2;
      }

      if (start > 2) {
        pages.push('...');
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (end < totalPages - 1) {
        pages.push('...');
      }

      pages.push(totalPages);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <nav className="pagination-nav" aria-label="Search results pagination">
      <button
        type="button"
        className="pagination-btn prev-btn"
        disabled={!hasPreviousPage}
        onClick={() => hasPreviousPage && onPageChange(page - 1)}
        aria-label="Previous Page"
      >
        <ChevronLeft size={16} />
        <span>Previous</span>
      </button>

      <div className="pagination-numbers">
        {pageNumbers.map((p, idx) => {
          if (typeof p === 'string') {
            return <span key={`ellipsis-${idx}`} className="pagination-ellipsis">…</span>;
          }
          return (
            <button
              key={p}
              type="button"
              className={`pagination-number ${p === page ? 'active' : ''}`}
              onClick={() => onPageChange(p)}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="pagination-btn next-btn"
        disabled={!hasNextPage}
        onClick={() => hasNextPage && onPageChange(page + 1)}
        aria-label="Next Page"
      >
        <span>Next</span>
        <ChevronRight size={16} />
      </button>
    </nav>
  );
};
