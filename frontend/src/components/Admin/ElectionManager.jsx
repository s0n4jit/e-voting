import React, { useCallback, useEffect, useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ArrowDownTrayIcon, PlayIcon, PlusIcon, PresentationChartBarIcon, RectangleStackIcon, StopIcon, XMarkIcon } from '@heroicons/react/24/outline';
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

  // Mock Election state
  const [mockStatus, setMockStatus] = useState(null);
  const [mockModalOpen, setMockModalOpen] = useState(false);
  const [availableKiosks, setAvailableKiosks] = useState([]);
  const [mockConfig, setMockConfig] = useState({
    booth_numbers: [1],
    slip_count: 10,
    candidate_mode: 'real',
  });

  const loadMockStatus = useCallback(async () => {
    try {
      const res = await adminApi.getMockStatus();
      setMockStatus(res);
    } catch {
      setMockStatus(null);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const [data, mStatus] = await Promise.all([
        adminApi.getElections(),
        adminApi.getMockStatus().catch(() => null),
      ]);
      setElections(Array.isArray(data) ? data : data.elections || []);
      if (mStatus) setMockStatus(mStatus);
    } catch (err) {
      toast.error(errorMessage(err));
      setElections([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Polling keeps list and mock status updated
  usePolling(() => {
    adminApi.getElections().then((d) => setElections(Array.isArray(d) ? d : d.elections || [])).catch(() => {});
    loadMockStatus();
  }, 2000);

  const move = async (election, status) => {
    if (mockStatus?.is_running) {
      toast.error('Mock election is currently active. The official election is locked in its current stage until the mock run is ended.');
      setConfirm(null);
      return;
    }
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
      if (mockStatus?.is_running || election.is_mock) {
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

  const openMockModal = async () => {
    setBusy(true);
    try {
      const kiosksRes = await adminApi.getKiosks();
      const list = Array.isArray(kiosksRes) ? kiosksRes : kiosksRes?.kiosks || [];
      setAvailableKiosks(list);
      const defaultBooths = list.length > 0 ? [list[0].number || 1] : [1];
      setMockConfig({
        booth_numbers: defaultBooths,
        slip_count: 10,
        candidate_mode: 'real',
      });
      setMockModalOpen(true);
    } catch (err) {
      toast.error('Failed to load booth machines: ' + errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleLaunchMock = async (e) => {
    e.preventDefault();
    if (!mockConfig.booth_numbers || mockConfig.booth_numbers.length === 0) {
      toast.error('Select at least one booth machine for the mock run.');
      return;
    }
    setBusy(true);
    try {
      const targetElection = (elections || []).find((el) => el.status !== 'archived') || elections?.[0];
      await adminApi.startMock(targetElection?.id, mockConfig);
      toast.success(`Mock run started on Booth ${mockConfig.booth_numbers.join(', ')} with ${mockConfig.slip_count} slips.`);
      setMockModalOpen(false);
      window.dispatchEvent(new CustomEvent('election-state-change'));
      await load();
      await loadMockStatus();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const endMock = async (target) => {
    setBusy(true);
    try {
      const id = target?.id || mockStatus?.mock?.id;
      await adminApi.endMock(id);
      toast.success('Mock run ended. Booths restored to official election.');
      window.dispatchEvent(new CustomEvent('election-state-change'));
      setMockEnding(null);
      setResetWord('');
      await load();
      await loadMockStatus();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const downloadMockSlips = async () => {
    try {
      const mockId = mockStatus?.mock?.id;
      if (!mockId) {
        toast.error('No active mock election found to download slips.');
        return;
      }
      const blob = await adminApi.downloadAllSlipsPdf(mockId);
      saveBlob(blob, `mock-voting-slips-election-${mockId}.pdf`);
      toast.success('Mock voter slips downloaded');
    } catch (err) {
      toast.error('Failed to download mock slips: ' + errorMessage(err));
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

  const busyElection = (elections || []).some((e) => !e.is_mock && e.status !== 'archived');
  const editing = editor?.election;
  const lockedEditing = editing && ORDER.indexOf(editing.status) >= ORDER.indexOf('ready');
  const displayElections = (elections || []).filter((e) => !e.is_mock);

  return (
    <div>
      <PageHeader
        title="Elections"
        subtitle="One election runs at a time. Archive it to start the next."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {mockStatus?.is_running ? (
              <button
                type="button"
                className="btn-danger flex items-center gap-1.5"
                onClick={() => { setMockEnding(mockStatus.mock); setResetWord(''); }}
                disabled={busy}
              >
                <StopIcon className="w-4 h-4" /> End mock election
              </button>
            ) : (
              <button
                type="button"
                className="btn-secondary flex items-center gap-1.5"
                onClick={openMockModal}
                disabled={busy || !displayElections.some((e) => e.status !== 'archived')}
                title={!displayElections.some((e) => e.status !== 'archived') ? 'Create an election first' : 'Run a mock dry run before official voting'}
              >
                <PlayIcon className="w-4 h-4" /> Start mock election
              </button>
            )}
            <button
              className="btn-primary flex items-center gap-1"
              onClick={() => openEditor(null)}
              disabled={busyElection}
              title={busyElection ? 'Only one election can run at a time. Archive the current one first.' : undefined}
            >
              <PlusIcon className="w-4 h-4" /> New election
            </button>
          </div>
        }
      />

      {mockStatus?.is_running && (
        <div className="mb-5 p-4 rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-slide-up shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-amber-200 text-amber-900 border border-amber-300 dark:bg-amber-500/25 dark:text-amber-300 dark:border-amber-500/40">
                Mock Run In Progress
              </span>
              <span className="font-bold text-amber-950 dark:text-white">
                Active on Booth {mockStatus.mock.booth_numbers?.join(', ') || '1'}
              </span>
            </div>
            <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed font-medium">
              {mockStatus.mock.slips_total} mock slips generated ({mockStatus.mock.slips_used} used, {mockStatus.mock.slips_remaining} remaining).
              <span className="text-amber-950 dark:text-white font-bold ml-1">Real election slips, candidates, and setup remain completely separate and safe.</span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Link
              to={`/admin/results?election=${mockStatus.mock.id}`}
              className="btn-secondary btn-sm flex items-center gap-1.5 text-amber-950 bg-white hover:bg-amber-100 border border-amber-300 font-semibold shadow-sm dark:text-white dark:bg-amber-500/20 dark:hover:bg-amber-500/30 dark:border-amber-500/40"
              title="Preview live tally and charts for this mock run"
            >
              <PresentationChartBarIcon className="w-4 h-4 text-amber-700 dark:text-amber-300" /> View Mock Results
            </Link>
            <button
              type="button"
              className="btn-secondary btn-sm flex items-center gap-1.5 text-amber-950 bg-white hover:bg-amber-100 border border-amber-300 font-semibold shadow-sm dark:text-white dark:bg-amber-500/20 dark:hover:bg-amber-500/30 dark:border-amber-500/40"
              onClick={downloadMockSlips}
            >
              <ArrowDownTrayIcon className="w-4 h-4 text-amber-700 dark:text-amber-300" /> Download Mock Slips (PDF)
            </button>
            <button
              type="button"
              className="btn-danger btn-sm flex items-center gap-1.5"
              onClick={() => { setMockEnding(mockStatus.mock); setResetWord(''); }}
            >
              <StopIcon className="w-4 h-4" /> End mock & reset
            </button>
          </div>
        </div>
      )}

      {!elections ? (
        <div className="card"><TableSkeleton rows={3} cols={3} /></div>
      ) : displayElections.length === 0 ? (
        <div className="card">
          <EmptyState icon={RectangleStackIcon} title="No elections yet" action={<button className="btn-primary" onClick={() => openEditor(null)}>Create election</button>}>
            Create your first election to define positions and open registration.
          </EmptyState>
        </div>
      ) : (
        <div className="space-y-4">
          {displayElections.map((e) => {
            const next = NEXT[e.status];
            const idx = ORDER.indexOf(e.status);
            return (
              <article key={e.id} className="card card-body animate-slide-up">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="font-semibold text-lg">{e.title}</h2>
                      <StatusBadge label={e.status_label} />
                      {mockStatus?.is_running && (
                        <span className="text-xs px-2 py-0.5 rounded font-medium bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40">
                          Locked during mock run
                        </span>
                      )}
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
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => move(e, ORDER[idx - 1])}
                        disabled={busy || mockStatus?.is_running}
                        title={mockStatus?.is_running ? 'Official election is locked during mock run' : undefined}
                      >
                        Back a stage
                      </button>
                    )}
                    {e.status === 'voting_active' && (
                      <button className="btn-secondary btn-sm" disabled={busy} onClick={() => pauseResume(e)}>
                        {e.voting_paused ? 'Resume voting' : 'Pause voting'}
                      </button>
                    )}
                    {next && (
                      <button
                        className={`btn-primary btn-sm ${mockStatus?.is_running ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={busy || mockStatus?.is_running}
                        onClick={() => (next[2] ? setConfirm({ election: e, next }) : move(e, next[0]))}
                        title={mockStatus?.is_running ? 'Mock election is currently active. Official election cannot be moved or modified until mock run ends.' : undefined}
                      >
                        {next[1]}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-line">
                  <Link to={`/admin/candidates?election=${e.id}`} className="btn-secondary btn-sm">Candidates</Link>
                  {ORDER.indexOf(e.status) < ORDER.indexOf('ready') ? (
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => openEditor(e)}
                      disabled={mockStatus?.is_running}
                      title={mockStatus?.is_running ? 'Official election details cannot be edited during a mock run' : undefined}
                    >
                      Edit details
                    </button>
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
              This will purge all mock ballots, mock tokens, and mock slips, restoring assigned booth machines back to the official election.
            </p>
            <p className="text-xs text-muted">
              Official election voter slips and real candidate setup are 100% safe and will NOT be touched.
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

      <Modal isOpen={mockModalOpen} onClose={() => setMockModalOpen(false)} title="Start Mock Election Run" maxWidth="max-w-lg">
        <form onSubmit={handleLaunchMock} className="space-y-5">
          <p className="text-sm text-muted">
            Conduct a dry run 30 minutes before official voting starts. This generates isolated mock slips for testing booth hardware. Official election slips and candidates remain completely untouched.
          </p>

          <Field label="Target Booth Machine(s)" hint="Select which booth(s) will participate in the mock run. Usually 1 or 2 booths are tested.">
            <div className="space-y-2 mt-1">
              {availableKiosks.length === 0 ? (
                <label className="flex items-center gap-2 p-2.5 rounded-lg border border-line bg-surface/50 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mockConfig.booth_numbers.includes(1)}
                    onChange={(e) => {
                      setMockConfig({
                        ...mockConfig,
                        booth_numbers: e.target.checked ? [1] : [],
                      });
                    }}
                    className="rounded text-primary focus:ring-primary"
                  />
                  <span>Booth 1 (Default kiosk)</span>
                </label>
              ) : (
                availableKiosks.map((k) => {
                  const bNum = k.number || 1;
                  const isChecked = mockConfig.booth_numbers.includes(bNum);
                  return (
                    <label key={k.id || bNum} className="flex items-center justify-between p-2.5 rounded-lg border border-line bg-surface/50 hover:bg-surface text-sm cursor-pointer transition">
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const cur = new Set(mockConfig.booth_numbers);
                            if (e.target.checked) cur.add(bNum);
                            else cur.delete(bNum);
                            setMockConfig({ ...mockConfig, booth_numbers: Array.from(cur) });
                          }}
                          className="rounded text-primary focus:ring-primary"
                        />
                        <span className="font-medium">Booth {bNum}</span>
                        <span className="text-xs text-muted font-mono">({k.device_name || k.booth_id})</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded ${k.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-500/10 text-muted'}`}>
                        {k.is_active ? 'Online' : 'Offline'}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </Field>

          <Field label="Number of Mock Voter Slips" hint="Separate slips prefixed with MOCK- to test sequential voting at the booth.">
            <input
              type="number"
              min="1"
              max="100"
              required
              className="input"
              value={mockConfig.slip_count}
              onChange={(e) => setMockConfig({ ...mockConfig, slip_count: parseInt(e.target.value, 10) || 10 })}
            />
          </Field>

          <Field label="Candidate Roster">
            <div className="space-y-2 mt-1">
              <label className="flex items-start gap-3 p-3 rounded-lg border border-line bg-surface/50 hover:bg-surface cursor-pointer transition">
                <input
                  type="radio"
                  name="candidate_mode"
                  value="real"
                  checked={mockConfig.candidate_mode === 'real'}
                  onChange={() => setMockConfig({ ...mockConfig, candidate_mode: 'real' })}
                  className="mt-1 text-primary focus:ring-primary"
                />
                <div>
                  <div className="text-sm font-semibold flex items-center gap-2">
                    Official Election Candidates
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                      Recommended
                    </span>
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    Clone current election candidates, photos, positions, departments, and bios into the mock dry run.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg border border-line bg-surface/50 hover:bg-surface cursor-pointer transition">
                <input
                  type="radio"
                  name="candidate_mode"
                  value="demo"
                  checked={mockConfig.candidate_mode === 'demo'}
                  onChange={() => setMockConfig({ ...mockConfig, candidate_mode: 'demo' })}
                  className="mt-1 text-primary focus:ring-primary"
                />
                <div>
                  <div className="text-sm font-medium">Demo Candidates (Politicians / Sample)</div>
                  <div className="text-xs text-muted mt-0.5">
                    Use pre-configured sample candidates (Narendra Modi, Donald Trump, Barack Obama, Sarah Chen, Vikram Malhotra).
                  </div>
                </div>
              </label>
            </div>
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <button type="button" className="btn-ghost" onClick={() => setMockModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy || mockConfig.booth_numbers.length === 0}>
              {busy ? 'Launching...' : 'Launch Mock Run'}
            </button>
          </div>
        </form>
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
