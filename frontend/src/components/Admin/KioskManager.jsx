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
  ArrowPathIcon,
  AdjustmentsHorizontalIcon,
  ShieldExclamationIcon,
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

  // Manage Slips Modal State
  const [manageSlipsBooth, setManageSlipsBooth] = useState(null);
  const [manageSlipsCount, setManageSlipsCount] = useState(50);
  const [manageFromSlipId, setManageFromSlipId] = useState('');
  const [manageToSlipId, setManageToSlipId] = useState('');

  // Revoke Confirmation State
  const [revokingBooth, setRevokingBooth] = useState(null);

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
    setSlipsCount(val);
    if (val === '') return;
    const count = parseInt(val, 10);
    if (!isNaN(count) && count > 0) {
      const startNum = parseInt(fromSlipId, 10);
      if (!isNaN(startNum)) {
        const endNum = startNum + count - 1;
        setToSlipId(String(endNum).padStart(fromSlipId.length, '0'));
      }
    }
  };

  const handleSlipsCountBlur = () => {
    const count = Math.max(1, parseInt(slipsCount, 10) || 1);
    setSlipsCount(count);
    const startNum = parseInt(fromSlipId, 10);
    if (!isNaN(startNum)) {
      const endNum = startNum + count - 1;
      setToSlipId(String(endNum).padStart(fromSlipId.length, '0'));
    }
  };

  // When fromSlipId changes: update fromSlipId, and automatch toSlipId or slipsCount
  const handleFromSlipIdChange = (val) => {
    setFromSlipId(val);
    const fromNum = parseInt(val, 10);
    const toNum = parseInt(toSlipId, 10);
    if (!isNaN(fromNum) && val.trim().length >= 3) {
      if (!isNaN(toNum) && toNum >= fromNum) {
        const newCount = toNum - fromNum + 1;
        setSlipsCount(newCount);
      } else {
        const count = parseInt(slipsCount, 10) || 1;
        setToSlipId(String(fromNum + count - 1).padStart(val.length, '0'));
      }
    }
  };

  const handleFromSlipIdBlur = () => {
    const fromNum = parseInt(fromSlipId, 10);
    const toNum = parseInt(toSlipId, 10);
    if (isNaN(fromNum)) {
      const fallbackFrom = `${selectedBooth}001`;
      setFromSlipId(fallbackFrom);
      const count = Math.max(1, parseInt(slipsCount, 10) || 1);
      setToSlipId(String(parseInt(fallbackFrom, 10) + count - 1).padStart(fallbackFrom.length, '0'));
    } else if (!isNaN(toNum) && toNum >= fromNum) {
      setSlipsCount(toNum - fromNum + 1);
    } else {
      const count = Math.max(1, parseInt(slipsCount, 10) || 1);
      setToSlipId(String(fromNum + count - 1).padStart(fromSlipId.length, '0'));
    }
  };

  // When toSlipId changes: update toSlipId, and automatch slipsCount
  const handleToSlipIdChange = (val) => {
    setToSlipId(val);
    const toNum = parseInt(val, 10);
    const fromNum = parseInt(fromSlipId, 10);
    if (!isNaN(toNum) && !isNaN(fromNum) && toNum >= fromNum) {
      const newCount = toNum - fromNum + 1;
      setSlipsCount(newCount);
    }
  };

  const handleToSlipIdBlur = () => {
    const toNum = parseInt(toSlipId, 10);
    const fromNum = parseInt(fromSlipId, 10);
    if (isNaN(toNum) || isNaN(fromNum) || toNum < fromNum) {
      const startNum = !isNaN(fromNum) ? fromNum : parseInt(`${selectedBooth}001`, 10);
      const count = Math.max(1, parseInt(slipsCount, 10) || 1);
      const endNum = startNum + count - 1;
      setToSlipId(String(endNum).padStart(fromSlipId?.length || 4, '0'));
    } else {
      setSlipsCount(toNum - fromNum + 1);
    }
  };

  const handleGenerateToken = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const finalCount = Math.max(1, parseInt(slipsCount, 10) || 1);
      const res = await adminApi.createBoothToken({
        booth_number: Number(selectedBooth),
        slips_count: finalCount,
        from_slip_id: String(fromSlipId).trim(),
        to_slip_id: String(toSlipId).trim(),
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

  // Open Manage Slips Modal for an existing booth
  const openManageSlipsModal = (booth) => {
    setManageSlipsBooth(booth);
    const count = booth.allotted_count || 50;
    setManageSlipsCount(count);
    const bNum = booth.booth_number || booth.number || (booth.booth_id ? parseInt(booth.booth_id.replace(/\D/g, ''), 10) : 1) || 1;
    setManageFromSlipId(booth.from_slip_id || `${bNum}001`);
    setManageToSlipId(booth.to_slip_id || `${bNum}${String(count).padStart(3, '0')}`);
  };

  const handleManageSlipsCountChange = (val) => {
    setManageSlipsCount(val);
    if (val === '') return;
    const count = parseInt(val, 10);
    if (!isNaN(count) && count > 0) {
      const startNum = parseInt(manageFromSlipId, 10);
      if (!isNaN(startNum)) {
        const endNum = startNum + count - 1;
        setManageToSlipId(String(endNum).padStart(manageFromSlipId.length, '0'));
      }
    }
  };

  const handleManageSlipsCountBlur = () => {
    const count = Math.max(1, parseInt(manageSlipsCount, 10) || 1);
    setManageSlipsCount(count);
    const startNum = parseInt(manageFromSlipId, 10);
    if (!isNaN(startNum)) {
      const endNum = startNum + count - 1;
      setManageToSlipId(String(endNum).padStart(manageFromSlipId.length, '0'));
    }
  };

  const handleManageFromSlipIdChange = (val) => {
    setManageFromSlipId(val);
    const fromNum = parseInt(val, 10);
    const toNum = parseInt(manageToSlipId, 10);
    if (!isNaN(fromNum) && val.trim().length >= 3) {
      if (!isNaN(toNum) && toNum >= fromNum) {
        setManageSlipsCount(toNum - fromNum + 1);
      } else {
        const count = parseInt(manageSlipsCount, 10) || 1;
        setManageToSlipId(String(fromNum + count - 1).padStart(val.length, '0'));
      }
    }
  };

  const handleManageFromSlipIdBlur = () => {
    const fromNum = parseInt(manageFromSlipId, 10);
    const toNum = parseInt(manageToSlipId, 10);
    if (isNaN(fromNum)) {
      const bNum = manageSlipsBooth?.booth_number || manageSlipsBooth?.number || (manageSlipsBooth?.booth_id ? parseInt(manageSlipsBooth.booth_id.replace(/\D/g, ''), 10) : 1) || 1;
      const fallback = `${bNum}001`;
      setManageFromSlipId(fallback);
      const count = Math.max(1, parseInt(manageSlipsCount, 10) || 1);
      setManageToSlipId(String(parseInt(fallback, 10) + count - 1).padStart(fallback.length, '0'));
    } else if (!isNaN(toNum) && toNum >= fromNum) {
      setManageSlipsCount(toNum - fromNum + 1);
    } else {
      const count = Math.max(1, parseInt(manageSlipsCount, 10) || 1);
      setManageToSlipId(String(fromNum + count - 1).padStart(manageFromSlipId.length, '0'));
    }
  };

  const handleManageToSlipIdChange = (val) => {
    setManageToSlipId(val);
    const toNum = parseInt(val, 10);
    const fromNum = parseInt(manageFromSlipId, 10);
    if (!isNaN(toNum) && !isNaN(fromNum) && toNum >= fromNum) {
      setManageSlipsCount(toNum - fromNum + 1);
    }
  };

  const handleManageToSlipIdBlur = () => {
    const toNum = parseInt(manageToSlipId, 10);
    const fromNum = parseInt(manageFromSlipId, 10);
    if (isNaN(toNum) || isNaN(fromNum) || toNum < fromNum) {
      const bNum = manageSlipsBooth?.booth_number || manageSlipsBooth?.number || (manageSlipsBooth?.booth_id ? parseInt(manageSlipsBooth.booth_id.replace(/\D/g, ''), 10) : 1) || 1;
      const startNum = !isNaN(fromNum) ? fromNum : parseInt(`${bNum}001`, 10);
      const count = Math.max(1, parseInt(manageSlipsCount, 10) || 1);
      setManageToSlipId(String(startNum + count - 1).padStart(manageFromSlipId?.length || 4, '0'));
    } else {
      setManageSlipsCount(toNum - fromNum + 1);
    }
  };

  const handleSaveManageSlips = async (e) => {
    e.preventDefault();
    if (!manageSlipsBooth) return;
    setBusy(true);
    try {
      const finalCount = Math.max(1, parseInt(manageSlipsCount, 10) || 1);
      const res = await adminApi.manageKioskSlips(manageSlipsBooth.id, {
        action: 'update',
        slips_count: finalCount,
        from_slip_id: String(manageFromSlipId).trim(),
        to_slip_id: String(manageToSlipId).trim(),
      });
      toast.success(res.message || 'Slips allotment updated successfully');
      setManageSlipsBooth(null);
      await loadBooths();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to update slips allotment'));
    } finally {
      setBusy(false);
    }
  };

  const handleReturnUnusedSlips = async () => {
    if (!manageSlipsBooth) return;
    setBusy(true);
    try {
      const res = await adminApi.manageKioskSlips(manageSlipsBooth.id, { action: 'return_unused' });
      toast.success(res.message || 'Returned unused slips to pool');
      setManageSlipsBooth(null);
      await loadBooths();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to return slips'));
    } finally {
      setBusy(false);
    }
  };

  // Revoke active session on terminal and get fresh setup token
  const handleExecuteRevoke = async () => {
    if (!revokingBooth) return;
    setBusy(true);
    try {
      const res = await adminApi.revokeKiosk(revokingBooth.id);
      toast.success(res.message || `Session revoked for ${revokingBooth.booth_id}`);
      setRevokingBooth(null);
      setIssued(res);
      await loadBooths();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to revoke booth session'));
    } finally {
      setBusy(false);
    }
  };

  // Retrieve current setup token + TOTP for a booth
  const handleGetSetupCode = async (booth) => {
    setBusy(true);
    try {
      const res = await adminApi.getKioskSetupToken(booth.id);
      setIssued(res);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to fetch setup code'));
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
                        <td className="text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              className="btn-ghost btn-sm text-brand"
                              onClick={() => openManageSlipsModal(b)}
                              title="Manage and adjust slip allotment for this booth"
                            >
                              <AdjustmentsHorizontalIcon className="w-4 h-4" /> Slips
                            </button>

                            <button
                              className="btn-ghost btn-sm text-fg"
                              onClick={() => handleGetSetupCode(b)}
                              title="Get setup token and TOTP code for this booth"
                            >
                              <KeyIcon className="w-4 h-4" /> Code
                            </button>

                            <button
                              className="btn-ghost btn-sm text-amber-500 hover:text-amber-600"
                              onClick={() => setRevokingBooth(b)}
                              title="Revoke active session on terminal and return unused slips to pool"
                            >
                              <ArrowPathIcon className="w-4 h-4" /> Revoke
                            </button>

                            <button
                              className="btn-ghost btn-sm text-bad"
                              onClick={() => setRemoving(b)}
                              title="Permanently delete booth terminal"
                            >
                              <TrashIcon className="w-4 h-4" /> Delete
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
              onBlur={handleSlipsCountBlur}
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
                onChange={(e) => handleFromSlipIdChange(e.target.value)}
                onBlur={handleFromSlipIdBlur}
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
                onChange={(e) => handleToSlipIdChange(e.target.value)}
                onBlur={handleToSlipIdBlur}
                placeholder={`${selectedBooth}050`}
                className="w-full px-3 py-2 rounded-xl border border-line bg-surface text-fg font-mono text-sm shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand/25"
                required
              />
            </div>
          </div>
          <p className="text-[11px] text-muted flex items-center justify-between">
            <span>Range matches slip count automatically.</span>
            <span className="font-mono font-medium text-brand">
              {fromSlipId && toSlipId ? `${fromSlipId} – ${toSlipId} (${Math.max(1, parseInt(slipsCount, 10) || 1)} slips)` : ''}
            </span>
          </p>

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
            {issued.slips_count > 0 && (
              <div className="p-3 rounded-xl bg-ok-soft/30 border border-ok/20 text-xs text-ok font-medium">
                ✓ Slips allotted: <strong>{issued.slips_count} votes</strong> ({issued.from_slip_id || '—'} to {issued.to_slip_id || '—'}) assigned to <strong>{issued.booth_id}</strong>
              </div>
            )}

            <p className="text-xs text-muted">
              Enter this token on the booth computer for “{issued.election_title}”. Valid for 15 minutes.
            </p>
            <p className="font-mono text-4xl font-black tracking-widest select-all bg-recessed/60 py-3 rounded-xl border border-line text-brand">
              {issued.token}
            </p>
            <p className="text-xs text-muted">
              On the booth machine, enter this token and your 6-digit code from your authenticator app.
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

      {/* Manage Slips Allotment Modal (Post-Setup) */}
      <Modal
        isOpen={Boolean(manageSlipsBooth)}
        onClose={() => setManageSlipsBooth(null)}
        title={`Manage Slips Allotment — ${manageSlipsBooth?.booth_id || 'Booth'}`}
      >
        {manageSlipsBooth && (
          <form onSubmit={handleSaveManageSlips} className="space-y-4">
            <p className="text-xs text-muted">
              Adjust or expand the slips allotted to <strong>{manageSlipsBooth.booth_id}</strong>. Any unused slips can also be returned back to the unassigned pool.
            </p>

            <div className="p-3 rounded-xl bg-recessed/60 border border-line text-xs grid grid-cols-3 gap-2 text-center">
              <div>
                <span className="text-muted block text-[10px] uppercase font-bold">Total Allotted</span>
                <span className="font-mono font-bold text-base text-fg">{manageSlipsBooth.allotted_count || 0}</span>
              </div>
              <div>
                <span className="text-muted block text-[10px] uppercase font-bold">Votes Cast</span>
                <span className="font-mono font-bold text-base text-ok">{manageSlipsBooth.used_count || 0}</span>
              </div>
              <div>
                <span className="text-muted block text-[10px] uppercase font-bold">Unused Left</span>
                <span className="font-mono font-bold text-base text-brand">{manageSlipsBooth.remaining_count || 0}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-fg">
                Desired Slip Allotment Count
              </label>
              <input
                type="number"
                min={1}
                max={1500}
                value={manageSlipsCount}
                onChange={(e) => handleManageSlipsCountChange(e.target.value)}
                onBlur={handleManageSlipsCountBlur}
                className="w-full px-3 py-2 rounded-xl border border-line bg-surface text-fg text-sm shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand/25"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-fg">From Slip ID</label>
                <input
                  type="text"
                  value={manageFromSlipId}
                  onChange={(e) => handleManageFromSlipIdChange(e.target.value)}
                  onBlur={handleManageFromSlipIdBlur}
                  placeholder={`${manageSlipsBooth?.booth_number || manageSlipsBooth?.number || 1}001`}
                  className="w-full px-3 py-2 rounded-xl border border-line bg-surface text-fg font-mono text-sm shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand/25"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-fg">To Slip ID</label>
                <input
                  type="text"
                  value={manageToSlipId}
                  onChange={(e) => handleManageToSlipIdChange(e.target.value)}
                  onBlur={handleManageToSlipIdBlur}
                  placeholder={`${manageSlipsBooth?.booth_number || manageSlipsBooth?.number || 1}050`}
                  className="w-full px-3 py-2 rounded-xl border border-line bg-surface text-fg font-mono text-sm shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand/25"
                  required
                />
              </div>
            </div>

            <p className="text-[11px] text-muted flex items-center justify-between">
              <span>Range matches slip count automatically.</span>
              <span className="font-mono font-medium text-brand">
                {manageFromSlipId && manageToSlipId ? `${manageFromSlipId} – ${manageToSlipId} (${Math.max(1, parseInt(manageSlipsCount, 10) || 1)} slips)` : ''}
              </span>
            </p>

            <div className="pt-2 border-t border-line flex items-center justify-between gap-2">
              <button
                type="button"
                className="btn-ghost text-xs text-amber-500 hover:text-amber-600"
                disabled={busy || !manageSlipsBooth.allotted_count}
                onClick={handleReturnUnusedSlips}
              >
                Return Unused Slips to Pool
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setManageSlipsBooth(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={busy}
                >
                  Save Slips Allotment
                </button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      {/* Revoke Booth Confirmation Modal */}
      <Modal
        isOpen={Boolean(revokingBooth)}
        onClose={() => setRevokingBooth(null)}
        title={`Revoke session for ${revokingBooth?.booth_id || 'Booth'}?`}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Revoking immediately terminates the terminal session on this computer and returns all <strong>unused slips</strong> back to the unassigned pool.
          </p>
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400 space-y-1">
            <p className="font-bold">What happens next:</p>
            <p>1. The booth terminal will automatically reset to the setup screen.</p>
            <p>2. A fresh <strong>Booth Token & TOTP code</strong> will be generated immediately so you can re-authorize this booth whenever you are ready.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <button className="btn-ghost" onClick={() => setRevokingBooth(null)}>
              Cancel
            </button>
            <button
              className="btn-primary bg-amber-600 hover:bg-amber-700 text-white"
              disabled={busy}
              onClick={handleExecuteRevoke}
            >
              Confirm Revoke Session
            </button>
          </div>
        </div>
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
