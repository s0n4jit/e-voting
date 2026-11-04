import React, { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'react-hot-toast';
import {
  ArrowDownTrayIcon,
  ClipboardDocumentIcon,
  ComputerDesktopIcon,
  DocumentDuplicateIcon,
  KeyIcon,
  PlusIcon,
  TicketIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '../../api/adminApi';
import { EmptyState, PageHeader, TableSkeleton, errorMessage } from '../ui';
import { usePolling } from '../../hooks/usePolling';
import Modal from '../common/Modal';
import BoothGuide from './BoothGuide';
import StatusBadge from '../common/StatusBadge';

/** Voting booths and pre-generated slips management */
export const KioskManager = () => {
  const [booths, setBooths] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('booths'); // 'booths' | 'slips' | 'guide'
  const [issued, setIssued] = useState(null);

  // New Booth Setup Modal state
  const [setupBoothModalOpen, setSetupBoothModalOpen] = useState(false);
  const [newBoothNumber, setNewBoothNumber] = useState(1);
  const [newBoothVotes, setNewBoothVotes] = useState(100);
  const [nextBoothData, setNextBoothData] = useState(null);

  // Slips state
  const [slipsMetrics, setSlipsMetrics] = useState(null);
  const [slipsLoading, setSlipsLoading] = useState(false);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [targetBoothNumber, setTargetBoothNumber] = useState('all'); // 'all' | 1 | 2...
  const [slipCount, setSlipCount] = useState(50);
  const [generatingSlips, setGeneratingSlips] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const loadBooths = useCallback(() => {
    adminApi.getKiosks().then(setBooths).catch((e) => { toast.error(errorMessage(e)); setBooths([]); });
  }, []);

  const loadSlips = useCallback(async () => {
    setSlipsLoading(true);
    try {
      const data = await adminApi.getBoothSlipsMetrics();
      setSlipsMetrics(data);
    } catch (err) {
      // silent or fallback
    } finally {
      setSlipsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBooths();
    loadSlips();
  }, [loadBooths, loadSlips]);

  usePolling(loadBooths, 3000);
  usePolling(loadSlips, 4000);

  const openBoothSetupModal = async () => {
    try {
      const data = await adminApi.getNextAvailableBooth();
      setNextBoothData(data);
      setNewBoothNumber(data.next_booth_number || 1);
      setNewBoothVotes(100);
      setSetupBoothModalOpen(true);
    } catch {
      setNewBoothNumber(1);
      setNewBoothVotes(100);
      setSetupBoothModalOpen(true);
    }
  };

  const handleConfirmCreateBooth = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await adminApi.createBoothToken({
        booth_number: Number(newBoothNumber),
        slips_count: Number(newBoothVotes),
      });
      setSetupBoothModalOpen(false);
      setIssued(result);
      await loadBooths();
      await loadSlips();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to create booth token'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await adminApi.deleteKiosk(removing.id);
      toast.success(`${removing.booth_id} was deleted and signed out`);
      setRemoving(null);
      loadBooths();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Generate Slips handler
  const handleGenerateSlips = async (e) => {
    e.preventDefault();
    setGeneratingSlips(true);
    try {
      if (targetBoothNumber === 'all') {
        const res = await adminApi.generateAllBoothSlips(Number(slipCount));
        toast.success(res.message || `Generated ${res.total_created} slips across booths`);
      } else {
        const res = await adminApi.generateBoothSlips(Number(targetBoothNumber), Number(slipCount));
        toast.success(res.message || `Generated ${res.count_created} slips for Booth ${targetBoothNumber}`);
      }
      setGenerateModalOpen(false);
      await loadSlips();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to generate slips'));
    } finally {
      setGeneratingSlips(false);
    }
  };

  // Download Booth PDF
  const handleDownloadBoothPdf = async (boothNumber) => {
    setDownloadingPdf(true);
    try {
      const blob = await adminApi.downloadBoothSlipsPdf(boothNumber);
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `voting-slips-booth-${String(boothNumber).padStart(2, '0')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(`Booth ${boothNumber} slips PDF downloaded`);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to download PDF'));
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Download All Booths PDF
  const handleDownloadAllPdf = async () => {
    setDownloadingPdf(true);
    try {
      const blob = await adminApi.downloadAllSlipsPdf();
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `voting-slips-all-booths.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('All booths slips PDF downloaded');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to download PDF'));
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Voting booths & Slips"
        subtitle="Manage authorized voting booth terminals, pre-generated slips, and 4-digit PIN credentials."
        actions={
          tab === 'booths' ? (
            <button className="btn-primary" onClick={openBoothSetupModal} disabled={busy}>
              <KeyIcon className="w-4 h-4" /> Generate booth token
            </button>
          ) : tab === 'slips' ? (
            <div className="flex items-center gap-2">
              <button
                className="btn-secondary"
                disabled={downloadingPdf || !slipsMetrics?.total_generated}
                onClick={handleDownloadAllPdf}
              >
                <ArrowDownTrayIcon className="w-4 h-4" />
                <span>{downloadingPdf ? 'Building PDF…' : 'Download All Slips PDF'}</span>
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  setTargetBoothNumber('all');
                  setSlipCount(50);
                  setGenerateModalOpen(true);
                }}
              >
                <PlusIcon className="w-4 h-4" />
                <span>Generate Slips</span>
              </button>
            </div>
          ) : null
        }
      />

      <div className="flex gap-1 border-b border-line mb-6" role="tablist">
        {[
          ['booths', 'Booths'],
          ['slips', 'Pre-generated Slips'],
          ['guide', 'Setup guide'],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key ? 'border-brand text-brand-fg font-bold' : 'border-transparent text-muted hover:text-fg'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'guide' ? (
        <BoothGuide />
      ) : tab === 'slips' ? (
        /* Pre-generated Slips & Inventory */
        <div className="space-y-6 animate-fade-in">
          {/* Metrics summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Total Slips Generated</p>
              <p className="text-2xl font-black text-fg mt-1">{slipsMetrics?.total_generated ?? '—'}</p>
              <p className="text-[11px] text-muted mt-1">{slipsMetrics?.total_booths || 0} active booths</p>
            </div>

            <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ok">Used Slips (Votes Cast)</p>
              <p className="text-2xl font-black text-ok mt-1">{slipsMetrics?.total_used ?? '—'}</p>
              <p className="text-[11px] text-muted mt-1">{slipsMetrics?.completion_rate ?? 0}% completed</p>
            </div>

            <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
              <p className="text-[11px] font-bold uppercase tracking-wider text-brand">Unused Slips Remaining</p>
              <p className="text-2xl font-black text-brand mt-1">{slipsMetrics?.total_unused ?? '—'}</p>
              <p className="text-[11px] text-muted mt-1">Ready for voters</p>
            </div>

            <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Progress</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-fg">{slipsMetrics?.completion_rate ?? 0}%</span>
              </div>
              <div className="w-full bg-recessed rounded-full h-1.5 mt-2 overflow-hidden">
                <div
                  className="bg-brand h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, slipsMetrics?.completion_rate || 0)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Booths Slips Inventory Table */}
          <div className="card">
            <div className="px-5 py-4 border-b border-line flex items-center justify-between">
              <div>
                <h3 className="font-bold text-fg text-sm">Booth Slips Inventory & Sequences</h3>
                <p className="text-xs text-muted mt-0.5">
                  Sequential IDs advance automatically upon ballot submission. PINs never self-destruct on incorrect attempts.
                </p>
              </div>
            </div>

            {!slipsMetrics ? (
              <TableSkeleton rows={3} cols={6} />
            ) : slipsMetrics.booths?.length === 0 ? (
              <EmptyState icon={TicketIcon} title="No slips generated yet">
                Generate pre-issued slips for your voting booths before election day starts.
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Booth</th>
                      <th>Total Slips</th>
                      <th>Used</th>
                      <th>Remaining</th>
                      <th>Current Voting ID</th>
                      <th>Progress</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slipsMetrics.booths.map((b) => (
                      <tr key={b.booth_number}>
                        <td className="font-mono font-bold text-fg flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span>{b.booth_id}</span>
                        </td>
                        <td className="font-semibold">{b.total_slips}</td>
                        <td className="text-ok font-semibold">{b.used_slips}</td>
                        <td className="text-brand font-semibold">{b.unused_slips}</td>
                        <td>
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-recessed text-fg border border-line">
                            {b.current_voting_id}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-2 max-w-[120px]">
                            <div className="flex-1 bg-recessed rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-brand h-full rounded-full"
                                style={{ width: `${b.progress_rate}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-muted font-bold">{b.progress_rate}%</span>
                          </div>
                        </td>
                        <td className="text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleDownloadBoothPdf(b.booth_number)}
                              disabled={downloadingPdf || b.total_slips === 0}
                              className="btn-secondary btn-sm"
                              title={`Download PDF for ${b.booth_id}`}
                            >
                              <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                              <span>PDF</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setTargetBoothNumber(b.booth_number);
                                setSlipCount(50);
                                setGenerateModalOpen(true);
                              }}
                              className="btn-ghost btn-sm text-brand"
                              title="Add more slips to this booth"
                            >
                              <PlusIcon className="w-3.5 h-3.5" />
                              <span>Add</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Booths Hardware / Session List */
        <>
          <div className="card card-body mb-6 text-sm">
            <p className="font-medium">To set up a booth</p>
            <ol className="list-decimal pl-5 mt-2 space-y-1 text-muted">
              <li>Press <strong>Generate booth token</strong> here. The token works once and expires after 15 minutes.</li>
              <li>On the booth computer, open <span className="font-mono text-fg">/kiosk/vote</span>. It asks for the token and your current authenticator code.</li>
              <li>The booth gets its Booth ID automatically (BOOTH-01, BOOTH-02, …) and takes votes only while the election is in "Voting active".</li>
            </ol>
          </div>

          <div className="card">
            {!booths ? (
              <TableSkeleton rows={3} cols={4} />
            ) : booths.length === 0 ? (
              <EmptyState icon={ComputerDesktopIcon} title="No booths set up">
                Booths appear here as soon as they are set up.
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Booth ID</th>
                      <th>Election</th>
                      <th>Status</th>
                      <th>Set up</th>
                      <th>Last seen</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {booths.map((b) => (
                      <tr key={b.id}>
                        <td className="font-mono font-medium">{b.booth_id}</td>
                        <td className="max-w-[16rem] truncate">{b.election_title || '—'}</td>
                        <td>
                          <StatusBadge label={b.online ? 'Online' : 'Offline'} variant={b.online ? 'ok' : 'neutral'} />
                        </td>
                        <td>{b.created_at ? formatDistanceToNow(new Date(b.created_at), { addSuffix: true }) : '—'}</td>
                        <td>{b.last_heartbeat ? formatDistanceToNow(new Date(b.last_heartbeat), { addSuffix: true }) : '—'}</td>
                        <td className="text-right">
                          <button className="btn-ghost btn-sm text-bad" onClick={() => setRemoving(b)}>
                            <TrashIcon className="w-4 h-4" /> Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Configure New Voting Booth Modal */}
      <Modal
        isOpen={setupBoothModalOpen}
        onClose={() => setSetupBoothModalOpen(false)}
        title="Set up New Voting Booth"
      >
        <form onSubmit={handleConfirmCreateBooth} className="space-y-4">
          <p className="text-xs text-muted">
            Configure how many votes will be conducted at this booth and verify the allocated sequential slip ID range before generating the token.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-fg">Booth Number</label>
              <input
                type="number"
                min={1}
                max={99}
                value={newBoothNumber}
                onChange={(e) => setNewBoothNumber(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full px-3 py-2 rounded-xl border border-line bg-surface text-fg font-mono font-bold text-sm shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand/25"
                required
              />
              <p className="text-[11px] text-muted">Identifier: BOOTH-{String(newBoothNumber).padStart(2, '0')}</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-fg">Allocated Votes / Slips</label>
              <input
                type="number"
                min={10}
                max={2000}
                value={newBoothVotes}
                onChange={(e) => setNewBoothVotes(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full px-3 py-2 rounded-xl border border-line bg-surface text-fg font-mono font-bold text-sm shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand/25"
                required
              />
              <p className="text-[11px] text-muted">Votes planned for this booth</p>
            </div>
          </div>

          {/* Projected Slip Range Card */}
          <div className="p-4 rounded-xl bg-recessed/70 border border-line space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-muted uppercase tracking-wider text-[10px]">Allocated Slip Range</span>
              <span className="text-brand font-mono font-bold">{newBoothVotes} Slips</span>
            </div>
            <div className="flex items-center justify-between font-mono font-black text-sm text-fg bg-surface p-2.5 rounded-lg border border-line shadow-2xs">
              <div className="text-center">
                <span className="text-[10px] text-muted block uppercase">From Slip ID</span>
                <span className="text-brand text-base">{newBoothNumber}001</span>
              </div>
              <span className="text-muted">➔</span>
              <div className="text-center">
                <span className="text-[10px] text-muted block uppercase">To Slip ID</span>
                <span className="text-brand text-base">{newBoothNumber}{String(newBoothVotes).padStart(3, '0')}</span>
              </div>
            </div>
            <p className="text-[11px] text-muted">
              Voters at BOOTH-{String(newBoothNumber).padStart(2, '0')} will enter PINs for slips {newBoothNumber}001 through {newBoothNumber}{String(newBoothVotes).padStart(3, '0')} in strict sequence.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setSetupBoothModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="btn-primary"
            >
              {busy ? 'Configuring…' : 'Allocate Slips & Generate Token'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Generated Booth Token Modal */}
      <Modal isOpen={Boolean(issued)} onClose={() => setIssued(null)} title="Booth Token Ready">
        {issued && (
          <div className="space-y-4 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-brand-soft border border-brand/20 text-xs font-mono font-bold text-brand">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{issued.booth_id || `BOOTH-${String(issued.booth_number).padStart(2, '0')}`}</span>
            </div>

            <p className="text-xs text-muted">Enter this token on the booth machine for “{issued.election_title}”. Valid for 15 minutes.</p>

            <p className="font-mono text-4xl font-black tracking-widest select-all bg-recessed/60 py-3 rounded-xl border border-line text-brand">
              {issued.token}
            </p>

            {/* Allocated Slip Range Badge */}
            {issued.from_slip_id && (
              <div className="p-3 rounded-xl bg-surface border border-line text-xs font-mono space-y-1 text-left">
                <div className="flex justify-between text-muted text-[11px]">
                  <span>Allocated Slips:</span>
                  <span className="font-bold text-fg">{issued.slips_count || 100} votes</span>
                </div>
                <div className="flex justify-between font-bold text-fg">
                  <span>Voting ID Range:</span>
                  <span className="text-brand font-black">{issued.from_slip_id} ➔ {issued.to_slip_id}</span>
                </div>
              </div>
            )}

            <p className="text-[11px] text-muted">
              On the kiosk machine, open <span className="font-mono text-fg font-bold">/kiosk/vote</span>. Enter this token and your authenticator code.
            </p>

            <div className="flex justify-center gap-2 pt-1">
              <button
                className="btn-secondary"
                onClick={() => {
                  navigator.clipboard?.writeText(issued.token);
                  toast.success('Token copied to clipboard');
                }}
              >
                <ClipboardDocumentIcon className="w-4 h-4" /> Copy Token
              </button>
              <button className="btn-primary" onClick={() => setIssued(null)}>
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Booth Confirmation Modal */}
      <Modal isOpen={Boolean(removing)} onClose={() => setRemoving(null)} title={`Delete ${removing?.booth_id || 'booth'}?`}>
        <p className="text-sm text-muted">
          The booth is signed out immediately and can no longer take votes. To use that computer again, generate a new booth token and enter it, with your authenticator code, on that computer.
        </p>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-ghost" onClick={() => setRemoving(null)}>
            Cancel
          </button>
          <button className="btn-danger" disabled={busy} onClick={remove}>
            Delete booth
          </button>
        </div>
      </Modal>

      {/* Generate Slips Modal */}
      <Modal
        isOpen={generateModalOpen}
        onClose={() => setGenerateModalOpen(false)}
        title={targetBoothNumber === 'all' ? 'Generate Slips for All Booths' : `Generate Slips for Booth ${targetBoothNumber}`}
      >
        <form onSubmit={handleGenerateSlips} className="space-y-4">
          <p className="text-xs text-muted">
            Generates sequential voting IDs with cryptographically secure 4-digit PINs. Each slip is 1:1 linked with a voting ID and persists across all server restarts.
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-fg">Target Booth</label>
            <select
              value={targetBoothNumber}
              onChange={(e) => setTargetBoothNumber(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl border border-line bg-surface text-fg text-sm shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand/25"
            >
              <option value="all">All Booths (Distribute equally)</option>
              {(slipsMetrics?.booths || []).map((b) => (
                <option key={b.booth_number} value={b.booth_number}>
                  {b.booth_id} (Currently at {b.current_voting_id})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-fg">Number of Slips to Generate</label>
            <input
              type="number"
              min={1}
              max={1000}
              value={slipCount}
              onChange={(e) => setSlipCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full px-3 py-2 rounded-xl border border-line bg-surface text-fg text-sm shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand/25"
              required
            />
            <p className="text-[11px] text-muted">Recommended: 50–100 slips per booth.</p>
          </div>

          <div className="p-3 rounded-xl bg-recessed/60 border border-line text-xs text-muted space-y-1">
            <p className="font-bold text-fg">Secret Ballot Architecture:</p>
            <p>• IDs will be generated sequentially (e.g. 1001, 1002...).</p>
            <p>• PINs are 4 digits and verified via salted hash.</p>
            <p>• Plaintext PINs are only used to render downloadable A4 PDFs.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setGenerateModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={generatingSlips}
              className="btn-primary"
            >
              {generatingSlips ? 'Generating…' : 'Generate Credentials'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default KioskManager;
