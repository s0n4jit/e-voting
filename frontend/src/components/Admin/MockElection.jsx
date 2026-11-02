import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { adminApi } from '../../api/adminApi';
import { errorMessage } from '../ui';
import Modal from '../common/Modal';

/** Practice run of the real election: keeps all set-up, wipes everything the run recorded. */
export default function MockElection() {
  const [election, setElection] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState(false);
  const [word, setWord] = useState('');

  const load = useCallback(async () => {
    try {
      const list = await adminApi.getElections();
      setElection(list.find((e) => e.status !== 'archived') || null);
    } catch {
      setElection(null);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, done) => {
    setBusy(true);
    try {
      await fn(election.id);
      toast.success(done);
      setEnding(false);
      setWord('');
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!election) return null;
  return (
    <div className="card card-body space-y-3">
      <h2 className="font-semibold">Mock election</h2>
      <p className="text-sm text-muted">
        Practise the whole election with the real set-up (positions, candidates, students, booths). When you end the mock, every ballot,
        PIN and log entry it recorded is deleted and all voters are reset, so you continue with the real election without creating anything again.
      </p>
      {election.is_mock ? (
        <>
          <p className="text-sm font-medium text-warn">A mock election is running for “{election.title}”.</p>
          <button className="btn-danger w-fit" onClick={() => setEnding(true)}>End mock and reset</button>
        </>
      ) : election.status === 'ready' ? (
        <button className="btn-secondary w-fit" disabled={busy} onClick={() => run(adminApi.startMock, 'Mock election started')}>Start mock election</button>
      ) : (
        <p className="text-sm text-muted">A mock can start while the election is in the Ready stage (now: {election.status_label}).</p>
      )}
      <Modal isOpen={ending} onClose={() => setEnding(false)} title="End the mock election?">
        <div className="space-y-4">
          <p className="text-sm">This deletes all mock ballots, PINs issued and log entries since the mock started, and returns the election to Ready. Students stay registered but must be given new PINs. This cannot be undone.</p>
          <input className="input" placeholder="Type RESET" value={word} onChange={(e) => setWord(e.target.value)} aria-label="Type RESET to confirm" />
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setEnding(false)}>Cancel</button>
            <button className="btn-danger" disabled={busy || word !== 'RESET'} onClick={() => run(adminApi.endMock, 'Mock election reset')}>End mock and reset</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
