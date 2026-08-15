import React from 'react';
import { SearchMode } from '../../shared/types.js';
import { Sun, Moon, Cpu } from 'lucide-react';

interface HeaderProps {
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onHomeClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  mode,
  onModeChange,
  theme,
  onThemeToggle,
  onHomeClick,
}) => {
  return (
    <header className="app-header">
      <a href="#" className="brand-title" onClick={(e) => { e.preventDefault(); onHomeClick(); }}>
        <Cpu size={22} className="brand-icon" />
        <span>Si4k Search</span>
        <span className="brand-badge">Offline Engine</span>
      </a>

      <div className="header-actions">
        <div className="mode-selector" title="Search Mode Selector">
          <button
            type="button"
            className={`mode-btn ${mode === 'local' ? 'active' : ''}`}
            onClick={() => onModeChange('local')}
          >
            LAN / Offline
          </button>
          <button
            type="button"
            className={`mode-btn ${mode === 'online' ? 'active' : ''}`}
            onClick={() => onModeChange('online')}
          >
            Online Mode
          </button>
        </div>

        <button
          type="button"
          className="theme-toggle"
          onClick={onThemeToggle}
          title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
        >
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
      </div>
    </header>
  );
};
