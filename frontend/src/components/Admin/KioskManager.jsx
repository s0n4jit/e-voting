import React, { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'react-hot-toast';
import {
  ClipboardDocumentIcon,
  ComputerDesktopIcon,
  KeyIcon,
  TrashIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowPathIcon,
  LockClosedIcon,
  ShieldExclamationIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '../../api/adminApi';
import { EmptyState, PageHeader, TableSkeleton, errorMessage } from '../ui';
import { usePolling } from '../../hooks/usePolling';
import Modal from '../common/Modal';
import BoothGuide from './BoothGuide';
import StatusBadge from '../common/StatusBadge';

/**
 * Voting Booths Manager.
 * Handles kiosk machine registration, one-time setup token generation,
 * session revocation, and booth deletion (safely locked during ongoing elections).
 */
export const KioskManager = () => {
  const [booths, setBooths] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('booths'); // 'booths' | 'guide'

  // Setup / Token Generation Modal
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [setupOptions, setSetupOptions] = useState(null);
  const [selectedBooth, setSelectedBooth] = useState(1);

  // Generated Setup Token Modal
  const [issued, setIssued] = useState(null);

  // Revoke Confirmation Modal
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

  // Open the Setup Dialog to choose booth number
  const handleOpenSetupModal = async () => {
    setBusy(true);
    try {
      const opts = await adminApi.getNextAvailableBooth();
      setSetupOptions(opts);
      setSelectedBooth(opts.next_booth_number || 1);
      setSetupModalOpen(true);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to fetch available booth numbers'));
    } finally {
      setBusy(false);
    }
  };

  // Generate Booth Token
  const handleGenerateToken = async (e) => {
    if (e) e.preventDefault();
    setBusy(true);
    try {
      const res = await adminApi.createBoothToken({
        booth_number: Number(selectedBooth),
      });
      setSetupModalOpen(false);
      setIssued(res);
      await loadBooths();
      toast.success(`Booth setup token created for ${res.booth_id || `Booth ${res.booth_number}`}!`);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to create booth token'));
    } finally {
      setBusy(false);
    }
  };

  // Revoke an active booth session and get a fresh token + TOTP
  const handleExecuteRevoke = async () => {
    if (!revokingBooth) return;
    setBusy(true);
    try {
      const res = await adminApi.revokeKiosk(revokingBooth.id);
      setRevokingBooth(null);
      setIssued(res);
      await loadBooths();
      toast.success(res.message || `Session revoked for ${revokingBooth.booth_id}.`);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to revoke booth session'));
    } finally {
      setBusy(false);
    }
  };

  // Delete booth machine (blocked if election is active or votes exist)
  const remove = async () => {
    if (!removing) return;
    if (removing.election_is_active || removing.used_count > 0 || !removing.can_delete) {
      toast.error('Cannot delete booth while an election is active or after votes have been cast.');
      setRemoving(null);
      return;
    }

    setBusy(true);
    try {
      await adminApi.deleteKiosk(removing.id);
      toast.success(`${removing.booth_id} was deleted successfully.`);
      setRemoving(null);
      loadBooths();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete booth'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Voting Booths"
        subtitle="Authorized kiosk machines accepting votes. Votes can only be cast from an authorized booth terminal."
        actions={
          tab === 'booths' && (
            <button
              className="btn-primary flex items-center gap-2"
              onClick={handleOpenSetupModal}
              disabled={busy}
            >
              <PlusIcon className="w-4 h-4" />
              <span>Add Booth Machine</span>
            </button>
          )
        }
      />

      <div className="flex gap-1 border-b border-line mb-4" role="tablist">
        {[
          ['booths', 'Booth Machines'],
          ['guide', 'Setup Guide'],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-brand text-brand font-bold'
                : 'border-transparent text-muted hover:text-fg'
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
          {/* Quick Setup Card */}
          <div className="card p-4 text-xs sm:text-sm bg-surface border border-line shadow-card space-y-1.5">
            <p className="font-bold text-fg flex items-center gap-2">
              <ComputerDesktopIcon className="w-4 h-4 text-brand" />
              <span>How to Set Up a Voting Booth Machine:</span>
            </p>
            <ol className="list-decimal pl-5 space-y-1 text-muted text-xs leading-relaxed">
              <li>Click <strong>Add Booth Machine</strong> above to generate a one-time activation token.</li>
              <li>On the kiosk terminal computer, open <span className="font-mono text-fg font-bold bg-recessed px-1.5 py-0.5 rounded">/kiosk/vote</span>.</li>
              <li>Enter the 8-character token and the 6-digit authenticator code shown on screen.</li>
              <li>The terminal activates as <span className="font-mono text-brand font-bold">BOOTH-01</span>, <span className="font-mono text-brand font-bold">BOOTH-02</span>, etc., and links directly with slips generated in Voter Slips.</li>
            </ol>
          </div>

          {/* Booths Table */}
          <div className="card">
            {!booths ? (
              <TableSkeleton rows={3} cols={5} />
            ) : booths.length === 0 ? (
              <EmptyState
                icon={ComputerDesktopIcon}
                title="No voting booths registered yet"
                action={
                  <button className="btn-primary" onClick={handleOpenSetupModal} disabled={busy}>
                    <PlusIcon className="w-4 h-4" />
                    <span>Add First Booth Machine</span>
                  </button>
                }
              >
                Create your booth machines first so voter slips can be generated directly for them.
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Booth Terminal</th>
                      <th>Election</th>
                      <th>Status</th>
                      <th>Slips Assigned</th>
                      <th>Set Up</th>
                      <th>Last Seen</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {booths.map((b) => {
                      const isLocked = b.election_is_active || b.used_count > 0 || !b.can_delete;
                      return (
                        <tr key={b.id} className="hover:bg-recessed/40 transition-colors">
                          <td>
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand font-bold">
                                <ComputerDesktopIcon className="w-4 h-4" />
                              </div>
                              <div>
                                <p className="font-mono font-bold text-fg text-sm">{b.booth_id}</p>
                                <p className="text-[11px] text-muted">Booth #{b.number || b.booth_number}</p>
                              </div>
                            </div>
                          </td>
                          <td className="max-w-[14rem] truncate text-xs text-muted">
                            {b.election_title || '—'}
                          </td>
                          <td>
                            <StatusBadge
                              label={b.online ? 'Online' : 'Offline'}
                              variant={b.online ? 'ok' : 'neutral'}
                            />
                          </td>
                          <td>
                            {b.allotted_count > 0 ? (
                              <div className="text-xs">
                                <span className="font-mono font-bold text-fg">{b.allotted_count} total</span>
                                <span className="text-[11px] text-muted block">
                                  {b.used_count} used • {b.remaining_count} remaining
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted italic">None yet (create in Slips)</span>
                            )}
                          </td>
                          <td className="text-xs text-muted">
                            {b.created_at ? formatDistanceToNow(new Date(b.created_at), { addSuffix: true }) : '—'}
                          </td>
                          <td className="text-xs text-muted">
                            {b.last_heartbeat ? formatDistanceToNow(new Date(b.last_heartbeat), { addSuffix: true }) : '—'}
                          </td>
                          <td className="text-right">
                            <div className="inline-flex items-center gap-1.5 justify-end">
                              {/* Revoke Button */}
                              <button
                                type="button"
                                className="btn-secondary btn-sm flex items-center gap-1.5 text-amber-600 hover:text-amber-700"
                                onClick={() => setRevokingBooth(b)}
                                title="Revoke session and generate fresh setup code"
                              >
                                <ArrowPathIcon className="w-3.5 h-3.5" />
                                <span>Revoke</span>
                              </button>

                              {/* Delete Button (disabled during active election or when votes cast) */}
                              <button
                                type="button"
                                disabled={isLocked}
                                onClick={() => setRemoving(b)}
                                className={`btn-ghost btn-sm flex items-center gap-1.5 ${
                                  isLocked
                                    ? 'opacity-40 cursor-not-allowed text-muted'
                                    : 'text-bad hover:bg-bad/10'
                                }`}
                                title={
                                  b.election_is_active
                                    ? 'Cannot delete booth during an active election'
                                    : b.used_count > 0
                                    ? 'Cannot delete booth after votes have been cast'
                                    : 'Delete booth machine'
                                }
                              >
                                {isLocked ? (
                                  <LockClosedIcon className="w-3.5 h-3.5" />
                                ) : (
                                  <TrashIcon className="w-3.5 h-3.5" />
                                )}
                                <span>Delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal 1: Add Booth Machine Dialog */}
      <Modal
        isOpen={setupModalOpen}
        onClose={() => setSetupModalOpen(false)}
        title="Add Voting Booth Machine"
      >
        <form onSubmit={handleGenerateToken} className="space-y-4">
          <p className="text-xs text-muted leading-relaxed">
            Create an authorization token to register a computer terminal as an official voting booth.
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-fg">
              Booth Machine Identifier
            </label>
            <select
              value={selectedBooth}
              onChange={(e) => setSelectedBooth(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl border border-line bg-surface text-fg text-sm shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand/25"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
                <option key={num} value={num}>
                  BOOTH-{String(num).padStart(2, '0')} {setupOptions?.next_booth_number === num ? '(Recommended - Next Available)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="p-3 rounded-xl bg-recessed/60 border border-line text-xs text-muted space-y-1">
            <p className="font-bold text-fg">Activation Process:</p>
            <p>• Generates an 8-character one-time token valid for 15 minutes.</p>
            <p>• Your current 6-digit authenticator code will be displayed alongside the token.</p>
            <p>• Enter both on the booth computer to complete activation.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setSetupModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary flex items-center gap-1.5"
              disabled={busy}
            >
              <KeyIcon className="w-4 h-4" />
              <span>{busy ? 'Generating…' : 'Generate Setup Token'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal 2: Generated Booth Token & TOTP Ready Modal */}
      <Modal
        isOpen={Boolean(issued)}
        onClose={() => setIssued(null)}
        title="Booth Authorization Token Ready"
      >
        {issued && (
          <div className="space-y-4 text-center">
            <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-muted">
              <ComputerDesktopIcon className="w-4 h-4 text-brand" />
              <span>{issued.booth_id || `Booth ${issued.booth_number}`}</span>
              {issued.election_title && <span>• {issued.election_title}</span>}
            </div>

            {/* Token & TOTP Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
              <div className="p-3.5 rounded-2xl bg-recessed/60 border border-line space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                  1. One-Time Setup Token
                </span>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xl sm:text-2xl font-black text-brand tracking-wider select-all">
                    {issued.token}
                  </p>
                  <button
                    type="button"
                    className="btn-ghost btn-sm text-brand shrink-0"
                    onClick={() => {
                      navigator.clipboard?.writeText(issued.token);
                      toast.success('Setup token copied');
                    }}
                  >
                    <ClipboardDocumentIcon className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[10px] text-muted">Valid for 15 minutes</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-recessed/60 border border-line space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                  2. Authenticator TOTP Code
                </span>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xl sm:text-2xl font-black text-fg tracking-widest select-all">
                    {issued.totp_code || '—'}
                  </p>
                  {issued.totp_code && (
                    <button
                      type="button"
                      className="btn-ghost btn-sm text-fg shrink-0"
                      onClick={() => {
                        navigator.clipboard?.writeText(issued.totp_code);
                        toast.success('TOTP code copied');
                      }}
                    >
                      <ClipboardDocumentIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-muted">Officer 2FA authentication</p>
              </div>
            </div>

            {/* Step-by-Step Instructions */}
            <div className="p-3 rounded-xl bg-surface border border-line text-left text-xs space-y-1.5 text-muted">
              <p className="font-bold text-fg">Next Steps at Booth Machine:</p>
              <p>1. Open <strong className="text-fg font-mono">/kiosk/vote</strong> on the booth computer.</p>
              <p>2. Enter the <strong>Setup Token</strong> and your <strong>6-digit Code</strong> above.</p>
              <p>3. The machine will connect immediately and unlock for sequential PIN voting.</p>
            </div>

            <div className="flex justify-center gap-2 pt-1 border-t border-line">
              <button
                type="button"
                className="btn-primary px-8"
                onClick={() => setIssued(null)}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal 3: Revoke Booth Confirmation */}
      <Modal
        isOpen={Boolean(revokingBooth)}
        onClose={() => setRevokingBooth(null)}
        title={`Revoke session for ${revokingBooth?.booth_id || 'Booth'}?`}
      >
        <div className="space-y-4">
          <p className="text-xs sm:text-sm text-muted leading-relaxed">
            Revoking immediately terminates the terminal session on this computer and generates a fresh setup token and authenticator code.
          </p>
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 space-y-1.5">
            <p className="font-bold flex items-center gap-1.5">
              <ShieldExclamationIcon className="w-4 h-4" />
              <span>What happens next:</span>
            </p>
            <p>1. The booth terminal immediately resets back to the setup screen.</p>
            <p>2. Pre-generated slips assigned to {revokingBooth?.booth_id} remain intact.</p>
            <p>3. A new Setup Token & TOTP code will be provided so you can re-authorize this machine when ready.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setRevokingBooth(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary bg-amber-600 hover:bg-amber-700 text-white"
              disabled={busy}
              onClick={handleExecuteRevoke}
            >
              {busy ? 'Revoking…' : 'Confirm Revoke Session'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal 4: Delete Booth Confirmation */}
      <Modal
        isOpen={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Delete ${removing?.booth_id || 'booth'}?`}
      >
        {removing && (
          <div className="space-y-4">
            {removing.election_is_active || removing.used_count > 0 || !removing.can_delete ? (
              <div className="p-3.5 rounded-xl bg-bad/10 border border-bad/20 text-bad text-xs space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <LockClosedIcon className="w-4 h-4" />
                  <span>Cannot Delete Active Booth</span>
                </p>
                <p>
                  {removing.election_is_active
                    ? 'This election is currently active. Booth machines cannot be deleted during an active election. You can use Revoke Session instead if you need to reconfigure the computer.'
                    : `This booth has ${removing.used_count} recorded ballot(s). Booths with recorded votes cannot be deleted.`}
                </p>
                <div className="flex justify-end pt-2">
                  <button className="btn-secondary" onClick={() => setRemoving(null)}>
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-xs sm:text-sm text-muted leading-relaxed">
                  Are you sure you want to delete <strong>{removing.booth_id}</strong>? The machine will no longer be authorized to accept votes.
                </p>
                <div className="flex justify-end gap-2 pt-2 border-t border-line">
                  <button className="btn-ghost" onClick={() => setRemoving(null)}>
                    Cancel
                  </button>
                  <button
                    className="btn-danger"
                    disabled={busy}
                    onClick={remove}
                  >
                    {busy ? 'Deleting…' : 'Delete Booth Machine'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default KioskManager;
