import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { MoonIcon, SunIcon, InboxIcon } from '@heroicons/react/24/outline';
import { useTheme } from '../../context/ThemeContext';
import { useBrand } from '../../context/BrandContext';
import { API_BASE_URL } from '../../api/axiosConfig';

export const ThemeToggle = ({ className = '' }) => {
  const { theme, toggle, enabled } = useTheme();
  const { branding } = useBrand();
  const isAllowed = enabled || branding?.enable_theme_toggle === 'true' || branding?.enable_theme_toggle === true;
  if (!isAllowed) return null;

  const Icon = theme === 'dark' ? SunIcon : MoonIcon;
  return (
    <button
      type="button"
      onClick={toggle}
      className={`btn-ghost p-2 ${className}`}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      <Icon className="w-5 h-5" />
    </button>
  );
};

/** "Oct 30, 2026 5:00 PM – 10:00 PM" (the end shows its date only when it is another day). */
export const formatSchedule = (startIso, endIso) => {
  const s = new Date(startIso);
  const e = new Date(endIso);
  return `${format(s, 'PP p')} – ${format(e, format(s, 'PP') === format(e, 'PP') ? 'p' : 'PP p')}`;
};

/** Live clock and date for the voting booth header. */
export const BoothClock = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-right leading-tight tabular-nums" aria-label="Current time and date">
      <div className="text-lg font-semibold">{format(now, 'hh:mm:ss a')}</div>
      <div className="text-xs text-muted">{format(now, 'EEE, d MMM yyyy')}</div>
    </div>
  );
};

export const BrandMark = ({ size = 'md', showName = true, onDark = false }) => {
  const { branding } = useBrand();
  const box = size === 'lg' ? 'w-12 h-12 text-lg' : 'w-9 h-9 text-sm';
  return (
    <div className="flex items-center gap-3 min-w-0">
      {branding.logo ? (
        <img src={branding.logo} alt="" className={`${box} rounded-xl object-contain ${onDark ? 'bg-white p-1' : 'bg-surface border border-line'}`} />
      ) : (
        <img src="/logo.svg" alt="" className={`${box} rounded-xl shrink-0`} />
      )}
      {showName && (
        <div className="min-w-0">
          <p className={`text-sm font-semibold leading-tight ${onDark ? 'text-white' : 'text-fg truncate'}`}>{branding.system_name}</p>
          {branding.institution_name && (
            <p className={`text-xs leading-snug mt-0.5 ${onDark ? 'text-white/70' : 'text-muted truncate'}`}>{branding.institution_name}</p>
          )}
        </div>
      )}
    </div>
  );
};

/** Round profile picture, or the person's initial when there is no photo. */
export const UserAvatar = ({ user, className = 'w-9 h-9 text-sm' }) =>
  user?.photo ? (
    <img src={user.photo} alt="" className={`${className} rounded-full object-cover shrink-0`} />
  ) : (
    <span className={`${className} rounded-full bg-brand text-white font-semibold flex items-center justify-center shrink-0`}>
      {(user?.name || '?').charAt(0).toUpperCase()}
    </span>
  );

/** Lets the officer pick which election a page shows (only when there is more than one). */
export const ElectionPicker = ({ elections, value, onChange }) =>
  elections && elections.length > 1 ? (
    <select className="input w-auto max-w-xs" aria-label="Election" value={value || ''} onChange={(e) => onChange(e.target.value)}>
      {elections.map((e) => (
        <option key={e.id} value={e.id}>
          {e.is_mock ? `[MOCK] ${e.title}` : e.title} ({e.is_mock ? 'Mock Dry Run' : e.status_label})
        </option>
      ))}
    </select>
  ) : null;

export const PageHeader = ({ title, subtitle, actions }) => (
  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
    <div>
      <h1 className="page-title">{title}</h1>
      {subtitle && <p className="page-subtitle">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
  </div>
);

export const StatCard = ({ label, value, hint, icon: Icon, loading }) => (
  <div className="card card-body animate-slide-up">
    <div className="flex items-start justify-between">
      <p className="text-sm text-muted">{label}</p>
      {Icon && <Icon className="w-5 h-5 text-muted" />}
    </div>
    {loading ? (
      <div className="skeleton h-8 w-20 mt-3" />
    ) : (
      <p className="text-3xl font-semibold tracking-tight mt-2 tabular-nums">{value}</p>
    )}
    {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
  </div>
);

export const EmptyState = ({ icon: Icon = InboxIcon, title, children, action }) => (
  <div className="flex flex-col items-center text-center py-14 px-6">
    <div className="w-12 h-12 rounded-full bg-recessed flex items-center justify-center mb-4">
      <Icon className="w-6 h-6 text-muted" />
    </div>
    <p className="font-medium text-fg">{title}</p>
    {children && <p className="text-sm text-muted mt-1 max-w-sm">{children}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const TableSkeleton = ({ rows = 5, cols = 4 }) => (
  <div className="p-4 space-y-3" aria-hidden="true">
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols }).map((__, c) => (
          <div key={c} className="skeleton h-5" />
        ))}
      </div>
    ))}
  </div>
);

export const Field = ({ label, error, hint, htmlFor, children }) => (
  <div>
    {label && (
      <label htmlFor={htmlFor} className="label">
        {label}
      </label>
    )}
    {children}
    {error ? (
      <p className="error-text" role="alert">
        {error}
      </p>
    ) : hint ? (
      <p className="hint">{hint}</p>
    ) : null}
  </div>
);

export const AnimatedCheck = ({ size = 72 }) => (
  <div className="relative" style={{ width: size, height: size }}>
    <span className="absolute inset-0 rounded-full bg-ok/30 animate-ring-out" />
    <svg viewBox="0 0 52 52" width={size} height={size} className="relative">
      <circle cx="26" cy="26" r="24" fill="rgb(var(--ok-soft))" stroke="rgb(var(--ok))" strokeWidth="2" />
      <path
        d="M15 27l8 8 14-16"
        fill="none"
        stroke="rgb(var(--ok))"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength="1"
        className="stroke-draw animate-draw-check"
      />
    </svg>
  </div>
);

/** Uploaded photos are served by the API (/api/photos/<id>); older candidates may carry a full URL. */
export const photoSrc = (url) => (url && url.startsWith('/api/') ? API_BASE_URL.replace(/\/api$/, '') + url : url);

export const errorMessage = (err, fallback = 'Something went wrong. Please try again.') =>
  err?.response?.data?.message || err?.response?.data?.error || fallback;
