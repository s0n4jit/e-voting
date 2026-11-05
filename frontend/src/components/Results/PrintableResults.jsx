import React from 'react';
import { format } from 'date-fns';
import { useBrand } from '../../context/BrandContext';

/** The printed result sheet, laid out like a letter on the college letterhead (logo, name, rules, signatures). Shown only when printing. */
export default function PrintableResults({ data }) {
  const { branding } = useBrand();
  const { election, turnout, by_position: positions = [] } = data;
  const institution = data.institution_name || branding.institution_name;
  const notVoted = Math.max(turnout.total_registered - turnout.ballots_cast, 0);
  const held = election.start_time
    ? `${format(new Date(election.start_time), 'd MMMM yyyy')}, ${format(new Date(election.start_time), 'p')} to ${format(new Date(election.end_time), 'p')}`
    : '';

  return (
    <div className="print-page print-results">
      <table className="frame">
        <thead><tr><td><div className="frame-top" /></td></tr></thead>
        <tfoot><tr><td><div className="frame-bottom" /></td></tr></tfoot>
        <tbody><tr><td>
      <header className="lh">
        {branding.logo && <img src={branding.logo} alt="" className="lh-logo" />}
        <div className="lh-name">
          <h1>{institution}</h1>
          <p>{branding.system_name}</p>
        </div>
      </header>
      <div className="lh-rule" />

      <div className="title">
        <p className="kicker">Election result sheet</p>
        <h2>{election.title}</h2>
        {held && <p>Voting held on {held}</p>}
      </div>

      <div className="turnout">
        <div><span>Total voter slips</span><b>{turnout.total_registered}</b></div>
        <div><span>Voter slips cast</span><b>{turnout.ballots_cast}</b></div>
        <div><span>Unused slips</span><b>{notVoted}</b></div>
      </div>

      <h3>Declared results</h3>
      <table className="tbl summary">
        <thead><tr><th className="s">No.</th><th>Position</th><th>Elected / result</th><th className="n">Votes</th></tr></thead>
        <tbody>
          {positions.map((p, i) => {
            const win = p.candidates.find((c) => c.is_winner || c.is_tied);
            return (
              <tr key={p.position}>
                <td className="s">{i + 1}</td>
                <td>{p.position}</td>
                <td><b>{p.outcome?.type === 'winner' ? p.outcome.label : p.outcome?.label}</b></td>
                <td className="n">{win ? win.votes : '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3>Votes by position</h3>
      {positions.map((p) => {
        const rows = [...p.candidates].sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
        return (
          <section key={p.position} className="pos">
            <table className="tbl">
              <thead><tr><th colSpan={2}>{p.position}</th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.candidate_id} className={c.is_winner ? 'win' : ''}>
                    <td>{c.name}{c.is_winner ? '  (Elected)' : c.is_tied ? '  (Tied)' : ''}</td>
                    <td className="n">{c.votes}</td>
                  </tr>
                ))}
                <tr><td><i>NOTA</i></td><td className="n">{p.nota_count}</td></tr>
                <tr className="tot"><td>Total votes cast</td><td className="n">{p.total_votes}</td></tr>
              </tbody>
            </table>
          </section>
        );
      })}

      <div className="sign">
        <div>Election Officer</div>
        <div>Returning Officer</div>
        <div>Principal</div>
      </div>

        </td></tr></tbody>
      </table>
      <footer className="lh-foot">
        {institution} · {election.title} · Printed on {format(new Date(), 'd MMM yyyy, p')}
      </footer>
    </div>
  );
}
