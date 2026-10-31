import React, { useEffect, useMemo, useState } from 'react';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { setupApi } from '../../api/deskApi';

const LEVELS = { degree: 'Degree (semesters)', hs: 'Higher secondary / school (years)' };

const parseCsv = (text) =>
  text
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(',').map((c) => c.trim()))
    .filter((c) => c.length >= 4 && c[1] && c[2])
    .map(([level, programme, department, terms]) => ({
      level: level === 'hs' ? 'hs' : 'degree',
      programme,
      department,
      terms: Number(terms) || (level === 'hs' ? 2 : 6),
      on: true,
    }));

const toCsv = (rows) =>
  ['level,programme,department,terms', ...rows.filter((r) => r.on).map((r) => `${r.level},${r.programme},${r.department},${r.terms}`)].join('\n') + '\n';

/**
 * The programmes and departments students are registered under. Starts with the college's standard list
 * (all ticked); untick, add or remove rows. Reports a CSV through onChange for the server.
 */
export default function ProgrammePlanner({ onChange }) {
  const [rows, setRows] = useState(null);
  const [draft, setDraft] = useState({ level: 'degree', programme: '', department: '', terms: 6 });

  useEffect(() => {
    setupApi.programmeTemplate().then((csv) => setRows(parseCsv(csv))).catch(() => setRows([]));
  }, []);
  useEffect(() => {
    if (rows) onChange(toCsv(rows));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const groups = useMemo(() => {
    const map = new Map();
    (rows || []).forEach((r, i) => {
      const key = `${r.level}|${r.programme}`;
      if (!map.has(key)) map.set(key, { level: r.level, programme: r.programme, items: [] });
      map.get(key).items.push({ ...r, i });
    });
    return [...map.values()];
  }, [rows]);

  if (!rows) return <p className="text-sm text-muted">Loading the standard list…</p>;

  const patch = (i, p) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const setGroup = (g, on) => setRows((rs) => rs.map((r) => (r.level === g.level && r.programme === g.programme ? { ...r, on } : r)));
  const remove = (i) => setRows((rs) => rs.filter((_, j) => j !== i));
  const add = () => {
    const programme = draft.programme.trim() || (draft.level === 'hs' ? 'Higher Secondary' : '');
    const department = draft.department.trim();
    if (!programme || !department || /[,\n]/.test(programme + department)) return;
    setRows((rs) => [...rs, { level: draft.level, programme, department, terms: Number(draft.terms) || 1, on: true }]);
    setDraft({ ...draft, department: '' });
  };
  const selected = rows.filter((r) => r.on).length;
  const termWord = (level) => (level === 'hs' ? 'years' : 'semesters');

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-brand-soft text-sm p-3 space-y-1">
        <p className="font-medium">Configure your college, school or university programmes and departments</p>
        <p className="text-muted">
          Desk Officers choose a student&rsquo;s programme, department and semester from this list when registering them, so registration is quick
          and consistent. The standard list below is ready to use: untick anything you do not have, or add your own.
        </p>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-brand-fg font-medium">What do these mean?</summary>
        <ul className="mt-2 space-y-1 text-muted list-disc pl-5">
          <li><b>Programme</b>: the course of study, e.g. Bachelor of Science, Bachelor of Arts, Higher Secondary, Class 10.</li>
          <li><b>Department or stream</b>: the subject area inside it, e.g. Physics, English, or the stream Arts / Science.</li>
          <li><b>Terms</b>: how many semesters (degree) or years (higher secondary or school) the course has. Students are registered in one of them.</li>
        </ul>
      </details>

      <div className="border border-line rounded-lg divide-y divide-line">
        {groups.length === 0 && <p className="p-4 text-sm text-muted">Nothing listed. Add your first programme below.</p>}
        {groups.map((g) => {
          const all = g.items.every((r) => r.on);
          return (
            <div key={`${g.level}|${g.programme}`}>
              <label className="flex items-center gap-3 px-4 py-2.5 bg-recessed cursor-pointer">
                <input type="checkbox" checked={all} onChange={(e) => setGroup(g, e.target.checked)} />
                <span className="font-medium">{g.programme}</span>
                <span className="text-xs text-muted">{LEVELS[g.level]}</span>
              </label>
              <ul>
                {g.items.map((r) => (
                  <li key={r.i} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <input type="checkbox" checked={r.on} onChange={(e) => patch(r.i, { on: e.target.checked })} aria-label={`Include ${r.department}`} />
                    <span className={`flex-1 ${r.on ? '' : 'text-muted line-through'}`}>{r.department}</span>
                    <input
                      type="number"
                      min="1"
                      max="12"
                      className="input w-16 py-1 text-center"
                      value={r.terms}
                      onChange={(e) => patch(r.i, { terms: Number(e.target.value) })}
                      aria-label={`Number of ${termWord(r.level)} for ${r.department}`}
                    />
                    <span className="text-xs text-muted w-20">{termWord(r.level)}</span>
                    <button type="button" className="btn-ghost btn-sm p-1" onClick={() => remove(r.i)} aria-label={`Remove ${r.department}`}>
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted">{selected} {selected === 1 ? 'department' : 'departments'} selected. You can change all of this later under Programmes.</p>

      <div className="border border-line rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium">Add another</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <select className="input" value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value, terms: e.target.value === 'hs' ? 2 : 6 })} aria-label="Type">
            {Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input className="input" placeholder={draft.level === 'hs' ? 'Programme (default: Higher Secondary)' : 'Programme, e.g. Bachelor of Science'} value={draft.programme} onChange={(e) => setDraft({ ...draft, programme: e.target.value })} />
          <input className="input" placeholder="Department or stream, e.g. Physics" value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} />
          <div className="flex gap-2 items-center">
            <input type="number" min="1" max="12" className="input w-20" value={draft.terms} onChange={(e) => setDraft({ ...draft, terms: e.target.value })} aria-label="Number of terms" />
            <span className="text-sm text-muted">{termWord(draft.level)}</span>
            <button type="button" className="btn-secondary btn-sm ml-auto" onClick={add}><PlusIcon className="w-4 h-4" /> Add</button>
          </div>
        </div>
      </div>
    </div>
  );
}
