import React, { useCallback, useEffect, useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ArrowDownTrayIcon, PlusIcon, RectangleStackIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { adminApi } from '../../api/adminApi';
import { saveBlob, safeFileName } from '../../api/deskApi';
import { EmptyState, Field, PageHeader, TableSkeleton, errorMessage, formatSchedule } from '../ui';
import Modal from '../common/Modal';
import StatusBadge from '../common/StatusBadge';
import PositionsEditor, { DEFAULT_POSITIONS } from '../common/PositionsEditor';

const ORDER = ['setup', 'registration', 'ready', 'voting_active', 'voting_closed', 'results_published', 'archived'];
const NEXT = {
  setup: ['registration', 'Proceed to Review', 'Moves to Nomination & Roll Review. Requires candidate nominations, voting booths, and voter slips to be configured.'],
  registration: ['ready', 'Lock & Finalize Ready', 'Finalizes review and locks election configuration. Only mock elections and booth terminal setup are allowed in Ready stage.'],
  ready: ['voting_active', 'Open live voting', 'Opens live voting on all authorized booths. Candidates and settings cannot be changed. Mock elections must be ended before opening live voting.'],
  voting_active: ['voting_closed', 'Close voting', 'No further ballots will be accepted, even if the scheduled time has not ended. This cannot be undone.'],
  voting_closed: ['results_published', 'Publish results', 'Unlocks the results for you: the projector reveal, the report and the public link on the Results page. Until you publish, nobody can see the counts. This does not make them public. This cannot be undone.'],
  results_published: ['archived', 'Archive election', 'Archived elections are read-only.'],
};

const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export const ElectionManager = () => {
  const [elections, setElections] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [editor, setEditor] = useState(null); // {election?, form}
  const [mockEnding, setMockEnding] = useState(null);
  const [resetWord, setResetWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await adminApi.getElections();
      setElections(Array.isArray(data) ? data : data.elections || []);
    } catch (err) {
      toast.error(errorMessage(err));
      setElections([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  // the list follows what happens elsewhere (status changes, votes) without a refresh
  usePolling(() => adminApi.getElections().then((d) => setElections(Array.isArray(d) ? d : d.elections || [])).catch(() => {}), 2000);

  const move = async (election, status) => {
    if (status === 'registration') {
      if (!election.positions || election.positions.length === 0) {
        toast.error('Setup incomplete: Add at least one position before proceeding to review.');
        setConfirm(null);
        return;
      }
      if (!election.candidates || election.candidates.length === 0) {
        toast.error('Setup incomplete: Fill in candidate nominations before proceeding to review.');
        setConfirm(null);
        return;
      }
    }
    if (status === 'voting_active') {
      if (election.is_mock) {
        toast.error('Mock election is currently active. End the mock run before opening live voting.');
        setConfirm(null);
        return;
      }
    }
    setBusy(true);
    try {
      await adminApi.setElectionStatus(election.id, status);
      toast.success('Election updated');
      window.dispatchEvent(new CustomEvent('election-state-change'));
      setConfirm(null);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  const pauseResume = async (election) => {
    setBusy(true);
    try {
      if (election.voting_paused) await adminApi.resumeVoting(election.id);
      else await adminApi.pauseVoting(election.id);
      toast.success(election.voting_paused ? 'Voting resumed' : 'Voting paused', { id: 'voting-state-toggle' });
      window.dispatchEvent(new CustomEvent('election-state-change'));
      await load();
    } catch (err) {
      toast.error(errorMessage(err), { id: 'voting-state-toggle' });
    } finally {
      setBusy(false);
    }
  };

  const startMock = async (election) => {
    setBusy(true);
    try {
      await adminApi.startMock(election.id);
      toast.success('Mock election started');
      window.dispatchEvent(new CustomEvent('election-state-change'));
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const endMock = async (election) => {
    setBusy(true);
    try {
      await adminApi.endMock(election.id);
      toast.success('Mock election reset');
      window.dispatchEvent(new CustomEvent('election-state-change'));
      setMockEnding(null);
      setResetWord('');
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const openEditor = (election) => {
    const now = new Date();
    setFormError('');
    setEditor({
      election,
      form: election
        ? {
            title: election.title,
            description: election.description || '',
            start_time: toLocalInput(election.start_time),
            end_time: toLocalInput(election.end_time),
            positions: [...(election.positions || [])],
          }
        : {
            title: '',
            description: '',
            start_time: toLocalInput(now),
            end_time: toLocalInput(new Date(now.getTime() + 86400000)),
            positions: [...DEFAULT_POSITIONS],
          },
    });
  };

  const save = async (e) => {
    e.preventDefault();
    const { election, form } = editor;
    setBusy(true);
    setFormError('');
    const locked = election && ORDER.indexOf(election.status) >= ORDER.indexOf('ready');
    const start = new Date(form.start_time);
    const end = new Date(form.end_time);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setFormError('Please enter valid scheduled start and end dates.');
      setBusy(false);
      return;
    }
    if (end <= start) {
      setFormError('Scheduled end must be after scheduled start.');
      setBusy(false);
      return;
    }
    const payload = {
      title: form.title,
      description: form.description,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
    };
    const positions = form.positions;
    try {
      if (election) {
        await adminApi.updateElection(election.id, payload);
        if (!locked) await adminApi.setPositions(election.id, positions);
      } else {
        await adminApi.createElection({ ...payload, positions });
      }
      toast.success(election ? 'Election saved' : 'Election created');
      setEditor(null);
      load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const report = async (election) => {
    try {
      saveBlob(await adminApi.downloadReport(election.id), `election-report-${safeFileName(election.title || election.id)}-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const busyElection = (elections || []).some((e) => e.status !== 'archived');
  const editing = editor?.election;
  const lockedEditing = editing && ORDER.indexOf(editing.status) >= ORDER.indexOf('ready');

  return (
    <div>
      <PageHeader
        title="Elections"
        subtitle="One election runs at a time. Archive it to start the next."
        actions={
          <button
            className="btn-primary"
            onClick={() => openEditor(null)}
            disabled={busyElection}
            title={busyElection ? 'Only one election can run at a time. Archive the current one first.' : undefined}
          >
            <PlusIcon className="w-4 h-4" /> New election
          </button>
        }
      />

      {!elections ? (
        <div className="card"><TableSkeleton rows={3} cols={3} /></div>
      ) : elections.length === 0 ? (
        <div className="card">
          <EmptyState icon={RectangleStackIcon} title="No elections yet" action={<button className="btn-primary" onClick={() => openEditor(null)}>Create election</button>}>
            Create your first election to define positions and open registration.
          </EmptyState>
        </div>
      ) : (
        <div className="space-y-4">
          {elections.map((e) => {
            const next = NEXT[e.status];
            const idx = ORDER.indexOf(e.status);
            return (
              <article key={e.id} className="card card-body animate-slide-up">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="font-semibold text-lg">{e.title}</h2>
                      <StatusBadge label={e.status_label} />
                    </div>
                    {e.description && <p className="text-sm text-muted mt-1">{e.description}</p>}
                    <p className="text-sm text-muted mt-2">
                      Scheduled: {formatSchedule(e.start_time, e.end_time)}
                      <span className="text-xs"> · for information, you open and close voting</span>
                    </p>
                    <p className="text-sm text-muted mt-1">
                      {e.positions.length} {e.positions.length === 1 ? 'position' : 'positions'}
                      {e.candidates ? ` · ${e.candidates.length} candidates` : ''} · {e.total_votes} votes cast
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {idx > 0 && idx <= 2 && (
                      <button className="btn-ghost btn-sm" onClick={() => move(e, ORDER[idx - 1])} disabled={busy}>Back a stage</button>
                    )}
                    {e.status === 'voting_active' && (
                      <button className="btn-secondary btn-sm" disabled={busy} onClick={() => pauseResume(e)}>
                        {e.voting_paused ? 'Resume voting' : 'Pause voting'}
                      </button>
                    )}
                    {e.is_mock ? (
                      <button
                        className="btn-danger btn-sm"
                        disabled={busy}
                        onClick={() => { setMockEnding(e); setResetWord(''); }}
                      >
                        End mock & reset
                      </button>
                    ) : (
                      e.status === 'ready' && (
                        <button
                          className="btn-secondary btn-sm"
                          disabled={busy}
                          onClick={() => startMock(e)}
                        >
                          Start mock election
                        </button>
                      )
                    )}
                    {next && (
                      <button className="btn-primary btn-sm" disabled={busy} onClick={() => (next[2] ? setConfirm({ election: e, next }) : move(e, next[0]))}>
                        {next[1]}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-line">
                  <Link to={`/admin/candidates?election=${e.id}`} className="btn-secondary btn-sm">Candidates</Link>
                  {ORDER.indexOf(e.status) < ORDER.indexOf('ready') ? (
                    <button className="btn-secondary btn-sm" onClick={() => openEditor(e)}>Edit details</button>
                  ) : (
                    <button
                      className="btn-secondary btn-sm opacity-50 cursor-not-allowed"
                      disabled
                      title="Configuration and dates are locked once election reaches Ready stage."
                    >
                      Locked
                    </button>
                  )}
                  <Link to={`/admin/results?election=${e.id}`} className="btn-secondary btn-sm">Results</Link>
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => report(e)}
                    disabled={!['results_published', 'archived'].includes(e.status)}
                    title={['results_published', 'archived'].includes(e.status) ? undefined : 'Available after the results are published, so they stay a surprise.'}
                  >
                    <ArrowDownTrayIcon className="w-4 h-4" /> Report
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal isOpen={Boolean(confirm)} onClose={() => setConfirm(null)} title={confirm?.next[1]}>
        {confirm && (
          <div className="space-y-5">
            <p className="text-sm text-muted">{confirm.next[2]}</p>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="btn-primary" disabled={busy} onClick={() => move(confirm.election, confirm.next[0])}>
                {confirm.next[1]}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={Boolean(mockEnding)} onClose={() => setMockEnding(null)} title="End the mock election?">
        {mockEnding && (
          <div className="space-y-4">
            <p className="text-sm">
              This deletes all mock ballots, PINs, voter slips, and log entries recorded since the mock started, and returns the election to Ready. This cannot be undone.
            </p>
            <input
              className="input"
              placeholder="Type RESET"
              value={resetWord}
              onChange={(e) => setResetWord(e.target.value)}
              aria-label="Type RESET to confirm"
            />
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setMockEnding(null)}>Cancel</button>
              <button
                className="btn-danger"
                disabled={busy || resetWord !== 'RESET'}
                onClick={() => endMock(mockEnding)}
              >
                End mock and reset
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={Boolean(editor)} onClose={() => setEditor(null)} title={editing ? 'Edit election' : 'New election'} maxWidth="max-w-xl">
        {editor && (
          <form onSubmit={save} className="space-y-4">
            <Field label="Title" htmlFor="el-title">
              <input id="el-title" className="input" required value={editor.form.title} onChange={(e) => setEditor({ ...editor, form: { ...editor.form, title: e.target.value } })} />
            </Field>
            <Field label="Description" htmlFor="el-desc">
              <textarea id="el-desc" className="input min-h-[64px]" value={editor.form.description} onChange={(e) => setEditor({ ...editor, form: { ...editor.form, description: e.target.value } })} />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Scheduled start" htmlFor="el-start">
                <input id="el-start" type="datetime-local" className="input" required value={editor.form.start_time} onChange={(e) => setEditor({ ...editor, form: { ...editor.form, start_time: e.target.value } })} />
              </Field>
              <Field label="Scheduled end" htmlFor="el-end">
                <input id="el-end" type="datetime-local" className="input" required value={editor.form.end_time} onChange={(e) => setEditor({ ...editor, form: { ...editor.form, end_time: e.target.value } })} />
              </Field>
            </div>
            <p className="text-xs text-muted -mt-2">
              The date and time are shown to staff and voters for information only. Voting starts when you press Open voting and ends when you press Close voting.
            </p>
            <Field label="Positions" hint={lockedEditing ? 'Positions are locked once voting has opened.' : 'In the order voters see them and the order of the results.'}>
              <PositionsEditor value={editor.form.positions} onChange={(v) => setEditor({ ...editor, form: { ...editor.form, positions: v } })} disabled={lockedEditing} />
            </Field>
            {formError && <p className="error-text" role="alert">{formError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-ghost" onClick={() => setEditor(null)}>Cancel</button>
              <button className="btn-primary" disabled={busy}>{editing ? 'Save changes' : 'Create election'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default ElectionManager;
