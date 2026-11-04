import React, { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'react-hot-toast';
import {
  ClipboardDocumentIcon,
  ComputerDesktopIcon,
  KeyIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '../../api/adminApi';
import { EmptyState, PageHeader, TableSkeleton, errorMessage } from '../ui';
import { usePolling } from '../../hooks/usePolling';
import Modal from '../common/Modal';
import BoothGuide from './BoothGuide';
import StatusBadge from '../common/StatusBadge';

/** Voting booths management. Booths are authorized on the kiosk computer using one-time tokens. */
export const KioskManager = () => {
  const [booths, setBooths] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('booths'); // 'booths' | 'guide'
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

  const generate = async () => {
    setBusy(true);
    try {
      const res = await adminApi.createBoothToken();
      setIssued(res);
      await loadBooths();
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

  return (
    <div>
      <PageHeader
        title="Voting booths"
        subtitle="Computers authorized to accept votes. Votes cannot be cast from anywhere else."
        actions={
          tab === 'booths' && (
            <button className="btn-primary" onClick={generate} disabled={busy}>
              <KeyIcon className="w-4 h-4" /> Generate booth token
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
            <p className="font-medium text-fg">To set up a booth</p>
            <ol className="list-decimal pl-5 mt-2 space-y-1 text-muted">
              <li>Press <strong>Generate booth token</strong> here. The token works once and expires after 15 minutes.</li>
              <li>On the booth computer, open <span className="font-mono text-fg font-semibold">/kiosk/vote</span>. Enter the token and your current authenticator code.</li>
              <li>The booth automatically receives its Booth ID (BOOTH-01, BOOTH-02, …) and accepts votes while the election is active.</li>
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

      {/* Generate Booth Token Modal */}
      <Modal isOpen={Boolean(issued)} onClose={() => setIssued(null)} title="Booth Token Ready">
        {issued && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted">
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
    </div>
  );
};

export default KioskManager;
