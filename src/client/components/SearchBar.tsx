import React, { useState, useEffect } from 'react';
import { Search, ArrowRight } from 'lucide-react';

interface SearchBarProps {
  initialQuery?: string;
  onSearch: (query: string) => void;
  autoFocus?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  initialQuery = '',
  onSearch,
  autoFocus = true,
}) => {
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  return (
    <form className="search-form" onSubmit={handleSubmit}>
      <div className="search-input-wrapper">
        <Search className="search-icon" size={22} />
        <input
          type="text"
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search offline knowledge (e.g. fix a wall, Delhi, Python)..."
          autoFocus={autoFocus}
        />
        <button type="submit" className="search-submit-btn">
          <span>Search</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
};
