import React from 'react';
import { SearchMode } from '../../shared/types.js';
import { Sun, Moon, Wifi, WifiOff, Settings } from 'lucide-react';
import { Si4kIcon } from './Si4kIcon.js';

interface HeaderProps {
  mode: SearchMode;
  environment?: 'local' | 'internet';
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  onHomeClick: () => void;
  onSettingsClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  mode,
  environment = 'local',
  theme,
  onThemeToggle,
  onHomeClick,
  onSettingsClick,
}) => {
  return (
    <header className="app-header">
      <a href="#" className="brand-title" onClick={(e) => { e.preventDefault(); onHomeClick(); }}>
        <Si4kIcon size={26} className="brand-icon" />
        <span>Si4k Search</span>
        <span className="brand-badge">
          {mode === 'local' ? 'Offline Knowledge' : 'Online Knowledge'}
        </span>
      </a>

      <div className="header-actions">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.35rem 0.75rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            fontSize: '0.8rem',
            fontWeight: 500,
            color: 'var(--text-main)',
          }}
          title={mode === 'local' ? 'Connected via LAN (Offline Mode)' : 'Connected via Public Internet (Online Mode)'}
        >
          {mode === 'local' ? <WifiOff size={14} style={{ color: '#10b981' }} /> : <Wifi size={14} style={{ color: '#3b82f6' }} />}
          <span>{mode === 'local' ? 'LAN / Offline' : 'Online'}</span>
        </div>

        <button
          type="button"
          className="theme-toggle"
          onClick={onSettingsClick}
          title="Search Engine Settings"
          id="settings-btn"
        >
          <Settings size={18} />
        </button>

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
