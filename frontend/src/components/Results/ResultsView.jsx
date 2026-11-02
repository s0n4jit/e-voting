import React from 'react';
import { format } from 'date-fns';
import { CheckBadgeIcon, ExclamationTriangleIcon, MinusCircleIcon, PrinterIcon } from '@heroicons/react/24/outline';
import { photoSrc } from '../ui';
import { useBrand } from '../../context/BrandContext';
import PrintPortal from '../common/PrintPortal';
import PrintableResults from './PrintableResults';

const Avatar = ({ candidate }) =>
  candidate.photo_url ? (
    <img src={photoSrc(candidate.photo_url)} alt="" className="w-11 h-11 rounded-xl object-cover bg-recessed shrink-0" />
  ) : (
    <span className="w-11 h-11 rounded-xl bg-brand-soft text-brand-fg font-semibold flex items-center justify-center shrink-0">
      {candidate.name.charAt(0).toUpperCase()}
    </span>
  );

const Stat = ({ label, value }) => (
  <div className="px-5 py-4 text-center">
    <p className="text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
    <p className="text-xs uppercase tracking-widest text-muted mt-1">{label}</p>
  </div>
);

const Votes = ({ n, of }) => (
  <p className="text-right tabular-nums shrink-0 leading-tight">
    <span className="text-xl font-semibold">{n}</span>
    <span className="block text-[11px] text-muted">{n === 1 ? 'vote' : 'votes'} of {of}</span>
  </p>
);

const OUTCOME = {
  winner: { icon: CheckBadgeIcon, tone: 'text-ok' },
  draw: { icon: ExclamationTriangleIcon, tone: 'text-warn' },
  none: { icon: MinusCircleIcon, tone: 'text-muted' },
};

/** Results of one election: a letterhead header with the Print button first, the declared winners, then every position. */
export default function ResultsView({ data, portal = true }) {
  const { branding } = useBrand();
  const { election, turnout, by_position: positions = [] } = data;
  const institution = data.institution_name || branding.institution_name;
  const notVoted = Math.max(turnout.total_registered - turnout.ballots_cast, 0);

  return (
    <div className="space-y-6">
      {/* header: looks like the printed sheet */}
      <section className="card overflow-hidden">
        <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            {branding.logo && <img src={branding.logo} alt="" className="w-16 h-16 object-contain shrink-0" />}
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.25em] text-muted">Election result sheet</p>
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight leading-snug">{institution}</h1>
              <p className="text-sm text-muted truncate">
                {election.title}
                {election.start_time ? ` · ${format(new Date(election.start_time), 'd MMM yyyy')}` : ''}
              </p>
            </div>
          </div>
          <button type="button" className="btn-primary btn-lg shrink-0 no-print" onClick={() => window.print()}>
            <PrinterIcon className="w-5 h-5" /> Print result sheet
          </button>
        </div>
        <div className="grid grid-cols-3 divide-x divide-line border-t border-dashed border-line bg-recessed/50">
          <Stat label="Registered" value={turnout.total_registered} />
          <Stat label="Voted" value={turnout.ballots_cast} />
          <Stat label="Did not vote" value={notVoted} />
        </div>
      </section>

      {/* declared results */}
      <section className="card overflow-hidden">
        <header className="px-5 py-3.5 border-b border-line">
          <h2 className="font-semibold">Declared results</h2>
        </header>
        <ul className="divide-y divide-line">
          {positions.map((p, i) => {
            const o = OUTCOME[p.outcome?.type] || OUTCOME.none;
            const Icon = o.icon;
            const win = p.candidates.find((c) => c.is_winner || c.is_tied);
            return (
              <li key={p.position} className="px-5 py-3 flex items-center gap-4">
                <span className="w-6 text-sm text-muted tabular-nums">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted">{p.position}</p>
                  <p className={`font-semibold truncate flex items-center gap-1.5 ${o.tone}`}>
                    <Icon className="w-5 h-5 shrink-0" />
                    <span className="truncate">{p.outcome?.label}</span>
                  </p>
                </div>
                {win && <Votes n={win.votes} of={p.total_votes} />}
              </li>
            );
          })}
        </ul>
      </section>

      {/* every position with the full count */}
      <section>
        <h2 className="font-semibold mb-3">Votes by position</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {positions.map((p) => {
            const rows = [...p.candidates].sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
            return (
              <article key={p.position} className="card overflow-hidden">
                <header className="px-5 py-3 border-b border-line flex items-center justify-between gap-3">
                  <h3 className="font-semibold truncate">{p.position}</h3>
                  <span className="text-xs text-muted tabular-nums shrink-0">{p.total_votes} votes cast</span>
                </header>
                <ul className="divide-y divide-line">
                  {rows.map((c) => (
                    <li key={c.candidate_id} className={`px-5 py-3 flex items-center gap-3 ${c.is_winner ? 'bg-ok-soft/60' : c.is_tied ? 'bg-warn-soft/60' : ''}`}>
                      <Avatar candidate={c} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{c.name}</p>
                        {c.is_winner && <p className="text-xs text-ok font-medium">Elected</p>}
                        {c.is_tied && <p className="text-xs text-warn font-medium">Tied</p>}
                      </div>
                      <Votes n={c.votes} of={p.total_votes} />
                    </li>
                  ))}
                  <li className="px-5 py-3 flex items-center gap-3 bg-recessed/40">
                    <span className="w-11 h-11 rounded-xl bg-recessed text-muted flex items-center justify-center shrink-0"><MinusCircleIcon className="w-6 h-6" /></span>
                    <p className="font-medium flex-1">NOTA</p>
                    <Votes n={p.nota_count} of={p.total_votes} />
                  </li>
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      {portal && <PrintPortal><PrintableResults data={data} /></PrintPortal>}
    </div>
  );
}
