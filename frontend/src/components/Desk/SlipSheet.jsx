import React from 'react';
import PrintPortal from '../common/PrintPortal';
import { useBrand } from '../../context/BrandContext';

/** One printable slip: Voter Slip ID and, when known, the voting PIN. Plain black on white for ink printers. */
export const PrintSlip = ({ slip, institution, electionTitle }) => (
  <div className="print-slip">
    <p className="inst">{institution}</p>
    <p className="sub">{electionTitle}</p>
    <p className="name">{slip.name}</p>
    <p className="sub">{slip.programme}{slip.department ? ` - ${slip.department}` : ''}, {slip.term_label || 'Semester'} {slip.term ?? slip.semester}</p>
    <p className="label">Voter Slip ID</p>
    <p className="id">{slip.slip_id}</p>
    {slip.pin && (
      <>
        <p className="label">Voting PIN</p>
        <p className="pin">{slip.pin}</p>
      </>
    )}
    <p className="note">
      {slip.pin
        ? 'Keep the PIN secret. At the voting booth enter the slip ID and this PIN. It works once.'
        : 'Keep this slip safe. Ask the voting desk for your voting PIN.'}
    </p>
  </div>
);

/** A sheet of cut-out slips (visible only when printing). */
export default function SlipSheet({ students, electionTitle }) {
  const { branding } = useBrand();
  return (
    <PrintPortal>
      <div className="print-page">
        <div className="slips-grid">
          {students.map((s) => <PrintSlip key={s.slip_id} slip={s} institution={branding.institution_name} electionTitle={electionTitle} />)}
        </div>
      </div>
    </PrintPortal>
  );
}

export const slipsCsv = (students) =>
  ['name,slip_id,voting_pin,programme,semester', ...students.map((s) => `"${s.name}",${s.slip_id},${s.pin},"${s.programme}",${s.semester}`)].join('\n') + '\n';
