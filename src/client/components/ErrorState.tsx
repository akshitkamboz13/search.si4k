import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry }) => {
  return (
    <div className="state-box">
      <AlertTriangle className="state-icon" size={48} style={{ color: '#ef4444' }} />
      <div className="state-title">Search Service Unavailable</div>
      <div className="state-desc" style={{ marginBottom: '1.5rem' }}>{message}</div>
      {onRetry && (
        <button
          type="button"
          className="search-submit-btn"
          style={{ position: 'static', margin: '0 auto' }}
          onClick={onRetry}
        >
          <RefreshCw size={16} />
          <span>Retry Search</span>
        </button>
      )}
    </div>
  );
};
