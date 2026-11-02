import React, { useState } from 'react';
import { TicketIcon } from '@heroicons/react/24/outline';
import { deskApi, saveBlob } from '../../api/deskApi';
import { errorMessage } from '../ui';
import Modal from '../common/Modal';
import SlipSheet, { slipsCsv } from './SlipSheet';

/** Gives every student without a PIN one, then prints the slips (with PINs) of everyone who has not voted. */
export default function IssuePins({ onDone, disabled }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      setResult(await deskApi.issueAllPins());
      onDone?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const close = () => { setResult(null); setError(''); };

  return (
    <>
      <button className="btn-secondary" onClick={run} disabled={busy || disabled}>
        <TicketIcon className="w-4 h-4" /> {busy ? 'Issuing…' : 'Issue PINs'}
      </button>
      <Modal isOpen={Boolean(result || error)} onClose={close} title="Voting PINs" maxWidth="max-w-md">
        {error ? (
          <div className="space-y-4">
            <p className="error-text" role="alert">{error}</p>
            <div className="flex justify-end"><button className="btn-primary" onClick={close}>Close</button></div>
          </div>
        ) : result && (
          <div className="space-y-4">
            <p className="text-sm">
              {result.issued} new {result.issued === 1 ? 'PIN was' : 'PINs were'} issued. {result.students.length} slips (students who have not voted) are ready to print.
              Existing PINs were kept.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => saveBlob(new Blob([slipsCsv(result.students)], { type: 'text/csv' }), 'voter-slips-with-pins.csv')}>Download (CSV)</button>
              <button className="btn-primary" onClick={() => window.print()} disabled={!result.students.length}>Print slips</button>
            </div>
            <SlipSheet students={result.students} electionTitle={result.election_title} />
          </div>
        )}
      </Modal>
    </>
  );
}
