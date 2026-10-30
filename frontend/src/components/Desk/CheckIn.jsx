import React, { useEffect, useState } from 'react';
import { deskApi } from '../../api/deskApi';
import { Field, PageHeader, errorMessage } from '../ui';
import StudentPanel from './StudentPanel';
import { usePolling } from '../../hooks/usePolling';

export default function CheckIn() {
  const [programmes, setProgrammes] = useState([]);
  const [slip, setSlip] = useState('');
  const [student, setStudent] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    deskApi.getProgrammes().then(setProgrammes).catch(() => {});
  }, []);

  usePolling(() => deskApi.get(student.slip_id).then(setStudent).catch(() => {}), 3000, Boolean(student));

  const lookup = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setStudent(null);
    try {
      setStudent(await deskApi.get(slip.trim(), { checkin: 1 })); // the Verify button is recorded in the audit log
    } catch (err) {
      setError(errorMessage(err, 'No registration found for this slip ID.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl">
      <PageHeader title="Voter check-in" subtitle="Verify a voter's slip, check whether they have voted, and issue a voting PIN." />
      <form onSubmit={lookup} className="card card-body flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1">
          <Field label="Voter slip ID" htmlFor="slip" error={error}>
            <input
              id="slip"
              className={`input font-mono uppercase ${error ? 'input-error' : ''}`}
              placeholder="SUE26-E1-000000"
              value={slip}
              onChange={(e) => {
                setSlip(e.target.value);
                setError('');
              }}
              autoFocus
              autoComplete="off"
            />
          </Field>
        </div>
        <button className="btn-primary" disabled={busy || !slip.trim()}>
          {busy ? 'Checking…' : 'Verify'}
        </button>
      </form>

      {student && (
        <div className="card card-body mt-6 animate-slide-up">
          <StudentPanel student={student} programmes={programmes} onChanged={() => deskApi.get(student.slip_id).then(setStudent).catch(() => {})} />
        </div>
      )}
    </div>
  );
}
