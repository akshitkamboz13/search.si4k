import React from 'react';
import { SearchResult } from '../../shared/types.js';
import { ExternalLink } from 'lucide-react';

interface ResultCardProps {
  result: SearchResult;
}

export const ResultCard: React.FC<ResultCardProps> = ({ result }) => {
  const sourceClass = result.source.toLowerCase().replace(/[^a-z0-9]/g, '');

  return (
    <article className="result-card">
      <div className="result-header">
        <span className={`source-tag ${sourceClass}`}>{result.source}</span>
        <span className="result-type">• {result.type}</span>
      </div>

      <a
        href={result.url}
        target="_blank"
        rel="noopener noreferrer"
        className="result-title-link"
      >
        {result.title} <ExternalLink size={14} style={{ display: 'inline', marginLeft: 4 }} />
      </a>

      <div className="result-url">{result.url}</div>

      <p className="result-description">{result.description}</p>
    </article>
  );
};
