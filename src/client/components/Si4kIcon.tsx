import React from 'react';

interface Si4kIconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const Si4kIcon: React.FC<Si4kIconProps> = ({ size = 24, className = '', style }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`si4k-brand-icon ${className}`}
      style={style}
    >
      <defs>
        <linearGradient id="si4kGradient" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0284c7" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
        <linearGradient id="si4kInnerGradient" x1="10" y1="10" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38bdf8" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      {/* Outer rounded shield container with offline node motif */}
      <rect width="40" height="40" rx="10" fill="url(#si4kGradient)" />
      {/* Search Ring */}
      <circle cx="18" cy="18" r="9" stroke="white" strokeWidth="3" fill="none" />
      {/* Search handle */}
      <path d="M24.5 24.5L32 32" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
      {/* Offline 4K pulse node */}
      <circle cx="28" cy="12" r="3.5" fill="#38bdf8" stroke="white" strokeWidth="1.5" />
      <path d="M15 18L18 15L21 18" stroke="url(#si4kInnerGradient)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};
