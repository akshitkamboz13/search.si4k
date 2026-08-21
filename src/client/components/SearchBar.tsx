import React, { useState, useEffect, useRef } from 'react';
import { Search, ArrowRight, AtSign, Hash, X, BookOpen, Layers, Check } from 'lucide-react';
import { ZimInfo } from '../../shared/types.js';
import {
  parseCategoriesFromQuery,
  attachCategoryToQuery,
  removeCategoryFromQuery,
  filterZimsByCategory,
} from '../utils/categoryLogic.js';
import {
  parseZimsFromQuery,
  attachZimToQuery,
  removeZimFromQuery,
} from '../utils/zimLogic.js';

interface SearchBarProps {
  initialQuery?: string;
  onSearch: (query: string, selectedZims: string[], selectedCategories: string[]) => void;
  autoFocus?: boolean;
  availableZims?: ZimInfo[];
  availableCategories?: string[];
  initialSelectedZims?: string[];
  initialSelectedCategories?: string[];
}

export const SearchBar: React.FC<SearchBarProps> = ({
  initialQuery = '',
  onSearch,
  autoFocus = true,
  availableZims = [],
  availableCategories = [],
  initialSelectedZims = [],
  initialSelectedCategories = [],
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [selectedZims, setSelectedZims] = useState<string[]>(initialSelectedZims);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(initialSelectedCategories);

  const [showZimDropdown, setShowZimDropdown] = useState<boolean>(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState<boolean>(false);
  const [zimFilterText, setZimFilterText] = useState<string>('');
  const [categoryFilterText, setCategoryFilterText] = useState<string>('');

  const dropdownRef = useRef<HTMLFormElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Sync initial query and selected tags
  useEffect(() => {
    const { cleanQuery, categories } = parseCategoriesFromQuery(initialQuery);
    const { cleanQuery: pureQuery, zims } = parseZimsFromQuery(cleanQuery);

    setQuery(pureQuery);

    const mergedZims = Array.from(new Set([...initialSelectedZims, ...zims]));
    const mergedCats = Array.from(new Set([...initialSelectedCategories, ...categories]));

    setSelectedZims(mergedZims);
    setSelectedCategories(mergedCats);
  }, [initialQuery, initialSelectedZims, initialSelectedCategories]);

  // Handle outside click to dismiss popovers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowZimDropdown(false);
        setShowCategoryDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;

    // Check for inline trigger characters
    if (val.endsWith('@')) {
      setShowZimDropdown(true);
      setShowCategoryDropdown(false);
    } else if (val.endsWith('#')) {
      setShowCategoryDropdown(true);
      setShowZimDropdown(false);
    }

    setQuery(val);
  };

  const handleSelectZim = (zimNameOrId: string) => {
    const norm = zimNameOrId.trim();
    if (!norm) return;

    setSelectedZims((prev) => {
      if (prev.includes(norm)) {
        return prev.filter((z) => z !== norm);
      } else {
        return [...prev, norm];
      }
    });

    // If query ends with '@' or '@filter', strip trigger text
    const cleanQ = query.replace(/@[a-zA-Z0-9_\-\.]*$/, '').trim();
    setQuery(cleanQ);
  };

  const handleRemoveZim = (zimToRemove: string) => {
    setSelectedZims((prev) => prev.filter((z) => z.toLowerCase() !== zimToRemove.toLowerCase()));
  };

  const handleSelectCategory = (catName: string) => {
    const norm = catName.trim().toLowerCase();
    if (!norm) return;

    setSelectedCategories((prev) => {
      if (prev.includes(norm)) {
        return prev.filter((c) => c !== norm);
      } else {
        return [...prev, norm];
      }
    });

    // Strip inline '#' trigger text
    const cleanQ = query.replace(/#[a-zA-Z0-9_\-]*$/, '').trim();
    setQuery(cleanQ);
  };

  const handleRemoveCategory = (catToRemove: string) => {
    setSelectedCategories((prev) => prev.filter((c) => c.toLowerCase() !== catToRemove.toLowerCase()));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowZimDropdown(false);
    setShowCategoryDropdown(false);

    // Parse inline @zim and #category if user typed them directly into query box
    const { cleanQuery: qWithoutCats, categories: parsedCats } = parseCategoriesFromQuery(query);
    const { cleanQuery: finalQuery, zims: parsedZims } = parseZimsFromQuery(qWithoutCats);

    const mergedZims = Array.from(new Set([...selectedZims, ...parsedZims]));
    const mergedCats = Array.from(new Set([...selectedCategories, ...parsedCats]));

    setSelectedZims(mergedZims);
    setSelectedCategories(mergedCats);
    setQuery(finalQuery);

    onSearch(finalQuery, mergedZims, mergedCats);
  };

  // Helper to format ZIM display title
  const getZimDisplayName = (zimIdentifier: string): string => {
    const found = availableZims.find(
      (z) => z.zimName === zimIdentifier || z.id === zimIdentifier || z.name === zimIdentifier
    );
    if (found) return found.title || found.name || found.zimName;
    return zimIdentifier;
  };

  const filteredZims = availableZims.filter((z) => {
    if (!zimFilterText) return true;
    const term = zimFilterText.toLowerCase();
    return (
      z.name.toLowerCase().includes(term) ||
      z.zimName.toLowerCase().includes(term) ||
      (z.description && z.description.toLowerCase().includes(term)) ||
      (z.category && z.category.toLowerCase().includes(term))
    );
  });

  const filteredCategories = availableCategories.filter((c) => {
    if (!categoryFilterText) return true;
    return c.toLowerCase().includes(categoryFilterText.toLowerCase());
  });

  return (
    <form className="search-form" onSubmit={handleSubmit} ref={dropdownRef}>
      {/* Selected Chips Area (Rendered on top of input) */}
      {(selectedZims.length > 0 || selectedCategories.length > 0) && (
        <div className="selected-chips-bar">
          <span className="chips-bar-label">Active Filters:</span>
          {selectedZims.map((zim) => (
            <div className="chip-badge zim-chip" key={`chip-zim-${zim}`} title={`Filtered ZIM: ${zim}`}>
              <AtSign size={13} className="chip-icon" />
              <span className="chip-text">{getZimDisplayName(zim)}</span>
              <button
                type="button"
                className="chip-remove-btn"
                onClick={() => handleRemoveZim(zim)}
                aria-label={`Remove ZIM ${zim}`}
              >
                <X size={12} />
              </button>
            </div>
          ))}

          {selectedCategories.map((cat) => (
            <div className="chip-badge category-chip" key={`chip-cat-${cat}`} title={`Category filter: ${cat}`}>
              <Hash size={13} className="chip-icon" />
              <span className="chip-text">{cat}</span>
              <button
                type="button"
                className="chip-remove-btn"
                onClick={() => handleRemoveCategory(cat)}
                aria-label={`Remove Category ${cat}`}
              >
                <X size={12} />
              </button>
            </div>
          ))}

          <button
            type="button"
            className="clear-all-chips-btn"
            onClick={() => {
              setSelectedZims([]);
              setSelectedCategories([]);
              onSearch(query, [], []);
            }}
          >
            Clear all
          </button>
        </div>
      )}

      <div className="search-input-wrapper">
        <Search className="search-icon" size={22} />

        <input
          ref={inputRef}
          type="text"
          className="search-input"
          value={query}
          onChange={handleInputChange}
          placeholder="Search offline knowledge... (Type @ to pick ZIM file, # for category)"
          autoFocus={autoFocus}
        />

        {/* Quick Action Triggers (@ for ZIMs, # for Category) */}
        <div className="search-action-buttons">
          <button
            type="button"
            className={`quick-trigger-btn ${showZimDropdown || selectedZims.length > 0 ? 'active' : ''}`}
            onClick={() => {
              setShowZimDropdown((prev) => !prev);
              setShowCategoryDropdown(false);
            }}
            title="Click @ to select ZIM files"
          >
            <AtSign size={15} />
            <span className="trigger-label">ZIMs</span>
            {selectedZims.length > 0 && <span className="trigger-badge">{selectedZims.length}</span>}
          </button>

          <button
            type="button"
            className={`quick-trigger-btn ${showCategoryDropdown || selectedCategories.length > 0 ? 'active' : ''}`}
            onClick={() => {
              setShowCategoryDropdown((prev) => !prev);
              setShowZimDropdown(false);
            }}
            title="Click # to attach categories (handled via categoryLogic.ts)"
          >
            <Hash size={15} />
            <span className="trigger-label">Category</span>
            {selectedCategories.length > 0 && <span className="trigger-badge">{selectedCategories.length}</span>}
          </button>

          <button type="submit" className="search-submit-btn">
            <span>Search</span>
            <ArrowRight size={16} />
          </button>
        </div>

        {/* Popover Dropdown for @ ZIM Selector */}
        {showZimDropdown && (
          <div className="tag-popover-dropdown zim-popover">
            <div className="popover-header">
              <div className="popover-title">
                <BookOpen size={15} style={{ color: 'var(--brand-color)' }} />
                <span>Select ZIM Knowledge Base</span>
              </div>
              <button type="button" className="popover-close-btn" onClick={() => setShowZimDropdown(false)}>
                <X size={14} />
              </button>
            </div>

            <div className="popover-search">
              <input
                type="text"
                className="popover-search-input"
                placeholder="Filter ZIMs by name or topic..."
                value={zimFilterText}
                onChange={(e) => setZimFilterText(e.target.value)}
                autoFocus
              />
            </div>

            <div className="popover-list">
              {filteredZims.length === 0 ? (
                <div className="popover-empty">No matching ZIM files found.</div>
              ) : (
                filteredZims.map((zim) => {
                  const isSelected = selectedZims.includes(zim.zimName) || selectedZims.includes(zim.id);
                  return (
                    <div
                      key={zim.id || zim.zimName}
                      className={`popover-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectZim(zim.zimName)}
                    >
                      <div className="popover-item-check">
                        <AtSign size={14} className="item-at-icon" />
                        {isSelected && <Check size={14} className="item-check-icon" />}
                      </div>
                      <div className="popover-item-content">
                        <div className="popover-item-title">
                          {zim.title || zim.name}
                          {zim.category && <span className="popover-item-tag">{zim.category}</span>}
                        </div>
                        <div className="popover-item-subtitle">{zim.description || zim.zimName}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Popover Dropdown for # Category Selector (Logic in categoryLogic.ts) */}
        {showCategoryDropdown && (
          <div className="tag-popover-dropdown category-popover">
            <div className="popover-header">
              <div className="popover-title">
                <Layers size={15} style={{ color: 'var(--brand-color)' }} />
                <span>Attach Category (#)</span>
              </div>
              <button type="button" className="popover-close-btn" onClick={() => setShowCategoryDropdown(false)}>
                <X size={14} />
              </button>
            </div>

            <div className="popover-search">
              <input
                type="text"
                className="popover-search-input"
                placeholder="Filter categories..."
                value={categoryFilterText}
                onChange={(e) => setCategoryFilterText(e.target.value)}
                autoFocus
              />
            </div>

            <div className="popover-list">
              {filteredCategories.length === 0 ? (
                <div className="popover-empty">No matching categories found.</div>
              ) : (
                filteredCategories.map((cat) => {
                  const isSelected = selectedCategories.includes(cat.toLowerCase());
                  return (
                    <div
                      key={`cat-opt-${cat}`}
                      className={`popover-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectCategory(cat)}
                    >
                      <div className="popover-item-check">
                        <Hash size={14} className="item-at-icon" />
                        {isSelected && <Check size={14} className="item-check-icon" />}
                      </div>
                      <div className="popover-item-content">
                        <div className="popover-item-title">#{cat}</div>
                        <div className="popover-item-subtitle">Attach category filter #{cat}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </form>
  );
};
