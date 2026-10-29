import React from 'react';

export const StatusBadge = ({ status, variant, label }) => {
  // Determine variant automatically if not provided
  let badgeVariant = variant;
  const normalized = (status || label || '').toString().toLowerCase();

  if (!badgeVariant) {
    if (['active', 'open', 'voted', 'published', 'verified', 'success'].includes(normalized)) {
      badgeVariant = 'success';
    } else if (['inactive', 'closed', 'not voted', 'pending', 'unverified', 'draft'].includes(normalized)) {
      badgeVariant = 'warning';
    } else if (['failed', 'error', 'revoked', 'banned', 'danger'].includes(normalized)) {
      badgeVariant = 'danger';
    } else if (['admin', 'primary', 'info'].includes(normalized)) {
      badgeVariant = 'primary';
    } else {
      badgeVariant = 'default';
    }
  }

  const styles = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-600/20',
    warning: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-600/20',
    danger: 'bg-rose-50 text-rose-700 border-rose-200 ring-rose-600/20',
    primary: 'bg-indigo-50 text-indigo-700 border-indigo-200 ring-indigo-600/20',
    default: 'bg-slate-100 text-slate-700 border-slate-200 ring-slate-600/10',
  };

  const dotStyles = {
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
    primary: 'bg-indigo-500',
    default: 'bg-slate-400',
  };

  const displayText = label || (status ? String(status).charAt(0).toUpperCase() + String(status).slice(1) : '');

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border shadow-xs ring-1 ring-inset ${styles[badgeVariant] || styles.default}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotStyles[badgeVariant] || dotStyles.default}`} />
      {displayText}
    </span>
  );
};

export default StatusBadge;
