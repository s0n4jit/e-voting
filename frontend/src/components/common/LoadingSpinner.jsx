import React from 'react';

export const LoadingSpinner = ({ size = 'md', text = 'Loading...' }) => {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-3',
    lg: 'h-12 w-12 border-4',
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 gap-3">
      <div
        className={`${sizeClasses[size] || sizeClasses.md} animate-spin rounded-full border-primary-200 border-t-primary-600`}
        role="status"
        aria-label="loading"
      />
      {text && <p className="text-sm text-gray-500 font-medium">{text}</p>}
    </div>
  );
};

export default LoadingSpinner;
