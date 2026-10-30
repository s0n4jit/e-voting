import { useEffect, useRef } from 'react';

/** Calls fn every `ms` while the tab is visible, and immediately when the tab becomes visible again. */
export function usePolling(fn, ms, enabled = true) {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    if (!enabled) return undefined;
    const tick = () => {
      if (!document.hidden) latest.current();
    };
    const id = setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [ms, enabled]);
}
