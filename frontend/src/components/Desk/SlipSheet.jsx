import React from 'react';
import { useBrand } from '../../context/BrandContext';

/** Hidden on screen; when printing it fills the page with cut-out slips that carry the Voter Slip ID and the PIN. */
export default function SlipSheet({ students, electionTitle }) {
  const { branding } = useBrand();
  return (
    <div className="slips-print hidden">
      {students.map((s) => (
        <div key={s.slip_id} className="slip text-sm">
          <p className="font-semibold">{branding.institution_name}</p>
          <p className="text-xs">{electionTitle}</p>
          <p className="mt-2 font-medium">{s.name}</p>
          <p className="text-xs">{s.programme}, {s.semester}</p>
          <p className="mt-2 text-xs">Voter Slip ID</p>
          <p className="font-mono text-lg font-semibold">{s.slip_id}</p>
          <p className="mt-1 text-xs">Voting PIN</p>
          <p className="font-mono text-2xl font-semibold tracking-[0.25em]">{s.pin}</p>
          <p className="mt-2 text-[10px]">Keep the PIN secret. At the voting booth enter the slip ID and this PIN. It works once.</p>
        </div>
      ))}
    </div>
  );
}

export const slipsCsv = (students) =>
  ['name,slip_id,voting_pin,programme,semester', ...students.map((s) => `"${s.name}",${s.slip_id},${s.pin},"${s.programme}",${s.semester}`)].join('\n') + '\n';
