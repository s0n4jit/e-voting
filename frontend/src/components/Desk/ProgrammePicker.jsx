import React from 'react';
import { Field } from '../ui';

/**
 * Three linked dropdowns built from the configured programmes:
 * Programme -> Department (Stream for Higher Secondary) -> Semester (Year for Higher Secondary).
 * value = { programme, programme_id, semester } (all strings); onChange receives the next value.
 */
export default function ProgrammePicker({ programmes, value, onChange, errors = {}, idPrefix = 'pp' }) {
  const names = [...new Set(programmes.map((p) => p.programme))];
  const rows = programmes.filter((p) => p.programme === value.programme);
  const row = programmes.find((p) => String(p.id) === String(value.programme_id));
  const hs = (row || rows[0])?.level === 'hs';

  return (
    <div className="grid sm:grid-cols-3 gap-4">
      <Field label="Programme" htmlFor={`${idPrefix}-programme`} error={errors.programme_id}>
        <select
          id={`${idPrefix}-programme`}
          className="input"
          required
          value={value.programme}
          onChange={(e) => onChange({ programme: e.target.value, programme_id: '', semester: '' })}
        >
          <option value="">Select…</option>
          {names.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </Field>
      <Field label={hs ? 'Stream' : 'Department'} htmlFor={`${idPrefix}-department`}>
        <select
          id={`${idPrefix}-department`}
          className="input"
          required
          disabled={!value.programme}
          value={value.programme_id}
          onChange={(e) => onChange({ ...value, programme_id: e.target.value, semester: '' })}
        >
          <option value="">Select…</option>
          {rows.map((p) => (
            <option key={p.id} value={p.id}>{p.department}</option>
          ))}
        </select>
      </Field>
      <Field label={hs ? 'Year' : 'Semester'} htmlFor={`${idPrefix}-semester`} error={errors.semester}>
        <select
          id={`${idPrefix}-semester`}
          className="input"
          required
          disabled={!row}
          value={value.semester}
          onChange={(e) => onChange({ ...value, semester: e.target.value })}
        >
          <option value="">Select…</option>
          {row?.terms.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </Field>
    </div>
  );
}
