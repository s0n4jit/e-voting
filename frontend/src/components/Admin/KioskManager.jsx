import React, { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'react-hot-toast';
import {
  ClipboardDocumentIcon,
  ComputerDesktopIcon,
  KeyIcon,
  TicketIcon,
  TrashIcon,
  CheckCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '../../api/adminApi';
import { EmptyState, PageHeader, TableSkeleton, errorMessage } from '../ui';
import { usePolling } from '../../hooks/usePolling';
import Modal from '../common/Modal';
import BoothGuide from './BoothGuide';
import StatusBadge from '../common/StatusBadge';

/** Voting booths management with pre-allotment settings during token generation. */
export const KioskManager = () => {
  const [booths, setBooths] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('booths'); // 'booths' | 'guide'

  // Booth Setup & Token Generation Modal State
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [setupOptions, setSetupOptions] = useState(null);
  const [selectedBooth, setSelectedBooth] = useState(1);
  const [slipsCount, setSlipsCount] = useState(50);
  const [fromSlipId, setFromSlipId] = useState('');
  const [toSlipId, setToSlipId] = useState('');

  // Generated Token Result Modal
  const [issued, setIssued] = useState(null);

  const loadBooths = useCallback(() => {
    adminApi.getKiosks().then(setBooths).catch((e) => {
      toast.error(errorMessage(e));
      setBooths([]);
    });
  }, []);

  useEffect(() => {
    loadBooths();
  }, [loadBooths]);

  usePolling(loadBooths, 3000);

  // Open the Setup Dialog and load booth options
  const handleOpenSetupModal = async () => {
    setBusy(true);
    try {
      const opts = await adminApi.getNextAvailableBooth();
      setSetupOptions(opts);
      const bNum = opts.next_booth_number || 1;
      setSelectedBooth(bNum);

      // Find slip summary for default booth
      const summary = (opts.available_slips_by_booth || []).find((s) => s.booth_number === bNum);
      if (summary && summary.unallotted_count > 0) {
        setSlipsCount(summary.unallotted_count);
        setFromSlipId(summary.first_unallotted_id || `${bNum}001`);
        setToSlipId(summary.last_unallotted_id || `${bNum}${String(summary.unallotted_count).padStart(3, '0')}`);
      } else {
        setSlipsCount(50);
        setFromSlipId(`${bNum}001`);
        setToSlipId(`${bNum}050`);
      }
      setSetupModalOpen(true);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to fetch booth setup options'));
    } finally {
      setBusy(false);
    }
  };

  // When booth selection changes in setup modal
  const handleBoothChange = (bNum) => {
    const num = Number(bNum);
    setSelectedBooth(num);
    const summary = (setupOptions?.available_slips_by_booth || []).find((s) => s.booth_number === num);
    if (summary && summary.unallotted_count > 0) {
      setSlipsCount(summary.unallotted_count);
      setFromSlipId(summary.first_unallotted_id || `${num}001`);
      setToSlipId(summary.last_unallotted_id || `${num}${String(summary.unallotted_count).padStart(3, '0')}`);
    } else {
      setSlipsCount(50);
      setFromSlipId(`${num}001`);
      setToSlipId(`${num}050`);
    }
  };

  // When slips count changes, automatically recalculate toSlipId
  const handleSlipsCountChange = (val) => {
    const count = Math.max(1, parseInt(val, 10) || 1);
    setSlipsCount(count);
    if (fromSlipId) {
      const startNum = parseInt(fromSlipId, 10);
      if (!isNaN(startNum)) {
        const endNum = startNum + count - 1;
        setToSlipId(String(endNum).padStart(fromSlipId.length, '0'));
      }
    }
  };

  const handleGenerateToken = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await adminApi.createBoothToken({
        booth_number: Number(selectedBooth),
        slips_count: Number(slipsCount),
        from_slip_id: fromSlipId.trim(),
        to_slip_id: toSlipId.trim(),
      });
      setSetupModalOpen(false);
      setIssued(res);
      await loadBooths();
      toast.success(
        `Booth token created for Booth ${res.booth_number}! Allotted ${res.slips_count} slips (${res.from_slip_id || '—'} to ${res.to_slip_id || '—'}).`
      );
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
      toast.success(`${removing.booth_id} was removed and unused slips were returned to pool`);
      setRemoving(null);
      loadBooths();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const currentSummary = (setupOptions?.available_slips_by_booth || []).find(
    (s) => s.booth_number === Number(selectedBooth)
  );

  return (
    <div>
      <PageHeader
        title="Voting booths"
        subtitle="Computers authorized to accept votes. Votes cannot be cast from anywhere else."
        actions={
          tab === 'booths' && (
            <button className="btn-primary" onClick={handleOpenSetupModal} disabled={busy}>
              <KeyIcon className="w-4 h-4" /> Setup new booth token
            </button>
          )
        }
      />

      <div className="flex gap-1 border-b border-line mb-6" role="tablist">
        {[
          ['booths', 'Booths'],
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
      ) : (
        <>
          <div className="card card-body mb-6 text-sm">
            <p className="font-medium text-fg">To set up a booth machine</p>
            <ol className="list-decimal pl-5 mt-2 space-y-1 text-muted">
              <li>
                Click <strong>Setup new booth token</strong> to choose the Booth Number, configure how many votes will be accepted, and select the slip ID range.
              </li>
              <li>
                At the time of token generation, those slips are <strong>immediately allotted</strong> to this booth.
              </li>
              <li>
                On the booth computer, navigate to <span className="font-mono text-fg font-semibold">/kiosk/vote</span>. Enter the one-time token and your authenticator code.
              </li>
              <li>
                The terminal unlocks and begins voting with its assigned slips!
              </li>
            </ol>
          </div>

          <div className="card">
            {!booths ? (
              <TableSkeleton rows={3} cols={6} />
            ) : booths.length === 0 ? (
              <EmptyState icon={ComputerDesktopIcon} title="No booths set up">
                Click <strong>Setup new booth token</strong> above to configure and authorize your first voting booth.
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Booth ID</th>
                      <th>Election</th>
                      <th>Allotted Slips</th>
                      <th>Voting Progress</th>
                      <th>Status</th>
                      <th>Last Seen</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {booths.map((b) => (
                      <tr key={b.id}>
                        <td className="font-mono font-bold text-fg">
                          <span className="px-2 py-1 rounded bg-recessed border border-line text-brand">
                            {b.booth_id}
                          </span>
                        </td>
                        <td className="max-w-[14rem] truncate">{b.election_title || '—'}</td>
                        <td>
                          {b.allotted_count > 0 ? (
                            <div className="text-xs">
                              <span className="font-semibold text-fg">{b.allotted_count} slips</span>
                              <span className="text-muted block font-mono text-[11px]">
                                {b.from_slip_id} – {b.to_slip_id}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted">No slips allotted</span>
                          )}
                        </td>
                        <td>
                          <div className="text-xs space-y-1">
                            <div className="flex items-center justify-between gap-2 text-muted">
                              <span>{b.used_count || 0} cast</span>
                              <span>{b.remaining_count || 0} left</span>
                            </div>
                            <div className="w-24 h-1.5 rounded-full bg-recessed overflow-hidden">
                              <div
                                className="h-full bg-brand transition-all"
                                style={{
                                  width: `${
                                    b.allotted_count > 0
                                      ? Math.min(100, Math.round(((b.used_count || 0) / b.allotted_count) * 100))
                                      : 0
                                  }%`,
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td>
                          {!b.is_active ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                              <ClockIcon className="w-3.5 h-3.5" />
                              <span>Pending Activation</span>
                            </span>
                          ) : (
                            <StatusBadge
                              label={b.online ? 'Online' : 'Offline'}
                              variant={b.online ? 'ok' : 'neutral'}
                            />
                          )}
                        </td>
                        <td className="text-xs text-muted">
                          {b.last_heartbeat ? formatDistanceToNow(new Date(b.last_heartbeat), { addSuffix: true }) : 'Never'}
                        </td>
                        <td className="text-right">
                          <button
                            className="btn-ghost btn-sm text-bad"
                            onClick={() => setRemoving(b)}
                            title="Delete and revoke booth"
                          >
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

      {/* Setup Booth & Generate Token Modal */}
      <Modal
        isOpen={setupModalOpen}
        onClose={() => setSetupModalOpen(false)}
        title="Setup Voting Booth & Allot Slips"
      >
        <form onSubmit={handleGenerateToken} className="space-y-4">
          <p className="text-xs text-muted">
            Configure the booth terminal settings. Slips will be <strong>allotted to this booth machine immediately</strong> upon token generation.
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-fg">Booth Machine</label>
            <select
              value={selectedBooth}
              onChange={(e) => handleBoothChange(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-line bg-surface text-fg text-sm shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand/25"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
                <option key={num} value={num}>
                  Booth {num} (BOOTH-{String(num).padStart(2, '0')})
                </option>
              ))}
            </select>
          </div>

          {/* Slip Availability Notice */}
          <div className="p-3 rounded-xl bg-recessed/60 border border-line text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-fg">Slip Inventory for Booth {selectedBooth}:</span>
              <span className="font-mono text-brand font-bold">
                {currentSummary?.unallotted_count || 0} unallotted
              </span>
            </div>
            {currentSummary && currentSummary.unallotted_count > 0 ? (
              <p className="text-ok flex items-center gap-1 font-medium">
                <CheckCircleIcon className="w-4 h-4 shrink-0" />
                Available unallotted range: {currentSummary.first_unallotted_id} to {currentSummary.last_unallotted_id}
              </p>
            ) : (
              <p className="text-amber-500 font-medium">
                ℹ️ No unallotted slips exist for Booth {selectedBooth}. Generating the token will automatically create fresh slips and allot them.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-fg">
              How many votes will be done here? (Slip Count)
            </label>
            <input
              type="number"
              min={1}
              max={1500}
              value={slipsCount}
              onChange={(e) => handleSlipsCountChange(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-line bg-surface text-fg text-sm shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand/25"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-fg">From Slip ID</label>
              <input
                type="text"
                value={fromSlipId}
                onChange={(e) => setFromSlipId(e.target.value)}
                placeholder={`${selectedBooth}001`}
                className="w-full px-3 py-2 rounded-xl border border-line bg-surface text-fg font-mono text-sm shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand/25"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-fg">To Slip ID</label>
              <input
                type="text"
                value={toSlipId}
                onChange={(e) => setToSlipId(e.target.value)}
                placeholder={`${selectedBooth}050`}
                className="w-full px-3 py-2 rounded-xl border border-line bg-surface text-fg font-mono text-sm shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand/25"
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-line">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setSetupModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={busy}
            >
              <KeyIcon className="w-4 h-4" />
              <span>Generate Token & Allot Slips</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Token Ready Result Modal */}
      <Modal isOpen={Boolean(issued)} onClose={() => setIssued(null)} title="Booth Token Ready">
        {issued && (
          <div className="space-y-4 text-center">
            <div className="p-3 rounded-xl bg-ok-soft/30 border border-ok/20 text-xs text-ok font-medium">
              ✓ Slips allotted: <strong>{issued.slips_count} votes</strong> ({issued.from_slip_id} – {issued.to_slip_id}) assigned to <strong>{issued.booth_id}</strong>
            </div>

            <p className="text-xs text-muted">
              Enter this token on the booth computer for “{issued.election_title}”. Valid for 15 minutes.
            </p>
            <p className="font-mono text-4xl font-black tracking-widest select-all bg-recessed/60 py-3 rounded-xl border border-line text-brand">
              {issued.token}
            </p>
            <p className="text-xs text-muted">
              On the booth machine, open <span className="font-mono text-fg font-semibold">/kiosk/vote</span>. Enter this token and your 6-digit authenticator code.
            </p>
            <div className="flex justify-center gap-2 pt-1">
              <button
                className="btn-secondary"
                onClick={() => {
                  navigator.clipboard?.writeText(issued.token);
                  toast.success('Token copied to clipboard');
                }}
              >
                <ClipboardDocumentIcon className="w-4 h-4" /> Copy
              </button>
              <button className="btn-primary" onClick={() => setIssued(null)}>
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Booth Confirmation Modal */}
      <Modal
        isOpen={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Delete ${removing?.booth_id || 'booth'}?`}
      >
        <p className="text-sm text-muted">
          The booth is signed out immediately. Any unused slips allotted to this booth will be unallotted and returned to the pool for re-assignment.
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
    </div>
  );
};

export default KioskManager;
