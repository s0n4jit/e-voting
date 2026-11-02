import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { adminApi } from '../../api/adminApi';
import { Field, errorMessage } from '../ui';

/** How every booth prints the vote copy. The printer itself is connected to each booth machine (see Booth setup). */
export default function PrintingSettings() {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminApi.getPrinting().then(setForm).catch(() => {});
  }, []);
  if (!form) return null;

  const save = async () => {
    setBusy(true);
    try {
      setForm(await adminApi.savePrinting(form));
      toast.success('Printing settings saved');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card card-body space-y-4">
      <h2 className="font-semibold">Booth printing</h2>
      <p className="text-sm text-muted">
        After each vote the booth prints a vote copy for the voter to drop into the box, silently, and keeps a copy on the booth machine's disk.
        Connect the printer on the booth machine with <code>sudo evote setup</code>.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
        Print a vote copy after each vote
      </label>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Printer name (optional)" htmlFor="p-name" hint="Leave empty to use each booth's default printer.">
          <input id="p-name" className="input" value={form.printer} maxLength={100} onChange={(e) => setForm({ ...form, printer: e.target.value })} />
        </Field>
        <Field label="Copies" htmlFor="p-copies">
          <select id="p-copies" className="input" value={form.copies} onChange={(e) => setForm({ ...form, copies: Number(e.target.value) })}>
            {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
      </div>
      <button className="btn-primary w-fit" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save printing settings'}</button>
    </div>
  );
}
