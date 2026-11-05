import React, { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon, XMarkIcon } from '@heroicons/react/24/outline';

/** The portfolios of the Students' Union election notice, in the order they are announced and voted on. */
export const DEFAULT_POSITIONS = [
  'President (Reserved for 3rd-semester students)',
  'Vice President',
  'General Secretary',
  'Assistant General Secretary',
  'Cultural Secretary',
  'Magazine Secretary',
  'Major Games Secretary',
  'Minor Games Secretary',
  "Boys' Common Room Secretary",
  "Girls' Common Room Secretary",
];

/**
 * Ordered list of positions: the order here is the order on the ballot and in the results.
 * Move with the arrows, remove with ✕, add your own, or bring back one of the standard positions.
 */
export default function PositionsEditor({ value, onChange, disabled = false }) {
  const [draft, setDraft] = useState('');

  const add = (name) => {
    const v = name.trim().replace(/\s+/g, ' ');
    if (v && !value.some((p) => p.toLowerCase() === v.toLowerCase())) onChange([...value, v]);
    setDraft('');
  };
  const move = (i, d) => {
    const next = [...value];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  const missing = DEFAULT_POSITIONS.filter((s) => !value.includes(s));

  return (
    <div className="space-y-3">
      {value.length === 0 && <p className="text-sm text-muted">No positions yet. Add at least one below.</p>}
      <ol className="border border-line rounded-lg divide-y divide-line">
        {value.map((p, i) => (
          <li key={p} className="flex items-center gap-2 px-3 py-2 text-sm">
            <span className="w-6 text-muted tabular-nums">{i + 1}.</span>
            <span className="flex-1 font-medium">{p}</span>
            <button type="button" className="btn-ghost btn-sm p-1" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${p} up`}>
              <ChevronUpIcon className="w-4 h-4" />
            </button>
            <button type="button" className="btn-ghost btn-sm p-1" disabled={disabled || i === value.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${p} down`}>
              <ChevronDownIcon className="w-4 h-4" />
            </button>
            <button type="button" className="btn-ghost btn-sm p-1" disabled={disabled} onClick={() => onChange(value.filter((x) => x !== p))} aria-label={`Remove ${p}`}>
              <XMarkIcon className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ol>
      {!disabled && (
        <>
          <div className="flex gap-2">
            <input
              className="input"
              value={draft}
              placeholder="Add another position and press Enter"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add(draft);
                }
              }}
            />
            <button type="button" className="btn-secondary" onClick={() => add(draft)}>Add</button>
          </div>
          {missing.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {missing.map((s) => (
                <button key={s} type="button" className="badge-neutral hover:bg-line transition-colors" onClick={() => add(s)}>+ {s}</button>
              ))}
              {missing.length === DEFAULT_POSITIONS.length - 0 && value.length === 0 && (
                <button type="button" className="badge-brand" onClick={() => onChange([...DEFAULT_POSITIONS])}>Use all standard positions</button>
              )}
            </div>
          )}
          <p className="text-xs text-muted">The order here is the order voters see on the ballot and the order of the results.</p>
        </>
      )}
    </div>
  );
}
