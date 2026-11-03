import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownTrayIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PrinterIcon,
  TicketIcon,
  TrashIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline';
import { deskApi, saveBlob } from '../../api/deskApi';
import { EmptyState, PageHeader, TableSkeleton, errorMessage } from '../ui';
import { toast } from 'react-hot-toast';
import Modal from '../common/Modal';
import StatusBadge from '../common/StatusBadge';
import StudentPanel from './StudentPanel';
import ImportStudents from './ImportStudents';
import IssuePins from './IssuePins';
import SlipSheet, { slipsCsv } from './SlipSheet';
import { useAuth } from '../../context/AuthContext';
import { usePolling } from '../../hooks/usePolling';

const STATUS = { registered: 'No PIN yet', pin_active: 'PIN issued', active: 'Active', voted: 'Voted' };
const TONE = { registered: 'brand', pin_active: 'warn', active: 'ok', voted: 'ok' };

export default function Registrations() {
  const [programmes, setProgrammes] = useState([]);
  const [filters, setFilters] = useState({ q: '', programme_id: '', semester: '', duplicates: '' });
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true, rows: [], total: 0, per_page: 25, duplicate_count: 0, error: '' });
  const [selected, setSelected] = useState(null);
  const { role } = useAuth();
  const [election, setElection] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [confirmWord, setConfirmWord] = useState('');

  // Bulk operations and search & select state
  const [selectedSlips, setSelectedSlips] = useState(new Set());
  const [bulkActionBusy, setBulkActionBusy] = useState(false);
  const [bulkPrintResult, setBulkPrintResult] = useState(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [deleteSingleTarget, setDeleteSingleTarget] = useState(null);

  useEffect(() => {
    deskApi.getProgrammes().then(setProgrammes).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const params = { page, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) };
      const res = await deskApi.list(params);
      setElection(res.election);
      setState({
        loading: false,
        rows: res.registrations,
        total: res.total,
        per_page: res.per_page,
        duplicate_count: res.duplicate_count || 0,
        error: '',
      });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: errorMessage(err) }));
    }
  }, [filters, page]);

  useEffect(() => {
    const t = setTimeout(load, filters.q ? 250 : 0); // debounce typing only
    return () => clearTimeout(t);
  }, [load, filters.q]);

  usePolling(load, 2000); // statuses follow the booths live

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
      setSelectedSlips(new Set());
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

  // Selection handlers
  const onPageSlipIds = state.rows.map((r) => r.slip_id);
  const allOnPageSelected = onPageSlipIds.length > 0 && onPageSlipIds.every((id) => selectedSlips.has(id));
  const someOnPageSelected = onPageSlipIds.some((id) => selectedSlips.has(id));

  const toggleSelectAllOnPage = () => {
    setSelectedSlips((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        onPageSlipIds.forEach((id) => next.delete(id));
      } else {
        onPageSlipIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const toggleSelect = (slipId) => {
    setSelectedSlips((prev) => {
      const next = new Set(prev);
      if (next.has(slipId)) {
        next.delete(slipId);
      } else {
        next.add(slipId);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedSlips(new Set());

  // Bulk actions
  const handleBulkIssuePins = async () => {
    if (!selectedSlips.size) return;
    setBulkActionBusy(true);
    try {
      const res = await deskApi.issueAllPins(Array.from(selectedSlips));
      setBulkPrintResult(res);
      toast.success(`${res.issued} PIN(s) issued for selected students`);
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBulkActionBusy(false);
    }
  };

  const handleBulkPrintSlips = async () => {
    if (!selectedSlips.size) return;
    setBulkActionBusy(true);
    try {
      const res = await deskApi.issueAllPins(Array.from(selectedSlips));
      setBulkPrintResult(res);
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBulkActionBusy(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedSlips.size) return;
    setBulkActionBusy(true);
    try {
      const res = await deskApi.bulkDelete(Array.from(selectedSlips));
      toast.success(
        `${res.deleted} registration(s) deleted${res.skipped_voted ? ` (${res.skipped_voted} skipped as already voted)` : ''}`
      );
      setConfirmBulkDelete(false);
      clearSelection();
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBulkActionBusy(false);
    }
  };

  const handleSingleDelete = async () => {
    if (!deleteSingleTarget) return;
    setBulkActionBusy(true);
    try {
      await deskApi.deleteStudent(deleteSingleTarget.slip_id);
      toast.success(`Registration for ${deleteSingleTarget.name} deleted`);
      setDeleteSingleTarget(null);
      setSelectedSlips((prev) => {
        const next = new Set(prev);
        next.delete(deleteSingleTarget.slip_id);
        return next;
      });
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBulkActionBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Registrations of voter students"
        subtitle={`${state.total} ${state.total === 1 ? 'student' : 'students'} registered${election ? ` for ${election.title}` : ''}`}
        actions={
          <>
            <ImportStudents onDone={load} />
            <IssuePins onDone={load} disabled={!state.total} />
            {canRemove && (
              <button className="btn-ghost text-bad" onClick={() => setRemoving(true)}>
                Remove all
              </button>
            )}
            <button className="btn-secondary" onClick={exportCsv}>
              <ArrowDownTrayIcon className="w-4 h-4" /> Export CSV
            </button>
            <Link to="/desk" className="btn-primary">
              <UserPlusIcon className="w-4 h-4" /> Register student
            </Link>
          </>
        }
      />

      {/* Duplicate notice banner */}
      {state.duplicate_count > 0 && (
        <div className="mb-4 rounded-xl border border-amber-300/80 bg-amber-50 dark:bg-amber-950/30 p-3 px-4 text-amber-900 dark:text-amber-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div className="text-sm">
              <span className="font-semibold">{state.duplicate_count} potential duplicate registration(s) detected.</span>
              <span className="text-xs text-amber-800 dark:text-amber-300 ml-1.5">
                Review and delete accidental duplicate records before or during voting.
              </span>
            </div>
          </div>
          <button
            className={`btn-sm ${filters.duplicates === '1' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter('duplicates', filters.duplicates === '1' ? '' : '1')}
          >
            {filters.duplicates === '1' ? 'Show all students' : 'Filter duplicates only'}
          </button>
        </div>
      )}

      {/* Bulk actions banner */}
      {selectedSlips.size > 0 && (
        <div className="card bg-brand/5 border-brand/30 p-3 px-4 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-sm">
              {selectedSlips.size} student{selectedSlips.size > 1 ? 's' : ''} selected
            </span>
            <button className="text-xs text-muted hover:underline cursor-pointer" onClick={clearSelection}>
              Clear selection
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary btn-sm" onClick={handleBulkIssuePins} disabled={bulkActionBusy}>
              <TicketIcon className="w-4 h-4" /> Issue PINs
            </button>
            <button className="btn-secondary btn-sm" onClick={handleBulkPrintSlips} disabled={bulkActionBusy}>
              <PrinterIcon className="w-4 h-4" /> Print slips
            </button>
            <button className="btn-danger btn-sm" onClick={() => setConfirmBulkDelete(true)} disabled={bulkActionBusy}>
              <TrashIcon className="w-4 h-4" /> Delete selected
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="p-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <MagnifyingGlassIcon className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              className="input pl-9"
              placeholder="Search by name, roll no. or voter slip ID"
              aria-label="Search registrations"
              value={filters.q}
              onChange={(e) => setFilter('q', e.target.value)}
            />
          </div>
          <select
            className="input sm:w-56"
            aria-label="Filter by programme"
            value={filters.programme_id}
            onChange={(e) => setFilter('programme_id', e.target.value)}
          >
            <option value="">All programmes</option>
            {programmes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            className="input sm:w-40"
            aria-label="Filter by semester or year"
            value={filters.semester}
            onChange={(e) => setFilter('semester', e.target.value)}
            disabled={!programme}
          >
            <option value="">{programme ? `All ${programme.level === 'hs' ? 'years' : 'semesters'}` : 'Semester / year'}</option>
            {programme?.terms.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {state.loading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : state.error ? (
          <EmptyState title="Could not load registrations">{state.error}</EmptyState>
        ) : state.rows.length === 0 ? (
          <EmptyState
            icon={UserPlusIcon}
            title={filters.q || filters.programme_id || filters.duplicates ? 'No matching students' : 'No students registered yet'}
          >
            {filters.q || filters.programme_id || filters.duplicates
              ? 'Try a different search or filter.'
              : 'Registered students will appear here.'}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto border-t border-line">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-10 text-center">
                    <input
                      type="checkbox"
                      className="cursor-pointer"
                      aria-label="Select all on this page"
                      checked={allOnPageSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected;
                      }}
                      onChange={toggleSelectAllOnPage}
                    />
                  </th>
                  <th>Voter slip ID</th>
                  <th>Name</th>
                  <th>Roll or enrollment no.</th>
                  <th>Programme</th>
                  <th>Term</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((r) => {
                  const isSelected = selectedSlips.has(r.slip_id);
                  return (
                    <tr
                      key={r.slip_id}
                      className={`cursor-pointer ${isSelected ? 'bg-brand/5' : ''}`}
                      onClick={() => setSelected(r)}
                      onKeyDown={(e) => e.key === 'Enter' && setSelected(r)}
                      tabIndex={0}
                    >
                      <td className="w-10 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="cursor-pointer"
                          aria-label={`Select ${r.name}`}
                          checked={isSelected}
                          onChange={() => toggleSelect(r.slip_id)}
                        />
                      </td>
                      <td className="font-mono text-xs">{r.slip_id}</td>
                      <td className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{r.name}</span>
                          {r.is_duplicate && (
                            <span className="badge badge-warn text-[10px] px-1.5 py-0.5" title="Duplicate name or roll number detected">
                              Duplicate
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="font-mono text-xs">{r.roll_no || <span className="text-muted">-</span>}</td>
                      <td>{[r.programme, r.department].filter(Boolean).join(' · ')}</td>
                      <td>{r.term}</td>
                      <td>
                        <StatusBadge label={STATUS[r.status]} variant={TONE[r.status]} />
                      </td>
                      <td className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            className="p-1 rounded-md text-muted hover:text-foreground hover:bg-surface-variant transition-colors"
                            title="Edit student"
                            aria-label={`Edit ${r.name}`}
                            onClick={() => setSelected(r)}
                            disabled={r.status === 'voted'}
                          >
                            <PencilSquareIcon className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            className="p-1 rounded-md text-muted hover:text-bad hover:bg-bad/10 transition-colors"
                            title="Delete student"
                            aria-label={`Delete ${r.name}`}
                            onClick={() => setDeleteSingleTarget(r)}
                            disabled={r.status === 'voted'}
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-line text-sm">
            <span className="text-muted">
              Page {page} of {pages}
            </span>
            <div className="flex gap-2">
              <button className="btn-secondary btn-sm" onClick={() => setPage(page - 1)} disabled={page <= 1}>
                Previous
              </button>
              <button className="btn-secondary btn-sm" onClick={() => setPage(page + 1)} disabled={page >= pages}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Student Details & Edit Modal */}
      <Modal isOpen={Boolean(selected)} onClose={() => setSelected(null)} title="Registration details" maxWidth="max-w-4xl">
        {selected && (
          <StudentPanel
            student={selected}
            programmes={programmes}
            onChanged={() => {
              load();
              setSelected(null);
            }}
          />
        )}
      </Modal>

      {/* Bulk Print & PINs Modal */}
      <Modal
        isOpen={Boolean(bulkPrintResult)}
        onClose={() => setBulkPrintResult(null)}
        title="Voting slips for selected students"
        maxWidth="max-w-2xl"
      >
        {bulkPrintResult && (
          <div className="space-y-4">
            <p className="text-sm">
              {bulkPrintResult.issued > 0 ? `${bulkPrintResult.issued} new PIN(s) issued. ` : ''}
              {bulkPrintResult.students.length} slip(s) are ready to print.
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="btn-secondary"
                onClick={() =>
                  saveBlob(
                    new Blob([slipsCsv(bulkPrintResult.students)], { type: 'text/csv' }),
                    'selected-voter-slips.csv'
                  )
                }
              >
                Download (CSV)
              </button>
              <button className="btn-primary" onClick={() => window.print()} disabled={!bulkPrintResult.students.length}>
                <PrinterIcon className="w-4 h-4" /> Print slips
              </button>
            </div>
            <SlipSheet students={bulkPrintResult.students} electionTitle={bulkPrintResult.election_title} />
          </div>
        )}
      </Modal>

      {/* Single Delete Confirmation Modal */}
      <Modal isOpen={Boolean(deleteSingleTarget)} onClose={() => setDeleteSingleTarget(null)} title="Delete student registration">
        {deleteSingleTarget && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Are you sure you want to delete the registration for <strong className="text-foreground">{deleteSingleTarget.name}</strong> (
              <span className="font-mono">{deleteSingleTarget.slip_id}</span>)? This will permanently remove their voter registration and
              revoke their voter slip and any issued PIN.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setDeleteSingleTarget(null)} disabled={bulkActionBusy}>
                Cancel
              </button>
              <button className="btn-danger" onClick={handleSingleDelete} disabled={bulkActionBusy}>
                {bulkActionBusy ? 'Deleting…' : 'Delete student'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Bulk Delete Confirmation Modal */}
      <Modal isOpen={confirmBulkDelete} onClose={() => setConfirmBulkDelete(false)} title="Delete selected registrations">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Are you sure you want to delete <strong className="text-foreground">{selectedSlips.size}</strong> selected student
            registration(s)? This will permanently remove their records and revoke any issued slips and PINs.
          </p>
          <p className="text-xs text-muted">
            Note: Any voter who has already cast a ballot in this election cannot be deleted and will be kept safe.
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setConfirmBulkDelete(false)} disabled={bulkActionBusy}>
              Cancel
            </button>
            <button className="btn-danger" onClick={handleBulkDelete} disabled={bulkActionBusy}>
              {bulkActionBusy ? 'Deleting…' : `Delete ${selectedSlips.size} students`}
            </button>
          </div>
        </div>
      </Modal>

      {/* Remove All Modal */}
      <Modal isOpen={removing} onClose={() => setRemoving(false)} title="Remove all students">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            This removes every student registered for {election?.title} together with their slips and PINs. It cannot be undone. It is only
            possible before voting opens.
          </p>
          <input
            className="input font-mono"
            placeholder="Type DELETE to confirm"
            value={confirmWord}
            onChange={(e) => setConfirmWord(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setRemoving(false)}>
              Cancel
            </button>
            <button className="btn-danger" disabled={confirmWord !== 'DELETE'} onClick={removeAll}>
              Remove all students
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
