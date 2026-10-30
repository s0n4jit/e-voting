import React from 'react';

export const LoadingSpinner = ({ size = 'md', text = '' }) => {
  const sizes = { sm: 'h-4 w-4 border-2', md: 'h-7 w-7 border-2', lg: 'h-10 w-10 border-[3px]' };
  return (
    <div className="flex flex-col items-center justify-center p-6 gap-3" role="status">
      <div className={`${sizes[size] || sizes.md} animate-spin rounded-full border-line border-t-brand`} />
      {text ? <p className="text-sm text-muted">{text}</p> : <span className="sr-only">Loading</span>}
    </div>
  );
};

export default LoadingSpinner;
