import React from 'react';
import { format } from 'date-fns';

/** The printed results: plain black-and-white tables, vote counts only, signature lines. Shown only when printing. */
export default function PrintableResults({ data }) {
  const { election, turnout, by_position: positions = [] } = data;
  return (
    <div className="print-page print-results">
      <h1>{data.institution_name}</h1>
      <h2>{election.title}</h2>
      <p>
        {turnout.ballots_cast} of {turnout.total_registered} registered voters voted
        {election.start_time ? `. Voting held ${format(new Date(election.start_time), 'PPp')}` : ''}.
      </p>
      {positions.map((p) => {
        const rows = [...p.candidates].sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
        return (
          <div key={p.position} style={{ breakInside: 'avoid' }}>
            <h3>{p.position}</h3>
            <table>
              <thead><tr><th>Candidate</th><th className="n">Votes (of {p.total_votes})</th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.candidate_id}>
                    <td>{c.name}{c.is_winner ? '  (WINNER)' : c.is_tied ? '  (tied)' : ''}</td>
                    <td className="n">{c.votes}</td>
                  </tr>
                ))}
                <tr><td><i>None of the Above (NOTA, not a candidate)</i></td><td className="n">{p.nota_count}</td></tr>
              </tbody>
            </table>
            <p><b>Result:</b> {p.outcome?.type === 'winner' ? `${p.outcome.label} elected` : p.outcome?.label}</p>
          </div>
        );
      })}
      <div className="sign">
        <div>Election Officer</div>
        <div>Returning Officer / Principal</div>
      </div>
      <p style={{ marginTop: '8mm', fontSize: '8pt' }}>Printed on {format(new Date(), 'PPp')}</p>
    </div>
  );
}
