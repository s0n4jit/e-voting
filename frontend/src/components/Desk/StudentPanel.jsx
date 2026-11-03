import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { PencilSquareIcon, TicketIcon, TrashIcon } from '@heroicons/react/24/outline';
import { deskApi } from '../../api/deskApi';
import { Field, errorMessage } from '../ui';
import StatusBadge from '../common/StatusBadge';
import SlipCard from './SlipCard';
import { useDeskState } from '../../hooks/useDeskOpen';
import ProgrammePicker from './ProgrammePicker';

const STATUS = { registered: 'No PIN yet', pin_active: 'PIN issued', active: 'Active', voted: 'Voted' };

/** Details, edit, delete, slip printing and PIN issuing for one registered voter. */
export default function StudentPanel({ student, programmes, onChanged, onClose }) {
  const [current, setCurrent] = useState(student);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState(null); // the student's current PIN; undefined while loading
  const [error, setError] = useState('');

  // a status change made elsewhere (e.g. the voter just voted) shows up straight away
  useEffect(() => {
    setCurrent((c) => (c.slip_id === student.slip_id ? { ...c, status: student.status, is_duplicate: student.is_duplicate } : c));
  }, [student.status, student.slip_id, student.is_duplicate]);

  useEffect(() => {
    setCurrent(student);
    setPin(undefined);
    deskApi.getPin(student.slip_id).then(setPin).catch(() => setPin(null));
    setEditing(false);
    setConfirmDelete(false);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.slip_id]);

  const startEdit = () => {
    setForm({
      name: current.name,
      roll_no: current.roll_no || '',
      programme: current.programme || '',
      programme_id: current.programme_id ? String(current.programme_id) : '',
      semester: current.semester ? String(current.semester) : '',
    });
    setEditing(true);
    setConfirmDelete(false);
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const updated = await deskApi.update(current.slip_id, {
        name: form.name,
        roll_no: (form.roll_no || '').trim(),
        programme_id: Number(form.programme_id),
        semester: Number(form.semester),
      });
      setCurrent(updated);
      setEditing(false);
      onChanged?.();
      toast.success('Registration updated');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const deleteStudent = async () => {
    setBusy(true);
    setError('');
    try {
      await deskApi.deleteStudent(current.slip_id);
      toast.success(`Registration for ${current.name} deleted`);
      onChanged?.();
      onClose?.();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const issue = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await deskApi.issuePin(current.slip_id);
      setPin(res.pin);
      setCurrent((c) => ({ ...c, status: 'pin_active' }));
      toast.success(`Voting PIN issued: ${res.pin}`);
      onChanged?.();
    } catch (err) {
      setError(errorMessage(err));
      deskApi.get(current.slip_id).then(setCurrent).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const { open: deskOpen, paused } = useDeskState();
  const voted = current.status === 'voted';

  return (
    <div className="grid gap-6 md:grid-cols-2 items-start">
      <div className="space-y-5">
        {!editing ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-lg truncate">{current.name}</p>
                <p className="font-mono text-sm text-muted">{current.slip_id}</p>
              </div>
              <StatusBadge
                label={STATUS[current.status]}
                variant={current.status === 'voted' ? 'ok' : current.status === 'active' ? 'brand' : current.status === 'pin_active' ? 'warn' : 'neutral'}
              />
            </div>

            {current.is_duplicate && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-800 dark:text-amber-200">
                <p className="font-semibold mb-1">Duplicate registration notice</p>
                <p>
                  Another student with this name or roll number is registered for this election. If this record was added mistakenly while
                  registration or voting was open, desk officers and election officers can delete it below.
                </p>
              </div>
            )}

            <dl className="grid grid-cols-2 gap-4 text-sm">
              {current.roll_no && (
                <div className="col-span-2">
                  <dt className="text-muted">Roll/Enrollment No.</dt>
                  <dd className="font-medium">{current.roll_no}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted">Programme</dt>
                <dd className="font-medium">{[current.programme, current.department].filter(Boolean).join(' · ')}</dd>
              </div>
              <div>
                <dt className="text-muted">{current.term_label}</dt>
                <dd className="font-medium">{current.term}</dd>
              </div>
            </dl>

            {error && <p className="error-text" role="alert">{error}</p>}

            <div className="rounded-xl border border-brand/30 bg-brand-soft/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Voting PIN</p>
                {pin && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(pin);
                      toast.success('PIN copied to clipboard');
                    }}
                    className="btn-ghost btn-sm text-xs font-mono"
                  >
                    Copy PIN
                  </button>
                )}
              </div>
              {pin ? (
                <>
                  <div className="bg-surface rounded-xl border border-line py-3 px-4 text-center shadow-xs">
                    <p className="font-mono text-3xl sm:text-4xl font-bold tracking-[0.25em] text-brand-fg select-all">{pin}</p>
                  </div>
                  <p className="text-xs text-muted">This single-use PIN is active and valid for the voter at the booth.</p>
                </>
              ) : (
                <p className="text-sm text-muted">{pin === undefined ? 'Loading PIN…' : voted ? 'Already voted.' : 'No PIN issued yet.'}</p>
              )}
              <button
                className={pin ? 'btn-secondary' : 'btn-primary'}
                onClick={() => (!pin || window.confirm('The current PIN will stop working. Issue a new one?')) && issue()}
                disabled={busy || voted || !deskOpen || paused}
              >
                <TicketIcon className="w-4 h-4" /> {pin ? 'Reissue new PIN' : 'Issue PIN'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-secondary" onClick={startEdit} disabled={voted}>
                <PencilSquareIcon className="w-4 h-4" /> Edit details
              </button>
              <button
                className="btn-ghost text-bad hover:bg-bad/10"
                onClick={() => setConfirmDelete(true)}
                disabled={busy || voted}
              >
                <TrashIcon className="w-4 h-4" /> Delete student
              </button>
            </div>

            {confirmDelete && (
              <div className="rounded-lg border border-bad/30 bg-bad/5 p-4 space-y-3">
                <p className="text-sm font-semibold text-bad">Confirm deletion</p>
                <p className="text-xs text-muted">
                  Are you sure you want to delete {current.name} ({current.slip_id})? This will permanently remove their voter registration
                  and revoke their voter slip and any issued PIN.
                </p>
                <div className="flex gap-2">
                  <button className="btn-danger btn-sm" onClick={deleteStudent} disabled={busy}>
                    Yes, delete student
                  </button>
                  <button className="btn-ghost btn-sm" onClick={() => setConfirmDelete(false)} disabled={busy}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {!deskOpen && <p className="hint">Voting has ended. PINs can no longer be issued.</p>}
            {deskOpen && paused && <p className="hint">Voting is paused. PINs can be issued again when the officer resumes voting.</p>}
            {voted && <p className="hint">This voter has already voted. Records and PINs cannot be changed or deleted.</p>}
          </>
        ) : (
          <div className="space-y-4">
            <Field label="Full name" htmlFor="edit-name">
              <input id="edit-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Roll/Enrollment No. (optional)" htmlFor="edit-roll">
              <input id="edit-roll" className="input" value={form.roll_no || ''} maxLength={40} onChange={(e) => setForm({ ...form, roll_no: e.target.value })} />
            </Field>
            <ProgrammePicker programmes={programmes} value={form} onChange={(v) => setForm({ ...form, ...v })} idPrefix="edit" />
            {error && <p className="error-text" role="alert">{error}</p>}
            <div className="flex gap-2">
              <button className="btn-primary" onClick={save} disabled={busy || !form.name || !form.programme_id || !form.semester}>
                Save changes
              </button>
              <button className="btn-ghost" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      <SlipCard slip={pin ? { ...current, pin } : current} />
    </div>
  );
}
