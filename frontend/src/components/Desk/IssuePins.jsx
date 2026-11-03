import React, { useState } from 'react';
import { TicketIcon, PrinterIcon, ArrowDownTrayIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { deskApi, saveBlob } from '../../api/deskApi';
import { errorMessage } from '../ui';
import Modal from '../common/Modal';
import SlipSheet, { slipsCsv } from './SlipSheet';

/** Issues PINs to voters who don't have one yet, with confirmation and print/export tools. */
export default function IssuePins({ onDone, disabled }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [printing, setPrinting] = useState(false);

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await deskApi.issueAllPins();
      setResult(res);
      setConfirmOpen(false);
      onDone?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setResult(null);
    setError('');
    setConfirmOpen(false);
    setPrinting(false);
  };

  const handlePrint = () => {
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 250);
  };

  return (
    <>
      <button
        className="btn-secondary"
        onClick={() => setConfirmOpen(true)}
        disabled={busy || disabled}
      >
        <TicketIcon className="w-4 h-4" /> Issue PINs
      </button>

      {/* Confirmation Modal */}
      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Issue Voting PINs"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-fg">
            Generate 6-digit voting PINs for all registered students who do not yet have one?
          </p>
          <p className="text-xs text-muted">
            Existing active PINs will be safely kept. Once generated, you can download all slips as CSV or print them directly.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-ghost" onClick={() => setConfirmOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button className="btn-primary" onClick={run} disabled={busy}>
              {busy ? 'Generating PINs…' : 'Yes, Issue PINs'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Results Modal */}
      <Modal
        isOpen={Boolean(result || error)}
        onClose={close}
        title={error ? 'PIN Issue Error' : 'Voting PINs Ready'}
        maxWidth="max-w-lg"
      >
        {error ? (
          <div className="space-y-4">
            <p className="error-text" role="alert">{error}</p>
            <div className="flex justify-end">
              <button className="btn-primary" onClick={close}>Close</button>
            </div>
          </div>
        ) : result && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-ok-soft text-ok rounded-xl border border-ok/20">
              <CheckCircleIcon className="w-8 h-8 shrink-0" />
              <div>
                <p className="font-semibold text-base">
                  {result.issued} new {result.issued === 1 ? 'PIN generated' : 'PINs generated'}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  {result.students.length} total voter slip(s) are ready for distribution.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-line">
              <button
                className="btn-secondary"
                onClick={() => saveBlob(new Blob([slipsCsv(result.students)], { type: 'text/csv' }), 'voter-slips-with-pins.csv')}
              >
                <ArrowDownTrayIcon className="w-4 h-4" /> Download CSV
              </button>
              <button
                className="btn-primary"
                onClick={handlePrint}
                disabled={!result.students.length}
              >
                <PrinterIcon className="w-4 h-4" /> Print Slips
              </button>
              <button className="btn-ghost" onClick={close}>
                Done
              </button>
            </div>

            {/* SlipSheet mounted only when printing */}
            {printing && <SlipSheet students={result.students} electionTitle={result.election_title} />}
          </div>
        )}
      </Modal>
    </>
  );
}
