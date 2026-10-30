import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { deskApi } from '../../api/deskApi';
import { useAuth } from '../../context/AuthContext';
import { EmptyState, Field, PageHeader, errorMessage } from '../ui';
import LoadingSpinner from '../common/LoadingSpinner';
import SlipCard from './SlipCard';
import { useDeskOpen } from '../../hooks/useDeskOpen';
import ProgrammePicker from './ProgrammePicker';

export default function RegisterStudent() {
  const { role } = useAuth();
  const [programmes, setProgrammes] = useState(null);
  const [form, setForm] = useState({ name: '', programme: '', programme_id: '', semester: '' });
  const [errors, setErrors] = useState({});
  const [duplicate, setDuplicate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [slip, setSlip] = useState(null);
  const deskOpen = useDeskOpen();

  useEffect(() => {
    deskApi.getProgrammes().then(setProgrammes).catch(() => setProgrammes([]));
  }, []);

  const change = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors({});
    setDuplicate(null);
  };

  const submit = async (confirmDuplicate = false) => {
    setBusy(true);
    setErrors({});
    try {
      const result = await deskApi.register({
        name: form.name,
        programme_id: Number(form.programme_id),
        semester: Number(form.semester),
        ...(confirmDuplicate ? { confirm_duplicate: true } : {}),
      });
      setSlip(result);
    } catch (err) {
      const data = err?.response?.data;
      if (data?.code === 'possible_duplicate') setDuplicate(data);
      else setErrors({ [data?.field || 'form']: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  if (!programmes) return <LoadingSpinner size="lg" />;

  if (!deskOpen && !slip) {
    return (
      <div className="max-w-xl">
        <PageHeader title="Register student" />
        <div className="card">
          <EmptyState title="Voting has ended">No more students can be registered and no more PINs can be issued.</EmptyState>
        </div>
      </div>
    );
  }

  if (slip) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="flex flex-col items-center text-center mb-6 no-print animate-pop-in">
          <CheckCircleIcon className="w-12 h-12 text-ok" />
          <h1 className="text-xl font-semibold mt-3">Registration complete</h1>
          <p className="text-sm text-muted mt-1">Give the student their voter slip.</p>
        </div>
        <SlipCard slip={slip} />
        <div className="no-print flex justify-center mt-4">
          <button
            className="btn-primary"
            onClick={() => {
              setSlip(null);
              setForm({ name: '', programme: form.programme, programme_id: form.programme_id, semester: '' });
            }}
          >
            Register another student
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <PageHeader title="Register student" subtitle="A unique Voter Slip ID is generated when you submit." />

      {programmes.length === 0 ? (
        <div className="card">
          <EmptyState title="No programmes configured">
            {role === 'admin' ? (
              <>
                Add at least one programme before registering students.{' '}
                <Link to="/admin/programmes" className="text-brand-fg font-medium hover:underline">Add programmes</Link>
              </>
            ) : (
              'Ask the Election Officer to add programmes before registering students.'
            )}
          </EmptyState>
        </div>
      ) : (
        <form
          className="card card-body space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
        >
          <Field label="Student's full name" htmlFor="name" error={errors.name}>
            <input id="name" className={`input ${errors.name ? 'input-error' : ''}`} value={form.name} onChange={(e) => change({ name: e.target.value })} autoFocus autoComplete="off" required />
          </Field>
          <ProgrammePicker programmes={programmes} value={form} onChange={(v) => change(v)} errors={errors} />

          {duplicate && (
            <div className="flex gap-3 rounded-lg bg-warn-soft text-warn p-4 text-sm animate-pop-in" role="alert">
              <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
              <div className="space-y-2">
                <p>{duplicate.error}</p>
                <p className="text-xs">Existing slip: <span className="font-mono">{duplicate.existing_slip_id}</span></p>
                <button type="button" className="btn-secondary btn-sm" onClick={() => submit(true)} disabled={busy}>
                  This is a different student — register anyway
                </button>
              </div>
            </div>
          )}
          {errors.form && <p className="error-text" role="alert">{errors.form}</p>}

          <button type="submit" className="btn-primary w-full sm:w-auto" disabled={busy || !form.name.trim() || !form.programme_id || !form.semester}>
            {busy ? 'Registering…' : 'Register and generate slip'}
          </button>
        </form>
      )}
    </div>
  );
}
