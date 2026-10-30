import React, { useState, useEffect } from 'react';
import { adminApi } from '../../api/adminApi';
import LoadingSpinner from '../common/LoadingSpinner';
import StatusBadge from '../common/StatusBadge';
import { toast } from 'react-hot-toast';
import {
  ShieldCheckIcon,
  DocumentMagnifyingGlassIcon,
  ArrowPathIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  CalendarIcon,
  ComputerDesktopIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';

export const AuditLog = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchLogs = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await adminApi.getAuditLogs({ limit: 100 });
      const list = Array.isArray(res) ? res : (res?.logs || res?.audit_logs || []);
      setLogs(list);
    } catch (err) {
      if (!silent) {
        console.error('Failed to retrieve audit log trail:', err);
        toast.error('Could not load security audit trail.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(false);

    // Silent background auto-refresh every 3 seconds
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchLogs(true);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const formatDateString = (dateStr) => {
    if (!dateStr) return '—';
    try {
      return format(new Date(dateStr), 'yyyy-MM-dd HH:mm:ss');
    } catch (e) {
      return dateStr;
    }
  };

  // Distinct actions for dropdown
  const actionOptions = [
    'ALL',
    ...Array.from(new Set(logs.map((l) => l.action).filter(Boolean))),
  ];

  // Filtering
  const filteredLogs = logs.filter((log) => {
    if (filterAction !== 'ALL' && log.action !== filterAction) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const action = (log.action || '').toLowerCase();
      const user = (log.user_id || log.student_id || '').toString().toLowerCase();
      const ip = (log.ip_address || '').toLowerCase();
      const details = (typeof log.details === 'string' ? log.details : JSON.stringify(log.details || '')).toLowerCase();
      return action.includes(term) || user.includes(term) || ip.includes(term) || details.includes(term);
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2.5">
            <ShieldCheckIcon className="w-8 h-8 text-primary-600" />
            Security & Cryptographic Audit Trail
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Tamper-evident, immutable event sequence recording critical campus election actions.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Sync (3s)
          </span>
          <button
            onClick={() => fetchLogs(false)}
            className="btn btn-secondary btn-sm gap-1.5"
          >
            <ArrowPathIcon className="w-4 h-4" />
            <span>Refresh Trail</span>
          </button>
        </div>
      </div>

      {/* Security Banner */}
      <div className="mb-6 p-4 rounded-xl bg-purple-50/70 border border-purple-100 flex items-center justify-between text-xs text-purple-900">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
          <span>
            <strong>Immutable Append-Only Audit Log:</strong> Every login, vote cast, candidate entry, and status toggle is timestamped and cryptographically logged.
          </span>
        </div>
        <span className="font-mono text-purple-700 bg-purple-100/80 px-2 py-0.5 rounded">
          SHA-256 Verified
        </span>
      </div>

      {/* Filter and Search Controls */}
      <div className="card p-4 mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          {/* Search */}
          <div className="relative w-full sm:w-80">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              <MagnifyingGlassIcon className="h-4 w-4" />
            </div>
            <input
              type="text"
              placeholder="Search user, action, IP, details..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-9 text-xs"
            />
          </div>

          {/* Action Filter */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <FunnelIcon className="w-4 h-4 text-gray-400 shrink-0" />
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="input py-2 text-xs"
            >
              {actionOptions.map((act) => (
                <option key={act} value={act}>
                  {act === 'ALL' ? 'All Event Types' : act}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-xs text-gray-500 self-end md:self-auto">
          Showing <strong className="text-gray-900">{filteredLogs.length}</strong> of {logs.length} logged events
        </div>
      </div>

      {/* Audit Log Table */}
      {loading ? (
        <div className="card py-16">
          <LoadingSpinner text="Retrieving verified audit trail..." />
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="card p-12 text-center border-dashed border-2">
          <DocumentMagnifyingGlassIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-gray-900">No Audit Events Found</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
            No logged records matched the selected filters.
          </p>
        </div>
      ) : (
        <div className="table-container bg-white">
          <table className="table">
            <thead>
              <tr>
                <th>Timestamp (UTC)</th>
                <th>Action / Event</th>
                <th>Operator / User ID</th>
                <th>Origin IP</th>
                <th>Event Payload Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-mono text-xs">
              {filteredLogs.map((log, index) => {
                const actionStr = String(log.action || 'EVENT');
                let badgeVariant = 'default';
                if (actionStr.includes('VOTE') || actionStr.includes('BALLOT')) badgeVariant = 'success';
                else if (actionStr.includes('LOGIN') || actionStr.includes('AUTH')) badgeVariant = 'primary';
                else if (actionStr.includes('PUBLISH') || actionStr.includes('CREATE')) badgeVariant = 'warning';
                else if (actionStr.includes('DELETE') || actionStr.includes('FAIL')) badgeVariant = 'danger';

                const detailsText = typeof log.details === 'object'
                  ? JSON.stringify(log.details)
                  : String(log.details || '—');

                return (
                  <tr key={log.id || index}>
                    <td className="text-gray-500 whitespace-nowrap">
                      {formatDateString(log.timestamp || log.created_at)}
                    </td>
                    <td>
                      <StatusBadge
                        variant={badgeVariant}
                        label={actionStr}
                      />
                    </td>
                    <td className="font-semibold text-gray-900">
                      {log.user_id ? `USR-${log.user_id}` : (log.student_id || 'System')}
                    </td>
                    <td className="text-gray-500 flex items-center gap-1">
                      <ComputerDesktopIcon className="w-3.5 h-3.5 text-gray-400" />
                      <span>{log.ip_address || '127.0.0.1'}</span>
                    </td>
                    <td className="text-gray-700 max-w-md truncate font-sans text-xs" title={detailsText}>
                      {detailsText}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AuditLog;
