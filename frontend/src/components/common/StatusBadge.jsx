import React from 'react';

const GROUPS = {
  ok: ['active', 'open', 'voted', 'published', 'verified', 'success', 'voting active', 'results published'],
  warn: ['inactive', 'closed', 'not voted', 'pending', 'unverified', 'draft', 'pin active', 'voting closed', 'ready'],
  bad: ['failed', 'error', 'revoked', 'banned', 'danger'],
  brand: ['admin', 'primary', 'info', 'registration', 'registered'],
};
const CLASS = { ok: 'badge-ok', warn: 'badge-warn', bad: 'badge-bad', brand: 'badge-brand', neutral: 'badge-neutral' };
const ALIAS = { success: 'ok', warning: 'warn', danger: 'bad', primary: 'brand', default: 'neutral' };

export const StatusBadge = ({ status, variant, label }) => {
  const text = (label || status || '').toString();
  const key = text.toLowerCase();
  const tone = ALIAS[variant] || variant || Object.keys(GROUPS).find((g) => GROUPS[g].includes(key)) || 'neutral';
  return (
    <span className={CLASS[tone] || CLASS.neutral}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {label || (status ? String(status).charAt(0).toUpperCase() + String(status).slice(1) : '')}
    </span>
  );
};

export default StatusBadge;
