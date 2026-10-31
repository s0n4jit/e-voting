import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { AcademicCapIcon, ArrowUpTrayIcon, PlusIcon } from '@heroicons/react/24/outline';
import { adminApi } from '../../api/adminApi';
import { saveBlob, setupApi } from '../../api/deskApi';
import { EmptyState, Field, PageHeader, TableSkeleton, errorMessage } from '../ui';
import Modal from '../common/Modal';
import StatusBadge from '../common/StatusBadge';

const NEW = '__new__';

/** Dropdown of the values already in use; "Add new…" switches to a text box. */
const PickOrAdd = ({ id, value, options, onChange, adding, setAdding }) =>
  adding ? (
    <div className="flex gap-2">
      <input id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} required autoFocus />
      {options.length > 0 && (
        <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => { setAdding(false); onChange(''); }}>List</button>
      )}
    </div>
  ) : (
    <select
      id={id}
      className="input"
      required
      value={value}
      onChange={(e) => (e.target.value === NEW ? (setAdding(true), onChange('')) : onChange(e.target.value))}
    >
      <option value="">Select…</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
      <option value={NEW}>+ Add new…</option>
    </select>
  );

const blank = { level: 'degree', programme: '', department: '', term_count: 6 };

export default function ProgrammeManager() {
  const [rows, setRows] = useState(null);
  const [editor, setEditor] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [addingProg, setAddingProg] = useState(false);
  const [addingDept, setAddingDept] = useState(false);
  const [removing, setRemoving] = useState(null);

  const load = useCallback(
    () => adminApi.getProgrammes().then(setRows).catch((e) => { toast.error(errorMessage(e)); setRows([]); }),
    []
  );
  useEffect(() => { load(); }, [load]);

  const hs = editor?.level === 'hs';
  const distinct = (key, level) => [...new Set((rows || []).filter((r) => r.level === level && r[key]).map((r) => r[key]))].sort();
  const programmeOptions = distinct('programme', 'degree');
  const departmentOptions = distinct('department', editor?.level || 'degree');
  const openEditor = (p) => {
    setError('');
    setAddingProg(Boolean(p.id) && !distinct('programme', p.level).includes(p.programme));
    setAddingDept(Boolean(p.id) && !distinct('department', p.level).includes(p.department));
    setEditor(p);
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      level: editor.level,
      programme: hs ? 'Higher Secondary' : editor.programme,
      department: editor.department,
      term_count: Number(editor.term_count),
    };
    try {
      if (editor.id) await adminApi.updateProgramme(editor.id, body);
      else await adminApi.createProgramme(body);
      setEditor(null);
      toast.success('Saved');
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (p) => {
    try {
      await adminApi.updateProgramme(p.id, { is_active: !p.is_active });
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const remove = async () => {
    try {
      await adminApi.deleteProgramme(removing.id);
      toast.success('Deleted');
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRemoving(null);
    }
  };

  const addStandard = async () => {
    setBusy(true);
    try {
      const csv = await setupApi.programmeTemplate();
      const res = await adminApi.importProgrammes(new File([csv], 'standard.csv', { type: 'text/csv' }));
      toast.success(`${res.created ?? 'The'} standard programmes added`);
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      setResult(await adminApi.importProgrammes(file));
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const closeImport = () => { setImporting(false); setResult(null); setError(''); };

  return (
    <div>
      <PageHeader
        title="Programmes"
        subtitle="Configure your college, school or university programmes and departments. Desk Officers choose from this list when registering a student, and candidates are assigned a department from it."
        actions={
          <>
            <button className="btn-secondary" onClick={() => setImporting(true)}>
              <ArrowUpTrayIcon className="w-4 h-4" /> Import CSV
            </button>
            <button className="btn-primary" onClick={() => openEditor({ ...blank })}>
              <PlusIcon className="w-4 h-4" /> Add
            </button>
          </>
        }
      />
      <div className="card">
        {!rows ? (
          <TableSkeleton rows={4} cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState icon={AcademicCapIcon} title="No programmes yet" action={
            <div className="flex flex-wrap gap-2 justify-center">
              <button className="btn-primary" onClick={addStandard} disabled={busy}>Add the standard list</button>
              <button className="btn-secondary" onClick={() => setImporting(true)}>Import CSV</button>
            </div>}>
            A <b>programme</b> is a course of study (for example Bachelor of Science), a <b>department</b> or stream is the subject inside it (Physics, Arts)
            and <b>terms</b> are its semesters or years. Add the college&rsquo;s standard list in one click, add rows one by one, or import a CSV.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Level</th><th>Programme</th><th>Department / stream</th><th>Terms</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>{p.level === 'hs' ? 'Higher Secondary' : 'Degree'}</td>
                    <td className="font-medium">{p.programme}</td>
                    <td>{p.department || '—'}</td>
                    <td>{p.level === 'hs' ? `${p.term_count} years` : `${p.term_count} semesters`}</td>
                    <td><StatusBadge label={p.is_active ? 'Active' : 'Inactive'} variant={p.is_active ? 'ok' : 'neutral'} /></td>
                    <td className="text-right space-x-1">
                      <button className="btn-ghost btn-sm" onClick={() => openEditor(p)}>Edit</button>
                      <button className="btn-ghost btn-sm" onClick={() => toggle(p)}>{p.is_active ? 'Deactivate' : 'Activate'}</button>
                      <button className="btn-ghost btn-sm text-bad" onClick={() => setRemoving(p)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={Boolean(editor)} onClose={() => setEditor(null)} title={editor?.id ? 'Edit' : 'Add programme'}>
        {editor && (
          <form onSubmit={save} className="space-y-4">
            <Field label="Level" htmlFor="pg-level">
              <select
                id="pg-level"
                className="input"
                value={editor.level}
                onChange={(e) => {
                  setAddingProg(false);
                  setAddingDept(false);
                  setEditor({ ...editor, level: e.target.value, programme: '', department: '', term_count: e.target.value === 'hs' ? 2 : 6 });
                }}
              >
                <option value="degree">Degree (semesters)</option>
                <option value="hs">Higher Secondary (HS 1st / 2nd year)</option>
              </select>
            </Field>
            {!hs && (
              <Field label="Programme" htmlFor="pg-prog" hint="Pick one already in use, or add a new one.">
                <PickOrAdd id="pg-prog" value={editor.programme} options={programmeOptions} adding={addingProg || programmeOptions.length === 0} setAdding={setAddingProg} onChange={(v) => setEditor({ ...editor, programme: v })} />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Field label={hs ? 'Stream' : 'Department'} htmlFor="pg-dept" hint={hs ? 'Arts or Science' : 'Pick an existing department or add a new one.'}>
                <PickOrAdd id="pg-dept" value={editor.department} options={departmentOptions} adding={addingDept || departmentOptions.length === 0} setAdding={setAddingDept} onChange={(v) => setEditor({ ...editor, department: v })} />
              </Field>
              <Field label={hs ? 'Number of years' : 'Number of semesters'} htmlFor="pg-count">
                <input id="pg-count" type="number" min="1" max="12" className="input" value={editor.term_count} onChange={(e) => setEditor({ ...editor, term_count: e.target.value })} required />
              </Field>
            </div>
            {error && <p className="error-text" role="alert">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setEditor(null)}>Cancel</button>
              <button className="btn-primary" disabled={busy}>Save</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={importing} onClose={closeImport} title="Import programmes from CSV" maxWidth="max-w-xl">
        <div className="space-y-4 text-sm">
          <p className="text-muted">
            One row per department or stream. Columns: <span className="font-mono">level</span> (<span className="font-mono">degree</span> or <span className="font-mono">hs</span>),{' '}
            <span className="font-mono">programme</span>, <span className="font-mono">department</span> (the stream for hs) and optional <span className="font-mono">terms</span>.
            Rows that already exist are skipped.
          </p>
          <button type="button" className="btn-ghost btn-sm" onClick={async () => saveBlob(new Blob([await setupApi.programmeTemplate()], { type: 'text/csv' }), 'programmes-template.csv')}>
            Download template (all college departments)
          </button>
          {!result && (
            <label className="btn-primary cursor-pointer w-fit">
              {busy ? 'Importing…' : 'Choose CSV file'}
              <input type="file" accept=".csv,text/csv" className="sr-only" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
            </label>
          )}
          {error && <p className="error-text" role="alert">{error}</p>}
          {result && (
            <div className="space-y-2" role="status">
              <p><strong>{result.created}</strong> added, <strong>{result.skipped}</strong> already existed{result.errors.length ? `, ${result.errors.length} with problems` : ''}.</p>
              {result.errors.length > 0 && (
                <ul className="text-bad list-disc pl-5 max-h-40 overflow-y-auto">
                  {result.errors.map((m) => <li key={m}>{m}</li>)}
                </ul>
              )}
              <button className="btn-primary" onClick={closeImport}>Done</button>
            </div>
          )}
        </div>
      </Modal>

      <Modal isOpen={Boolean(removing)} onClose={() => setRemoving(null)} title="Delete">
        <p className="text-sm text-muted">Delete “{removing?.name}”? Entries with registered students cannot be deleted — deactivate them instead.</p>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-ghost" onClick={() => setRemoving(null)}>Cancel</button>
          <button className="btn-danger" onClick={remove}>Delete</button>
        </div>
      </Modal>
    </div>
  );
}
