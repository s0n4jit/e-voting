import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { PrinterIcon, TicketIcon } from '@heroicons/react/24/outline';
import { deskApi } from '../../api/deskApi';
import { Field, errorMessage } from '../ui';
import StatusBadge from '../common/StatusBadge';
import SlipCard from './SlipCard';
import { useDeskState } from '../../hooks/useDeskOpen';
import ProgrammePicker from './ProgrammePicker';

const STATUS = { registered: 'Registered', pin_active: 'PIN active', voted: 'Voted' };

/** Details, edit, slip printing and PIN issuing for one registered voter. */
export default function StudentPanel({ student, programmes, onChanged }) {
  const [current, setCurrent] = useState(student);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState(null);
  const [error, setError] = useState('');

  // a status change made elsewhere (e.g. the voter just voted) shows up straight away
  useEffect(() => {
    setCurrent((c) => (c.slip_id === student.slip_id ? { ...c, status: student.status } : c));
  }, [student.status, student.slip_id]);

  useEffect(() => {
    setCurrent(student);
    setPin(null);
    setEditing(false);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.slip_id]);


  const startEdit = () => {
    setForm({
      name: current.name,
      programme: current.programme || '',
      programme_id: current.programme_id ? String(current.programme_id) : '',
      semester: current.semester ? String(current.semester) : '',
    });
    setEditing(true);
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const updated = await deskApi.update(current.slip_id, {
        name: form.name,
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

  const issue = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await deskApi.issuePin(current.slip_id);
      setPin(res);
      setCurrent((c) => ({ ...c, status: 'pin_active' }));
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

  if (pin) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted no-print">
          A new voting PIN was created. It replaces any earlier PIN of this student and is shown only now, on this slip. Print it and hand it over.
        </p>
        <SlipCard slip={{ ...current, pin: pin.pin }} />
        <div className="no-print flex justify-center">
          <button className="btn-primary" onClick={() => setPin(null)}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!editing ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-lg truncate">{current.name}</p>
              <p className="font-mono text-sm text-muted">{current.slip_id}</p>
            </div>
            <StatusBadge label={STATUS[current.status]} variant={current.status === 'voted' ? 'ok' : current.status === 'pin_active' ? 'warn' : 'brand'} />
          </div>
          <dl className="grid grid-cols-2 gap-4 text-sm">
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

          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={issue} disabled={busy || voted || !deskOpen || paused}>
              <TicketIcon className="w-4 h-4" /> {current.status === 'pin_active' ? 'Issue new PIN' : 'Issue voting PIN'}
            </button>
            <button className="btn-secondary" onClick={startEdit} disabled={voted}>Edit details</button>
          </div>
          {!deskOpen && <p className="hint">Voting has ended. PINs can no longer be issued.</p>}
          {deskOpen && paused && <p className="hint">Voting is paused. PINs can be issued again when the officer resumes voting.</p>}
          {voted && <p className="hint">This voter has already voted. A PIN cannot be issued and details are locked.</p>}

          <details className="group">
            <summary className="cursor-pointer text-sm text-brand-fg font-medium list-none">Show voter slip</summary>
            <div className="mt-4 space-y-3">
              <p className="hint no-print">
                The PIN is not stored in readable form, so this slip prints without it. To print a slip that carries a PIN, press <b>Issue new PIN</b> above: it makes a new PIN (replacing the old one) and shows the slip with it.
              </p>
              <SlipCard slip={current} />
            </div>
          </details>
        </>
      ) : (
        <div className="space-y-4">
          <Field label="Full name" htmlFor="edit-name">
            <input id="edit-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <ProgrammePicker programmes={programmes} value={form} onChange={(v) => setForm({ ...form, ...v })} idPrefix="edit" />
          {error && <p className="error-text" role="alert">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-primary" onClick={save} disabled={busy || !form.name || !form.programme_id || !form.semester}>Save changes</button>
            <button className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
