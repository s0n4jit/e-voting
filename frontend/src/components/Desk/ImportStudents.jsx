import React, { useState } from 'react';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { deskApi, saveBlob, setupApi } from '../../api/deskApi';
import { errorMessage } from '../ui';
import Modal from '../common/Modal';

/** Register many students at once from a CSV: name, programme, department, semester. */
export default function ImportStudents({ onDone }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [problems, setProblems] = useState([]);
  const [result, setResult] = useState(null);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setError('');
    setProblems([]);
    setResult(null);
  };

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    setError('');
    setProblems([]);
    try {
      const res = await deskApi.importStudents(file);
      setResult(res);
      onDone?.();
    } catch (err) {
      setError(errorMessage(err));
      setProblems(err?.response?.data?.errors || []);
    } finally {
      setBusy(false);
    }
  };

  const downloadSlips = () => {
    const rows = ['name,slip_id,programme,semester', ...result.students.map((s) => `"${s.name}",${s.slip_id},"${s.programme}",${s.semester}`)];
    saveBlob(new Blob([rows.join('\n') + '\n'], { type: 'text/csv' }), 'new-voter-slips.csv');
  };

  return (
    <>
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        <ArrowUpTrayIcon className="w-4 h-4" /> Import list
      </button>
      <Modal isOpen={open} onClose={close} title="Import a student list" maxWidth="max-w-xl">
        {result ? (
          <div className="space-y-4">
            <p className="text-sm">
              <b>{result.created}</b> {result.created === 1 ? 'student was' : 'students were'} registered
              {result.skipped ? `, ${result.skipped} already registered (skipped)` : ''}. Each has a Voter Slip ID.
            </p>
            <div className="flex justify-end gap-2">
              {result.created > 0 && <button className="btn-secondary" onClick={downloadSlips}>Download slip IDs (CSV)</button>}
              <button className="btn-primary" onClick={close}>Done</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              A CSV with the columns <code>name, programme, department, semester</code>. The programme and department must be written
              exactly as in the Programmes list (for Higher Secondary: programme <i>Higher Secondary</i> and the stream as department).
              Nothing is imported unless every row is correct.
            </p>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={async () => saveBlob(new Blob([await setupApi.studentTemplate()], { type: 'text/csv' }), 'students-template.csv')}
            >
              Download the template
            </button>
            <label className="btn-primary cursor-pointer w-fit">
              {busy ? 'Importing…' : 'Choose CSV file'}
              <input type="file" accept=".csv,text/csv" className="sr-only" disabled={busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {error && <p className="error-text" role="alert">{error}</p>}
            {problems.length > 0 && (
              <ul className="text-sm text-bad list-disc pl-5 max-h-48 overflow-auto">
                {problems.map((p) => <li key={p}>{p}</li>)}
              </ul>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
