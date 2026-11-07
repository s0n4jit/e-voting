import React, { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'react-hot-toast';
import {
  ClipboardDocumentIcon,
  ComputerDesktopIcon,
  KeyIcon,
  TrashIcon,
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
 * Handles automatic sequential kiosk machine registration (BOOTH-01, BOOTH-02, ...),
 * one-time setup token generation (displaying only the setup token code),
 * session revocation, and booth deletion (safely locked during active elections).
 */
export const KioskManager = () => {
  const [booths, setBooths] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('booths'); // 'booths' | 'guide'

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

  // Directly create the next booth machine sequentially (BOOTH-01, BOOTH-02, etc.)
  const handleCreateBooth = async () => {
    setBusy(true);
    try {
      const res = await adminApi.createBoothToken({});
      setIssued({
        token: res.token || res.create_token,
        create_token: res.token || res.create_token,
        booth_id: res.booth_id || (res.booth_number ? `BOOTH-${String(res.booth_number).padStart(2, '0')}` : 'Booth'),
        booth_number: res.booth_number,
        totp_code: res.totp_code || res.current_totp,
        current_totp: res.totp_code || res.current_totp,
        expires_at: res.expires_at,
        election_title: res.election_title,
      });
      await loadBooths();
      toast.success(`Setup token generated for ${res.booth_id || `Booth ${res.booth_number}`}!`);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to create booth machine'));
    } finally {
      setBusy(false);
    }
  };

  // Get setup code for an existing booth
  const handleGetSetupCode = async (booth) => {
    setBusy(true);
    try {
      const res = await adminApi.getKioskSetupToken(booth.id);
      setIssued({
        token: res.token || res.create_token,
        create_token: res.token || res.create_token,
        booth_id: res.booth_id || booth.booth_id,
        booth_number: res.booth_number || booth.booth_number,
        totp_code: res.totp_code || res.current_totp,
        current_totp: res.totp_code || res.current_totp,
        expires_at: res.expires_at,
        election_title: res.election_title || booth.election_title,
      });
      toast.success(`Setup code generated for ${res.booth_id || booth.booth_id || 'Booth'}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to generate setup code.'));
    } finally {
      setBusy(false);
    }
  };

  // Revoke an active booth session and get a fresh setup token
  const handleExecuteRevoke = async () => {
    if (!revokingBooth) return;
    setBusy(true);
    try {
      const res = await adminApi.revokeKiosk(revokingBooth.id);
      setRevokingBooth(null);
      setIssued({
        token: res.token || res.create_token,
        create_token: res.token || res.create_token,
        booth_id: res.booth_id || revokingBooth.booth_id,
        booth_number: res.booth_number || revokingBooth.booth_number,
        totp_code: res.totp_code || res.current_totp,
        current_totp: res.totp_code || res.current_totp,
        expires_at: res.expires_at,
        election_title: res.election_title || revokingBooth.election_title,
      });
      await loadBooths();
      toast.success(res.message || `Session revoked for ${revokingBooth.booth_id}.`);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to revoke booth session'));
    } finally {
      setBusy(false);
    }
  };

  // Delete booth machine (blocked if election is ready/active or slips exist)
  const remove = async () => {
    if (!removing) return;
    if (removing.election_is_active || removing.allotted_count > 0 || removing.used_count > 0 || !removing.can_delete) {
      toast.error('Cannot delete booth while an election is ready/active or after slips have been created.');
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
              onClick={handleCreateBooth}
              disabled={busy}
            >
              <PlusIcon className="w-4 h-4" />
              <span>{busy ? 'Creating…' : 'Add Booth Machine'}</span>
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
              <li>Click <strong>Add Booth Machine</strong> above to generate a setup token. Machines are automatically numbered sequentially (<span className="font-mono text-brand font-bold">BOOTH-01</span>, <span className="font-mono text-brand font-bold">BOOTH-02</span>, etc.).</li>
              <li>On the kiosk computer, open <span className="font-mono text-fg font-bold bg-recessed px-1.5 py-0.5 rounded">/kiosk/vote</span>.</li>
              <li>Enter the setup token and your authenticator code to activate the terminal.</li>
              <li>The terminal links directly with voter slips generated in <strong>Voter Slips</strong> for that booth.</li>
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
                  <button className="btn-primary flex items-center gap-2" onClick={handleCreateBooth} disabled={busy}>
                    <PlusIcon className="w-4 h-4" />
                    <span>{busy ? 'Creating…' : 'Add First Booth Machine (BOOTH-01)'}</span>
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
                      const isLocked = b.election_is_active || b.allotted_count > 0 || b.used_count > 0 || !b.can_delete;
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
                              {/* Merged Setup Code / Revoke contextual action */}
                              {b.is_active ? (
                                <button
                                  type="button"
                                  className="btn-secondary btn-sm flex items-center gap-1.5 text-amber-600 hover:text-amber-700"
                                  onClick={() => setRevokingBooth(b)}
                                  title="Revoke session and generate fresh setup token"
                                >
                                  <ArrowPathIcon className="w-3.5 h-3.5" />
                                  <span>Revoke</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn-primary btn-sm flex items-center gap-1.5"
                                  onClick={() => handleGetSetupCode(b)}
                                  title="Get setup code to activate this booth"
                                >
                                  <KeyIcon className="w-3.5 h-3.5" />
                                  <span>Setup Code</span>
                                </button>
                              )}

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

      {/* Generated Setup Token Modal */}
      <Modal
        isOpen={Boolean(issued)}
        onClose={() => setIssued(null)}
        title="Booth Setup Token Ready"
      >
        {issued && (
          <div className="space-y-4 text-center">
            <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-muted">
              <ComputerDesktopIcon className="w-4 h-4 text-brand" />
              <span className="text-brand font-black text-sm">{issued.booth_id || `Booth ${issued.booth_number}`}</span>
              {issued.election_title && <span>• {issued.election_title}</span>}
            </div>

            {/* Prominent Setup Token Box */}
            <div className="p-5 rounded-2xl bg-recessed/70 border border-line space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted block">
                Booth Setup Token
              </span>
              <p className="font-mono text-3xl sm:text-4xl font-black text-brand tracking-widest select-all">
                {issued?.token || issued?.create_token || '—'}
              </p>
              <div className="pt-2 flex justify-center">
                <button
                  type="button"
                  className="btn-secondary btn-sm flex items-center gap-1.5"
                  onClick={() => {
                    const t = issued?.token || issued?.create_token;
                    if (t) {
                      navigator.clipboard?.writeText(t);
                      toast.success('Setup token copied to clipboard');
                    }
                  }}
                >
                  <ClipboardDocumentIcon className="w-4 h-4" />
                  <span>Copy Token</span>
                </button>
              </div>
              <p className="text-[11px] text-muted pt-1">Valid for 15 minutes</p>
            </div>


            {/* Instructions */}
            <div className="p-3.5 rounded-xl bg-surface border border-line text-left text-xs space-y-1.5 text-muted leading-relaxed">
              <p className="font-bold text-fg">How to complete activation on terminal:</p>
              <p>1. On the booth computer, launch the Booth App (or open <strong className="text-fg font-mono bg-recessed px-1.5 py-0.5 rounded">/kiosk/vote</strong>).</p>
              <p>2. Enter this <strong>Setup Token</strong> and your <strong>authenticator code</strong>.</p>
              <p>3. The machine will instantly activate as <strong className="text-brand font-bold">{issued.booth_id || `Booth ${issued.booth_number}`}</strong> and begin accepting votes.</p>
            </div>

            <div className="flex justify-center pt-1 border-t border-line">
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

      {/* Revoke Booth Confirmation Modal */}
      <Modal
        isOpen={Boolean(revokingBooth)}
        onClose={() => setRevokingBooth(null)}
        title={`Revoke session for ${revokingBooth?.booth_id || 'Booth'}?`}
      >
        <div className="space-y-4">
          <p className="text-xs sm:text-sm text-muted leading-relaxed">
            Revoking immediately terminates the terminal session on this computer and generates a fresh setup token.
          </p>
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 space-y-1.5">
            <p className="font-bold flex items-center gap-1.5">
              <ShieldExclamationIcon className="w-4 h-4" />
              <span>What happens next:</span>
            </p>
            <p>1. The booth terminal immediately resets back to the setup screen.</p>
            <p>2. Pre-generated slips assigned to {revokingBooth?.booth_id} remain intact.</p>
            <p>3. A fresh Setup Token will be provided so you can re-authorize this machine when ready.</p>
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

      {/* Delete Booth Confirmation Modal */}
      <Modal
        isOpen={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Delete ${removing?.booth_id || 'booth'}?`}
      >
        {removing && (
          <div className="space-y-4">
            {removing.election_is_active || removing.allotted_count > 0 || removing.used_count > 0 || !removing.can_delete ? (
              <div className="p-3.5 rounded-2xl bg-bad/10 border border-bad/20 text-bad text-xs space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <LockClosedIcon className="w-4 h-4" />
                  <span>Cannot Delete Booth During Election</span>
                </p>
                <p>
                  {removing.election_is_active
                    ? 'This election is currently configured and active/ready. Booth machines cannot be deleted during the election. You can use Revoke Session instead if you need to reconfigure or reconnect the computer.'
                    : removing.allotted_count > 0
                    ? `This booth already has ${removing.allotted_count} voter slips generated for it. Booths with assigned slips cannot be deleted.`
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
