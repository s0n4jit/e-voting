import React from 'react';
import { BackspaceIcon } from '@heroicons/react/24/outline';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** On-screen number pad for booths with a mouse or touch screen only. Buttons never take the focus from the field being filled. */
export default function NumPad({ onDigit, onBackspace, onClear, disabled }) {
  const keep = (e) => e.preventDefault(); // keep the cursor in the field
  const base = 'h-16 rounded-xl text-2xl font-semibold tabular-nums transition active:scale-95 disabled:opacity-40 select-none';
  return (
    <div className="card card-body" role="group" aria-label="Number pad">
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <button key={k} type="button" className={`${base} bg-recessed hover:bg-brand-soft`} disabled={disabled} onMouseDown={keep} onClick={() => onDigit(k)}>
            {k}
          </button>
        ))}
        <button type="button" className={`${base} bg-recessed hover:bg-bad-soft text-base`} disabled={disabled} onMouseDown={keep} onClick={onClear}>
          Clear
        </button>
        <button type="button" className={`${base} bg-recessed hover:bg-brand-soft`} disabled={disabled} onMouseDown={keep} onClick={() => onDigit('0')}>
          0
        </button>
        <button type="button" className={`${base} bg-recessed hover:bg-bad-soft flex items-center justify-center`} disabled={disabled} onMouseDown={keep} onClick={onBackspace} aria-label="Delete the last digit">
          <BackspaceIcon className="w-7 h-7" />
        </button>
      </div>
    </div>
  );
}
