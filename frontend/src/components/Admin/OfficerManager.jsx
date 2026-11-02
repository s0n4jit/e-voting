import React, { useCallback, useEffect, useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { toast } from 'react-hot-toast';
import { IdentificationIcon, PlusIcon } from '@heroicons/react/24/outline';
import { adminApi } from '../../api/adminApi';
import { EmptyState, Field, PageHeader, TableSkeleton, errorMessage } from '../ui';
import Modal from '../common/Modal';
import StatusBadge from '../common/StatusBadge';

const blank = { name: '', email: '', student_id: '', password: '' };

export const OfficerManager = () => {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(null);
  const [reset, setReset] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => adminApi.getOfficers().then(setRows).catch((e) => { toast.error(errorMessage(e)); setRows([]); }),
    []
  );
  useEffect(() => { load(); }, [load]);
  usePolling(() => adminApi.getOfficers().then(setRows).catch(() => {}), 4000);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await adminApi.createOfficer(form);
      toast.success('Desk officer created');
      setForm(null);
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (o) => {
    try {
      await adminApi.updateOfficer(o.id, { is_active: !o.is_active });
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await adminApi.updateOfficer(reset.id, { password: reset.password });
      toast.success('Password updated');
      setReset(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      await adminApi.deleteOfficer(removing.id);
      toast.success('Desk officer removed');
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Desk officers"
        subtitle="Desk officers register students and check voters in. They cannot change election settings."
        actions={
          <button className="btn-primary" onClick={() => { setError(''); setForm({ ...blank }); }}>
            <PlusIcon className="w-4 h-4" /> Add desk officer
          </button>
        }
      />

      <div className="card">
        {!rows ? (
          <TableSkeleton rows={3} cols={4} />
        ) : rows.length === 0 ? (
          <EmptyState icon={IdentificationIcon} title="No desk officers yet" action={<button className="btn-primary" onClick={() => setForm({ ...blank })}>Add desk officer</button>}>
            Create an account for each person who will staff a registration desk.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td className="font-medium">{o.name}</td>
                    <td className="font-mono text-xs">{o.student_id}</td>
                    <td>{o.email}</td>
                    <td><StatusBadge label={o.is_active ? 'Active' : 'Inactive'} variant={o.is_active ? 'ok' : 'neutral'} /></td>
                    <td className="text-right space-x-1">
                      <button className="btn-ghost btn-sm" onClick={() => toggle(o)}>{o.is_active ? 'Deactivate' : 'Activate'}</button>
                      <button className="btn-ghost btn-sm" onClick={() => { setError(''); setReset({ id: o.id, name: o.name, password: '' }); }}>Reset password</button>
                      <button className="btn-ghost btn-sm text-bad" onClick={() => setRemoving(o)}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={Boolean(form)} onClose={() => setForm(null)} title="Add desk officer">
        {form && (
          <form onSubmit={create} className="space-y-4">
            <Field label="Full name" htmlFor="o-name">
              <input id="o-name" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Email" htmlFor="o-email">
                <input id="o-email" type="email" className="input" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Username" htmlFor="o-user">
                <input id="o-user" className="input" required value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })} autoComplete="off" />
              </Field>
            </div>
            <Field label="Temporary password" htmlFor="o-pass" hint="At least 8 characters with a letter and a digit.">
              <input id="o-pass" type="password" className="input" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
            </Field>
            {error && <p className="error-text" role="alert">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn-primary" disabled={busy}>Create account</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={Boolean(reset)} onClose={() => setReset(null)} title={`Reset password for ${reset?.name || ''}`}>
        {reset && (
          <form onSubmit={savePassword} className="space-y-4">
            <Field label="New password" htmlFor="r-pass" hint="At least 8 characters with a letter and a digit.">
              <input id="r-pass" type="password" className="input" required value={reset.password} onChange={(e) => setReset({ ...reset, password: e.target.value })} autoComplete="new-password" autoFocus />
            </Field>
            {error && <p className="error-text" role="alert">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setReset(null)}>Cancel</button>
              <button className="btn-primary" disabled={busy}>Update password</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={Boolean(removing)} onClose={() => setRemoving(null)} title="Remove desk officer">
        <p className="text-sm text-muted">Remove {removing?.name}? Their registrations stay on record.</p>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-ghost" onClick={() => setRemoving(null)}>Cancel</button>
          <button className="btn-danger" onClick={remove}>Remove</button>
        </div>
      </Modal>
    </div>
  );
};

export default OfficerManager;
