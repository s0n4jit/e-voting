import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownTrayIcon, MagnifyingGlassIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import { deskApi, saveBlob } from '../../api/deskApi';
import { EmptyState, PageHeader, TableSkeleton, errorMessage } from '../ui';
import { toast } from 'react-hot-toast';
import Modal from '../common/Modal';
import StatusBadge from '../common/StatusBadge';
import StudentPanel from './StudentPanel';
import ImportStudents from './ImportStudents';
import IssuePins from './IssuePins';
import { useAuth } from '../../context/AuthContext';
import { usePolling } from '../../hooks/usePolling';

const STATUS = { registered: 'No PIN yet', pin_active: 'PIN issued', active: 'Active', voted: 'Voted' };
const TONE = { registered: 'brand', pin_active: 'warn', active: 'ok', voted: 'ok' };

export default function Registrations() {
  const [programmes, setProgrammes] = useState([]);
  const [filters, setFilters] = useState({ q: '', programme_id: '', semester: '' });
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true, rows: [], total: 0, per_page: 25, error: '' });
  const [selected, setSelected] = useState(null);
  const { role } = useAuth();
  const [election, setElection] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [confirmWord, setConfirmWord] = useState('');

  useEffect(() => {
    deskApi.getProgrammes().then(setProgrammes).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const params = { page, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) };
      const res = await deskApi.list(params);
      setElection(res.election);
      setState({ loading: false, rows: res.registrations, total: res.total, per_page: res.per_page, error: '' });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: errorMessage(err) }));
    }
  }, [filters, page]);

  useEffect(() => {
    const t = setTimeout(load, filters.q ? 250 : 0); // debounce typing only
    return () => clearTimeout(t);
  }, [load, filters.q]);

  usePolling(load, 2000); // statuses (no PIN / PIN issued / active / voted) update live without a refresh

  // keep the open details panel in step with the latest list
  useEffect(() => {
    setSelected((cur) => (cur ? state.rows.find((r) => r.slip_id === cur.slip_id) || cur : cur));
  }, [state.rows]);

  const programme = programmes.find((p) => String(p.id) === String(filters.programme_id));
  const pages = Math.max(Math.ceil(state.total / state.per_page), 1);
  const setFilter = (key, value) => {
    setPage(1);
    setFilters((f) => ({ ...f, [key]: value, ...(key === 'programme_id' ? { semester: '' } : {}) }));
  };

  const canRemove = role === 'admin' && ['setup', 'registration', 'ready'].includes(election?.status) && state.total > 0;
  const removeAll = async () => {
    try {
      const res = await deskApi.removeAll();
      toast.success(`${res.removed} students removed`);
      setRemoving(false);
      setConfirmWord('');
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const exportCsv = async () => {
    try {
      saveBlob(await deskApi.exportCsv(), 'registrations.csv');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="Registrations"
        subtitle={`${state.total} registered ${state.total === 1 ? 'student' : 'students'}${election ? ` for ${election.title}` : ''} · updates live`}
        actions={
          <>
            <ImportStudents onDone={load} />
            <IssuePins onDone={load} disabled={!state.total} />
            {canRemove && <button className="btn-ghost text-bad" onClick={() => setRemoving(true)}>Remove all</button>}
            <button className="btn-secondary" onClick={exportCsv}>
              <ArrowDownTrayIcon className="w-4 h-4" /> Export CSV
            </button>
            <Link to="/desk" className="btn-primary">
              <UserPlusIcon className="w-4 h-4" /> Register student
            </Link>
          </>
        }
      />

      <div className="card">
        <div className="p-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <MagnifyingGlassIcon className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              className="input pl-9"
              placeholder="Search by name or voter slip ID"
              aria-label="Search registrations"
              value={filters.q}
              onChange={(e) => setFilter('q', e.target.value)}
            />
          </div>
          <select className="input sm:w-56" aria-label="Filter by programme" value={filters.programme_id} onChange={(e) => setFilter('programme_id', e.target.value)}>
            <option value="">All programmes</option>
            {programmes.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select className="input sm:w-40" aria-label="Filter by semester or year" value={filters.semester} onChange={(e) => setFilter('semester', e.target.value)} disabled={!programme}>
            <option value="">{programme ? `All ${programme.level === 'hs' ? 'years' : 'semesters'}` : 'Semester / year'}</option>
            {programme?.terms.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {state.loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : state.error ? (
          <EmptyState title="Could not load registrations">{state.error}</EmptyState>
        ) : state.rows.length === 0 ? (
          <EmptyState icon={UserPlusIcon} title={filters.q || filters.programme_id ? 'No matching students' : 'No students registered yet'}>
            {filters.q || filters.programme_id ? 'Try a different search or filter.' : 'Registered students will appear here.'}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto border-t border-line">
            <table className="table">
              <thead>
                <tr>
                  <th>Voter slip ID</th>
                  <th>Name</th>
                  <th>Programme</th>
                  <th>Term</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((r) => (
                  <tr key={r.slip_id} className="cursor-pointer" onClick={() => setSelected(r)} onKeyDown={(e) => e.key === 'Enter' && setSelected(r)} tabIndex={0}>
                    <td className="font-mono text-xs">{r.slip_id}</td>
                    <td className="font-medium">{r.name}</td>
                    <td>{[r.programme, r.department].filter(Boolean).join(' · ')}</td>
                    <td>{r.term}</td>
                    <td><StatusBadge label={STATUS[r.status]} variant={TONE[r.status]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-line text-sm">
            <span className="text-muted">Page {page} of {pages}</span>
            <div className="flex gap-2">
              <button className="btn-secondary btn-sm" onClick={() => setPage(page - 1)} disabled={page <= 1}>Previous</button>
              <button className="btn-secondary btn-sm" onClick={() => setPage(page + 1)} disabled={page >= pages}>Next</button>
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={Boolean(selected)} onClose={() => setSelected(null)} title="Registration details" maxWidth="max-w-4xl">
        {selected && <StudentPanel student={selected} programmes={programmes} onChanged={load} />}
      </Modal>
      <Modal isOpen={removing} onClose={() => setRemoving(false)} title="Remove all students">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            This removes every student registered for {election?.title} together with their slips and PINs. It cannot be undone. It is only possible before voting opens.
          </p>
          <input className="input font-mono" placeholder="Type DELETE to confirm" value={confirmWord} onChange={(e) => setConfirmWord(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setRemoving(false)}>Cancel</button>
            <button className="btn-danger" disabled={confirmWord !== 'DELETE'} onClick={removeAll}>Remove all students</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
