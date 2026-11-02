import React from 'react';
import { format } from 'date-fns';
import { ExclamationTriangleIcon, MinusCircleIcon, PrinterIcon, TrophyIcon } from '@heroicons/react/24/outline';
import { photoSrc, StatCard } from '../ui';
import PrintPortal from '../common/PrintPortal';
import PrintableResults from './PrintableResults';

const Avatar = ({ candidate }) =>
  candidate.photo_url ? (
    <img src={photoSrc(candidate.photo_url)} alt="" className="w-12 h-12 rounded-xl object-cover bg-recessed shrink-0" />
  ) : (
    <span className="w-12 h-12 rounded-xl bg-brand-soft text-brand-fg font-semibold text-lg flex items-center justify-center shrink-0">
      {candidate.name.charAt(0).toUpperCase()}
    </span>
  );

const OUTCOME = {
  winner: { icon: TrophyIcon, tone: 'bg-ok-soft text-ok', title: (o) => `Winner: ${o.label}` },
  draw: { icon: ExclamationTriangleIcon, tone: 'bg-warn-soft text-warn', title: (o) => o.label },
  none: { icon: MinusCircleIcon, tone: 'bg-recessed text-muted', title: (o) => o.label },
};

const Row = ({ name, votes, max, highlight, avatar }) => (
  <li
    className={`px-5 py-3.5 flex items-center gap-4 ${
      highlight === 'win' ? 'bg-ok-soft/60' : highlight === 'tie' ? 'bg-warn-soft/60' : ''
    }`}
  >
    {avatar}
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold truncate">{name}</p>
        <p className="text-sm tabular-nums shrink-0">
          <span className="font-semibold text-base">{votes}</span> <span className="text-muted">{votes === 1 ? 'vote' : 'votes'}</span>
        </p>
      </div>
      <div className="h-2 rounded-full bg-recessed mt-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${
            highlight === 'win' ? 'bg-ok' : highlight === 'tie' ? 'bg-warn' : 'bg-brand/60'
          }`}
          style={{ width: `${max > 0 ? Math.round((votes / max) * 100) : 0}%` }}
        />
      </div>
    </div>
  </li>
);

/** Results for one election: totals, then every contested position with its outcome. */
export default function ResultsView({ data }) {
  const { election, turnout, by_position: positions = [] } = data;

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-muted">{data.institution_name}</p>
          <button type="button" className="btn-secondary btn-sm no-print" onClick={() => window.print()}>
            <PrinterIcon className="w-4 h-4" /> Print results
          </button>
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-1">{election.title}</h1>
        {election.start_time && (
          <p className="text-sm text-muted mt-2">Voting held {format(new Date(election.start_time), 'PPp')} – {format(new Date(election.end_time), 'p')}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Voters who voted" value={turnout.ballots_cast} />
        <StatCard label="Registered voters" value={turnout.total_registered} />
        <StatCard label="Did not vote" value={Math.max(turnout.total_registered - turnout.ballots_cast, 0)} />
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-4">Contested Positions</h2>
        <div className="space-y-5">
          {positions.map((p) => {
            const o = OUTCOME[p.outcome?.type] || OUTCOME.none;
            const Icon = o.icon;
            const rows = [...p.candidates].sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
            const max = Math.max(...rows.map((c) => c.votes), 0);
            return (
              <article key={p.position} className="card overflow-hidden animate-slide-up">
                <header className="px-5 py-4 border-b border-line flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-lg">{p.position}</h3>
                  <span className="text-sm text-muted tabular-nums">{p.total_votes} {p.total_votes === 1 ? 'vote' : 'votes'}</span>
                </header>
                <div className={`px-5 py-3 flex items-center gap-2.5 text-sm font-medium ${o.tone}`}>
                  <Icon className="w-5 h-5 shrink-0" />
                  <span>{o.title(p.outcome)}</span>
                </div>
                <ul className="divide-y divide-line">
                  {rows.map((c) => (
                    <Row
                      key={c.candidate_id}
                      name={c.name}
                      votes={c.votes}
                      max={max}
                      highlight={c.is_winner ? 'win' : c.is_tied ? 'tie' : undefined}
                      avatar={<Avatar candidate={c} />}
                    />
                  ))}
                </ul>
                <p className="px-5 py-3 border-t border-line text-sm text-muted flex items-center justify-between">
                  <span>None of the Above (NOTA). Not a candidate; it cannot win.</span>
                  <span className="tabular-nums"><span className="font-semibold text-fg">{p.nota_count}</span> {p.nota_count === 1 ? 'vote' : 'votes'}</span>
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <PrintPortal><PrintableResults data={data} /></PrintPortal>
    </div>
  );
}
