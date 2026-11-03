import React from 'react';
import PrintPortal from '../common/PrintPortal';
import { useBrand } from '../../context/BrandContext';

/** One printable slip, laid out like the on-screen voter slip (logo, slip ID, PIN, details). */
export const PrintSlip = ({ slip, institution, electionTitle }) => {
  const { branding } = useBrand();
  const logo = slip.logo || branding.logo;
  const date = slip.registered_at ? new Date(slip.registered_at).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';
  return (
    <div className="print-slip border border-slate-400 rounded-xl overflow-hidden bg-white text-slate-900 break-inside-avoid">
      <div className="px-4 py-3 border-b border-dashed border-slate-400 flex items-center gap-3">
        {logo && (
          <img
            src={logo}
            alt=""
            className="w-10 h-10 object-contain shrink-0"
            style={{ width: '12mm', height: '12mm', objectFit: 'contain' }}
          />
        )}
        <div className="min-w-0">
          <p className="font-semibold text-sm leading-tight">{institution}</p>
          <p className="text-xs text-slate-600">{electionTitle || 'Voter slip'}</p>
        </div>
      </div>
      <div className="px-4 py-4 text-center">
        <p className="text-[10px] uppercase tracking-widest text-slate-600">Voter slip ID</p>
        <p className="font-mono text-2xl font-semibold tracking-wider mt-1 break-all">{slip.slip_id}</p>
      </div>
      {slip.pin && (
        <div className="px-4 pb-3 text-center">
          <p className="text-[10px] uppercase tracking-widest text-slate-600">Voting PIN</p>
          <p className="font-mono text-3xl font-semibold tracking-[0.3em] pl-[0.3em] mt-1">{slip.pin}</p>
        </div>
      )}
      <dl className="px-4 pb-4 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div className="col-span-2 flex items-baseline gap-1.5 flex-wrap">
          <dt className="text-slate-600 font-normal shrink-0">Name:</dt>
          <dd className="font-medium text-sm text-slate-900 break-words">{slip.name}</dd>
        </div>
        {slip.roll_no && (
          <div className="col-span-2 flex items-baseline gap-1.5 flex-wrap">
            <dt className="text-slate-600 font-normal shrink-0">Roll / Enrollment no.:</dt>
            <dd className="font-medium text-slate-900">{slip.roll_no}</dd>
          </div>
        )}
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <dt className="text-slate-600 font-normal shrink-0">Programme:</dt>
          <dd className="font-medium text-slate-900">{[slip.programme, slip.department].filter(Boolean).join(' · ')}</dd>
        </div>
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <dt className="text-slate-600 font-normal shrink-0">{(slip.term_label || 'Semester')}:</dt>
          <dd className="font-medium text-slate-900">{String(slip.term ?? slip.semester).replace(/^(Semester|Year)\s+/i, '')}</dd>
        </div>
        {date && (
          <div className="col-span-2 flex items-baseline gap-1.5 flex-wrap">
            <dt className="text-slate-600 font-normal shrink-0">Registered:</dt>
            <dd className="text-slate-900">{date}</dd>
          </div>
        )}
      </dl>
      <p className="px-4 py-2 text-[10px] text-slate-600 text-center border-t border-dashed border-slate-400">
        {slip.pin
          ? 'Keep this slip and the PIN secret. At the voting booth, enter the slip ID and this PIN to vote once.'
          : 'Keep this slip safe. Show it at the voting desk to receive your voting PIN.'}
      </p>
    </div>
  );
};

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
  ['name,slip_id,voting_pin,programme,semester', ...students.map((s) => `"${s.name}",${s.slip_id},${s.pin ?? ''},"${s.programme}",${s.semester}`)].join('\n') + '\n';
