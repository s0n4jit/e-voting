import React, { useCallback, useEffect, useState } from 'react';
import { deskApi } from '../../api/deskApi';

/**
 * Real-time Election Status indicator rendered in the main AppShell header.
 * Replaces the intrusive full-width banner with an elegant, reactive status badge.
 * Polls at high frequency (1.5s) and listens for custom window state events.
 */
export default function ElectionStatusBadge() {
  const [state, setState] = useState(null);

  const refresh = useCallback(() => {
    deskApi
      .state()
      .then((data) => {
        if (data) setState(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 1000);

    const onStateChange = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    window.addEventListener('election-state-change', onStateChange);
    window.addEventListener('focus', onVisibility);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener('election-state-change', onStateChange);
      window.removeEventListener('focus', onVisibility);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  if (!state || !state.status) return null;

  const isMock = Boolean(state.mock || state.is_mock);
  const isPaused = Boolean(state.paused);
  const status = state.status;

  if (isMock) {
    return (
      <div
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 shadow-xs tracking-wider uppercase select-none"
        title="Mock election is running. All test ballots are purged when the mock ends."
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
        </span>
        <span className="font-extrabold">Mock Election</span>
      </div>
    );
  }

  if (isPaused) {
    return (
      <div
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 shadow-2xs tracking-wide uppercase"
        title="Voting is currently paused by the election officer."
      >
        <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
        <span className="font-bold">Voting Paused</span>
      </div>
    );
  }

  if (status === 'voting_active' || (state.is_active && state.open)) {
    return (
      <div
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 shadow-2xs tracking-wide uppercase"
        title="Official voting is currently live and ballots are being cast."
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="font-extrabold">Official Live</span>
      </div>
    );
  }

  if (status === 'ready') {
    return (
      <div
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/30 shadow-2xs tracking-wide uppercase"
        title="Election configuration complete. Ready for mock or official live voting."
      >
        <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
        <span className="font-bold">Election Ready</span>
      </div>
    );
  }

  if (status === 'results_published') {
    return (
      <div
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/30 shadow-2xs tracking-wide uppercase"
        title="Voting concluded and official tally results have been published."
      >
        <span className="inline-block w-2 h-2 rounded-full bg-purple-500" />
        <span className="font-bold">Results Published</span>
      </div>
    );
  }

  if (status === 'voting_closed') {
    return (
      <div
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/20 shadow-2xs tracking-wide uppercase"
        title="Voting is closed. Awaiting results verification and publishing."
      >
        <span className="inline-block w-2 h-2 rounded-full bg-slate-400" />
        <span className="font-bold">Voting Closed</span>
      </div>
    );
  }

  if (status === 'setup' || status === 'draft') {
    return (
      <div
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/20 shadow-2xs tracking-wide uppercase"
        title="Election is in setup stage."
      >
        <span className="inline-block w-2 h-2 rounded-full bg-slate-400" />
        <span className="font-bold">Setup Stage</span>
      </div>
    );
  }

  return null;
}
