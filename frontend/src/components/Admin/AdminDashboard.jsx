import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import {
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  ComputerDesktopIcon,
  IdentificationIcon,
  UserGroupIcon,
  UsersIcon,
  InboxIcon,
  TicketIcon,
  PresentationChartBarIcon,
  CheckBadgeIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '../../api/adminApi';
import { EmptyState, PageHeader, StatCard, formatSchedule } from '../ui';
import StatusBadge from '../common/StatusBadge';
import { usePolling } from '../../hooks/usePolling';

const STAGES = [
  ['setup', 'Setup'],
  ['registration', 'Registration'],
  ['ready', 'Ready'],
  ['voting_active', 'Voting'],
  ['voting_closed', 'Closed'],
  ['results_published', 'Results'],
  ['archived', 'Archived'],
];

const ACTION_LABEL = (a) => a.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export const AdminDashboard = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await adminApi.getOverview());
      setError('');
    } catch {
      setError('The dashboard could not be loaded.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  usePolling(load, 2000);

  const s = data?.stats;
  const loading = !data && !error;
  const election = data?.election;
  const stage = STAGES.findIndex(([k]) => k === election?.status);

  const todo = data && [
    { done: (data.setup?.candidates || 0) > 0, label: 'Add positions & candidates', to: '/admin/candidates' },
    { done: (data.setup?.voter_slips || 0) > 0, label: 'Generate voting slips & PINs', to: '/admin/slips' },
    { done: (data.setup?.voting_booths || 0) > 0, label: 'Set up voting booths', to: '/admin/kiosks' },
  ];
  const pending = todo?.filter((t) => !t.done) || [];

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle={election ? election.title : 'No election configured yet'}
        actions={election && <StatusBadge label={election.status_label} />}
      />

      {/* Quick Action Navigation Buttons */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <Link
          to="/admin/slips"
          className="btn-secondary btn-sm flex items-center gap-1.5 hover:border-brand/40 text-xs font-bold"
        >
          <TicketIcon className="w-4 h-4 text-brand" />
          <span>Voter Slips</span>
        </Link>
        <Link
          to="/admin/kiosks"
          className="btn-secondary btn-sm flex items-center gap-1.5 hover:border-brand/40 text-xs font-bold"
        >
          <ComputerDesktopIcon className="w-4 h-4 text-brand" />
          <span>Voting Booths</span>
        </Link>
        <Link
          to="/admin/candidates"
          className="btn-secondary btn-sm flex items-center gap-1.5 hover:border-brand/40 text-xs font-bold"
        >
          <UserGroupIcon className="w-4 h-4 text-brand" />
          <span>Candidates</span>
        </Link>
        <Link
          to="/admin/results"
          className="btn-secondary btn-sm flex items-center gap-1.5 hover:border-brand/40 text-xs font-bold"
        >
          <PresentationChartBarIcon className="w-4 h-4 text-brand" />
          <span>Live Results</span>
        </Link>
        <Link
          to="/admin/receipts"
          className="btn-secondary btn-sm flex items-center gap-1.5 hover:border-brand/40 text-xs font-bold"
        >
          <CheckBadgeIcon className="w-4 h-4 text-brand" />
          <span>Vote Receipts</span>
        </Link>
        <Link
          to="/admin/audit"
          className="btn-secondary btn-sm flex items-center gap-1.5 hover:border-brand/40 text-xs font-bold"
        >
          <DocumentTextIcon className="w-4 h-4 text-brand" />
          <span>Audit Log</span>
        </Link>
      </div>

      {error && <div className="card mb-6"><EmptyState title={error} /></div>}

      {pending.length > 0 && (
        <div className="card card-body mb-6 border-brand/30 bg-brand-soft/50 animate-slide-up">
          <p className="font-medium flex items-center gap-2">
            <ClipboardDocumentCheckIcon className="w-5 h-5 text-brand-fg" /> Finish setting up
          </p>
          <ul className="mt-3 grid sm:grid-cols-3 gap-2 text-sm">
            {todo.map((t) => (
              <li key={t.label}>
                <Link to={t.to} className={`flex items-center gap-2 rounded-lg px-3 py-2 bg-surface border border-line hover:border-brand/50 transition-colors ${t.done ? 'text-muted' : ''}`}>
                  <CheckCircleIcon className={`w-5 h-5 shrink-0 ${t.done ? 'text-ok' : 'text-line'}`} />
                  <span className={t.done ? 'line-through' : ''}>{t.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard loading={loading} label="Total voter slips" value={s?.registered_voters} icon={UsersIcon} />
        <StatCard loading={loading} label="Votes cast" value={s?.votes_cast} icon={CheckCircleIcon} />
        <StatCard loading={loading} label="Unused slips remaining" value={s?.remaining_voters} icon={UserGroupIcon} />
        <StatCard loading={loading} label="Turnout" value={s && `${s.turnout_percent}%`} icon={ClipboardDocumentCheckIcon} />
        <StatCard
          loading={loading}
          label="Voting booths"
          value={s ? (s.voting_booths ?? 0) : '—'}
          hint={
            s ? (
              <span className="inline-flex items-center gap-1.5 font-medium">
                <span className={`w-1.5 h-1.5 rounded-full ${s.online_booths > 0 ? 'bg-ok animate-pulse' : 'bg-muted/50'}`} />
                <span>{s.online_booths || 0} online</span>
              </span>
            ) : undefined
          }
          icon={ComputerDesktopIcon}
        />
        <StatCard loading={loading} label="Candidates" value={s?.candidates} icon={UserGroupIcon} />
        <div className="card card-body col-span-2 animate-slide-up">
          <p className="text-sm text-muted">Voting turnout</p>
          <div className="h-2.5 rounded-full bg-recessed mt-4 overflow-hidden" role="progressbar" aria-valuenow={s?.turnout_percent || 0} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-brand rounded-full transition-[width] duration-700 ease-out" style={{ width: `${s?.turnout_percent || 0}%` }} />
          </div>
          <p className="text-xs text-muted mt-2">
            {s ? `${s.votes_cast} of ${s.registered_voters} voting slips cast` : ' '}
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-4 mt-4">
        <div className="card card-body lg:col-span-3">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-medium">Election timeline</h2>
            <Link to="/admin/elections" className="text-sm text-brand-fg hover:underline">Manage</Link>
          </div>
          {election ? (
            <>
              <ol className="flex items-center">
                {STAGES.map(([key, label], i) => (
                  <li key={key} className="flex-1 flex items-center last:flex-none">
                    <div className="flex flex-col items-center gap-1.5">
                      <span className={`w-3 h-3 rounded-full transition-colors ${i <= stage ? 'bg-brand' : 'bg-line'} ${i === stage ? 'ring-4 ring-brand/25' : ''}`} />
                      <span className={`text-[11px] hidden sm:block ${i === stage ? 'font-medium text-fg' : 'text-muted'}`}>{label}</span>
                    </div>
                    {i < STAGES.length - 1 && <span className={`flex-1 h-px mx-1 ${i < stage ? 'bg-brand' : 'bg-line'}`} />}
                  </li>
                ))}
              </ol>
              <dl className="grid grid-cols-2 gap-4 mt-6 text-sm">
                <div>
                  <dt className="text-muted">Scheduled (for information)</dt>
                  <dd className="font-medium">{formatSchedule(election.start_time, election.end_time)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Voting is controlled by</dt>
                  <dd className="font-medium">
                    You, on the <Link to="/admin/elections" className="text-brand hover:underline">Elections</Link> page
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <EmptyState
              title="No active election"
              action={
                <Link to="/admin/elections" className="btn-primary btn-sm">
                  Go to Elections
                </Link>
              }
            >
              The previous election is archived. Create a new election to get started.
            </EmptyState>
          )}
        </div>

        <div className="card lg:col-span-2">
          <div className="px-6 py-4 border-b border-line flex items-center justify-between">
            <h2 className="font-medium">Recent activity</h2>
            <Link to="/admin/audit" className="text-sm text-brand-fg hover:underline">View all</Link>
          </div>
          {data?.recent_activity?.length ? (
            <ul className="divide-y divide-line">
              {data.recent_activity.map((a, i) => (
                <li key={i} className="px-6 py-3">
                  <p className="text-sm font-medium">{ACTION_LABEL(a.action)}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {a.actor} · {a.at ? formatDistanceToNow(new Date(a.at), { addSuffix: true }) : ''}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={InboxIcon} title="No activity yet" />
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
