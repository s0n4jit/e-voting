import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { ArchiveBoxArrowDownIcon, ArrowUpTrayIcon, ExclamationTriangleIcon, TrashIcon } from '@heroicons/react/24/outline';
import { adminApi } from '../../api/adminApi';
import { saveBlob } from '../../api/deskApi';
import { Field, PageHeader, errorMessage } from '../ui';
import Modal from '../common/Modal';

const LOGOUT_KEYS = ['access_token', 'refresh_token', 'user'];

/** Backup (ZIP), import and factory reset. Reset and import need the officer's authenticator code. */
export default function SystemPage() {
  const [downloaded, setDownloaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null); // 'reset' | 'import'
  const [code, setCode] = useState('');
  const [word, setWord] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');

  const download = async () => {
    setBusy(true);
    try {
      const blob = await adminApi.exportSystem();
      saveBlob(blob, `evoting-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.zip`);
      setDownloaded(true);
      toast.success('Backup downloaded. Keep it safe: it contains everything.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const open = (kind) => {
    setDialog(kind);
    setCode('');
    setWord('');
    setError('');
  };

  const leave = (path) => {
    LOGOUT_KEYS.forEach((k) => localStorage.removeItem(k));
    window.location.assign(path);
  };

  const run = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (dialog === 'reset') {
        await adminApi.resetSystem(code, word);
        leave('/');
      } else {
        await adminApi.importSystem(file, code, word);
        toast.success('Backup restored. Sign in with the accounts from the backup and set up two-step verification again.');
        leave('/login');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmWord = dialog === 'reset' ? 'RESET' : 'IMPORT';
  const ready = /^\d{6}$/.test(code) && word === confirmWord && (dialog === 'reset' || file);

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Backup and reset" subtitle="Download everything, start again from the setup screen, or restore an earlier backup." />

      <section className="card card-body space-y-3">
        <div className="flex items-start gap-3">
          <ArchiveBoxArrowDownIcon className="w-6 h-6 text-brand shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold">1. Download a backup</h2>
            <p className="text-sm text-muted mt-1">
              A ZIP with the settings, programmes, elections, candidates and photos, accounts, registrations, ballots and the audit log.
              It contains password hashes and all ballots, so store it offline and share it with nobody.
            </p>
          </div>
        </div>
        <div><button className="btn-primary" onClick={download} disabled={busy}>{busy && !dialog ? 'Preparing…' : 'Download backup (.zip)'}</button>
          {downloaded && <span className="text-sm text-ok ml-3">Downloaded</span>}</div>
      </section>

      <section className="card card-body space-y-3 border-bad/40">
        <div className="flex items-start gap-3">
          <TrashIcon className="w-6 h-6 text-bad shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold">2. Reset the system</h2>
            <p className="text-sm text-muted mt-1">
              Erases every election, account, registration and ballot. The setup screen appears again. You need the backup from step 1
              (downloaded in the last 30 minutes), your authenticator code, and voting must be closed.
            </p>
          </div>
        </div>
        <div>
          <button className="btn-danger" disabled={!downloaded} onClick={() => open('reset')}>Reset system…</button>
          {!downloaded && <span className="text-xs text-muted ml-3">Download a backup first.</span>}
        </div>
      </section>

      <section className="card card-body space-y-3">
        <div className="flex items-start gap-3">
          <ArrowUpTrayIcon className="w-6 h-6 text-brand shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold">3. Import a backup</h2>
            <p className="text-sm text-muted mt-1">
              After a reset, go through the setup screen with temporary details (any name and password), turn on two-step verification,
              then come back here and import your backup. Everything in the backup replaces what is in the system, including the accounts,
              so you sign in again with the accounts from the backup. Authenticator secrets are not restored: each account sets two-step verification up again on its next sign-in (required for Election Officers).
            </p>
          </div>
        </div>
        <div><button className="btn-secondary" onClick={() => open('import')}>Import backup…</button></div>
      </section>

      <Modal isOpen={Boolean(dialog)} onClose={() => !busy && setDialog(null)} title={dialog === 'reset' ? 'Reset the whole system' : 'Import a backup'}>
        {dialog && (
          <form onSubmit={run} className="space-y-4">
            <p className="text-sm flex gap-2 text-bad">
              <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
              {dialog === 'reset'
                ? 'This permanently erases all data on this system. It cannot be undone except by importing your backup.'
                : 'This replaces all current data with the backup. It cannot be undone.'}
            </p>
            {dialog === 'import' && (
              <Field label="Backup file" htmlFor="sys-file">
                <input id="sys-file" type="file" accept=".zip,application/zip" className="input" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </Field>
            )}
            <Field label="Authenticator code" htmlFor="sys-code" hint="The 6-digit code from your authenticator app.">
              <input id="sys-code" className="input font-mono tracking-widest text-center" inputMode="numeric" maxLength={6} autoComplete="one-time-code"
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label={`Type ${confirmWord} to confirm`} htmlFor="sys-word">
              <input id="sys-word" className="input font-mono" autoComplete="off" value={word} onChange={(e) => setWord(e.target.value)} />
            </Field>
            {error && <p className="error-text" role="alert">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setDialog(null)} disabled={busy}>Cancel</button>
              <button className={dialog === 'reset' ? 'btn-danger' : 'btn-primary'} disabled={busy || !ready}>
                {busy ? 'Working…' : dialog === 'reset' ? 'Erase everything' : 'Restore backup'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
