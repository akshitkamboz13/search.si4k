import React from 'react';
import { Compass, Sparkles, Database } from 'lucide-react';

interface LoadingStateProps {
  statusText?: string;
  completedSources?: number;
  totalSourcesCount?: number;
  query?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  statusText,
  completedSources = 0,
  totalSourcesCount = 32,
  query,
}) => {
  const percent = totalSourcesCount > 0 ? Math.min(100, Math.round((completedSources / totalSourcesCount) * 100)) : 0;

  return (
    <div className="search-exploration-widget">
      {/* Live Exploration Banner */}
      <div className="exploration-banner">
        <div className="exploration-header">
          <div className="exploration-icon-wrapper">
            <Compass size={22} className="exploration-compass-icon" />
          </div>
          <div className="exploration-title-group">
            <div className="exploration-main-title">
              <Sparkles size={14} className="sparkle-icon" />
              <span>Exploring Knowledge Bases...</span>
            </div>
            <div className="exploration-status-text">
              {statusText || `Searching ZIM collections for "${query || 'query'}"`}
            </div>
          </div>
        </div>

        {/* Live Progress Bar */}
        <div className="exploration-progress-bar-track">
          <div
            className="exploration-progress-bar-fill"
            style={{ width: `${Math.max(12, percent)}%` }}
          />
        </div>

        <div className="exploration-meta-row">
          <span className="meta-sources-count">
            <Database size={13} />
            <span>{completedSources > 0 ? `${completedSources} / ${totalSourcesCount} sources searched` : `Dispatching to ${totalSourcesCount} ZIM sources...`}</span>
          </span>
          <span className="meta-percent">{percent}%</span>
        </div>
      </div>

      {/* Shimmer Result Card Skeletons */}
      <div className="skeleton-container">
        {[1, 2, 3].map((n) => (
          <div key={n} className="skeleton-card">
            <div className="skeleton-bar" style={{ width: '22%', height: '14px', marginBottom: '8px' }} />
            <div className="skeleton-bar" style={{ width: '65%', height: '22px', marginBottom: '10px' }} />
            <div className="skeleton-bar" style={{ width: '38%', height: '14px', marginBottom: '10px' }} />
            <div className="skeleton-bar" style={{ width: '92%', height: '15px' }} />
          </div>
        ))}
      </div>
    </div>
  );
};
