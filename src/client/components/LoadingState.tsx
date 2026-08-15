import React from 'react';

export const LoadingState: React.FC = () => {
  return (
    <div className="skeleton-container">
      {[1, 2, 3, 4].map((n) => (
        <div key={n} className="skeleton-card">
          <div className="skeleton-bar" style={{ width: '20%', height: '16px' }} />
          <div className="skeleton-bar" style={{ width: '60%', height: '24px' }} />
          <div className="skeleton-bar" style={{ width: '35%', height: '14px' }} />
          <div className="skeleton-bar" style={{ width: '90%', height: '16px' }} />
        </div>
      ))}
    </div>
  );
};
