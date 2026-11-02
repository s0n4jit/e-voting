import React from 'react';
import { PrinterIcon } from '@heroicons/react/24/outline';
import { useBrand } from '../../context/BrandContext';

/** Printable voter slip. Only .print-area is visible when printing (see index.css). */
export default function SlipCard({ slip, showPrint = true }) {
  const { branding } = useBrand();
  const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '');
  return (
    <div className="space-y-4">
      <div className="print-area no-flip card overflow-hidden max-w-md mx-auto bg-white text-slate-900 border-slate-300">
        <div className="px-6 py-4 border-b border-dashed border-slate-300 flex items-center gap-3">
          {branding.logo && <img src={branding.logo} alt="" className="w-10 h-10 object-contain" />}
          <div className="min-w-0">
            <p className="font-semibold truncate">{slip.institution_name || branding.institution_name}</p>
            <p className="text-xs text-slate-500 truncate">{slip.election_title || 'Voter slip'}</p>
          </div>
        </div>
        <div className="px-6 py-6 text-center">
          <p className="text-xs uppercase tracking-widest text-slate-500">Voter Slip ID</p>
          <p className="font-mono text-3xl font-semibold tracking-wider mt-2 break-all text-slate-900">{slip.slip_id}</p>
        </div>
        {slip.pin && (
          <div className="px-6 pb-4 text-center">
            <p className="text-xs uppercase tracking-widest text-slate-500">Voting PIN</p>
            <p className="font-mono text-4xl font-semibold tracking-[0.3em] pl-[0.3em] mt-1 text-slate-900">{slip.pin}</p>
          </div>
        )}
        <dl className="px-6 pb-6 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div className="col-span-2">
            <dt className="text-xs text-slate-500">Name</dt>
            <dd className="font-medium text-slate-900">{slip.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Programme</dt>
            <dd className="font-medium text-slate-900">{[slip.programme, slip.department].filter(Boolean).join(' · ')}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">{slip.term_label}</dt>
            <dd className="font-medium text-slate-900">{slip.term}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-slate-500">Registered</dt>
            <dd className="text-slate-900">{fmt(slip.registered_at)}</dd>
          </div>
        </dl>
        <p className="px-6 py-3 bg-slate-50 text-xs text-slate-500 text-center border-t border-dashed border-slate-300">
          {slip.pin
            ? 'Keep this slip and the PIN secret. At the voting booth, enter the slip ID and this PIN to vote once.'
            : 'Keep this slip safe. Show it at the voting desk to receive your voting PIN.'}
        </p>
      </div>
      {showPrint && (
        <div className="no-print flex justify-center">
          <button className="btn-secondary" onClick={() => window.print()}>
            <PrinterIcon className="w-4 h-4" /> Print or save as PDF
          </button>
        </div>
      )}
    </div>
  );
}
