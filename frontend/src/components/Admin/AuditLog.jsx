import React, { useState, useEffect } from 'react';
import { adminApi } from '../../api/adminApi';
import LoadingSpinner from '../common/LoadingSpinner';
import { toast } from 'react-hot-toast';
import {
  ShieldCheckIcon,
  DocumentMagnifyingGlassIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  ClockIcon,
  ComputerDesktopIcon,
  UserIcon,
  KeyIcon,
  TicketIcon,
  CheckBadgeIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';

export const AuditLog = () => {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

  const fetchLogs = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await adminApi.getAuditLogs({
        category: category !== 'all' ? category : undefined,
        search: searchTerm.trim() || undefined,
        limit: 150,
      });

      const list = Array.isArray(res) ? res : res?.logs || [];
      setLogs(list);
      if (res?.stats) setStats(res.stats);
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
  }, [category]);

  // Real-time silent refresh every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchLogs(true);
    }, 4000);
    return () => clearInterval(interval);
  }, [category, searchTerm]);

  const handleExportCsv = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch('/api/admin/audit-logs/export', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cevs_certified_audit_trail_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success('Certified election audit ledger downloaded.');
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Failed to export audit ledger.');
    }
  };

  const getActionBadge = (action) => {
    if (['BALLOT_CAST', 'VOTE_CAST', 'BALLOT_SEALED'].includes(action)) {
      return {
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        icon: CheckBadgeIcon,
        label: 'Ballot Sealed',
      };
    }
    if (['PIN_ISSUED', 'VOTING_TOKEN_GENERATED'].includes(action)) {
      return {
        bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        icon: TicketIcon,
        label: 'PIN Slip Issued',
      };
    }
    if (['STUDENT_AUTO_ENROLLED_AT_DESK', 'VOTER_REGISTERED'].includes(action)) {
      return {
        bg: 'bg-amber-50 text-amber-700 border-amber-200',
        icon: UserIcon,
        label: 'Voter Enrolled',
      };
    }
    if (['STAFF_MAINTENANCE_ACTION'].includes(action)) {
      return {
        bg: 'bg-cyan-50 text-cyan-700 border-cyan-200',
        icon: ComputerDesktopIcon,
        label: 'Kiosk Hardware',
      };
    }
    if (['LOGIN_SUCCESS', 'MFA_VERIFIED', 'TOTP_2FA_ENABLED'].includes(action)) {
      return {
        bg: 'bg-blue-50 text-blue-700 border-blue-200',
        icon: KeyIcon,
        label: 'Staff Auth',
      };
    }
    if (['LOGIN_FAILED', 'UNAUTHORIZED_ACCESS'].includes(action)) {
      return {
        bg: 'bg-rose-50 text-rose-700 border-rose-200',
        icon: ExclamationTriangleIcon,
        label: 'Security Alert',
      };
    }
    return {
      bg: 'bg-slate-100 text-slate-700 border-slate-200',
      icon: InformationCircleIcon,
      label: action,
    };
  };

  const categories = [
    { id: 'all', label: 'All Operations' },
    { id: 'ballot', label: '🗳️ Ballots Sealed' },
    { id: 'pin', label: '🎫 PIN Slips Issued' },
    { id: 'enroll', label: '👥 Desk Check-ins' },
    { id: 'auth', label: '🔑 Staff Logins & 2FA' },
    { id: 'kiosk', label: '🖥️ Kiosk Maintenance' },
  ];

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            Election Transparency & Audit Trail
            <span className="px-2.5 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold font-mono">
              IMMUTABLE
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Complete cryptographic activity ledger: who performed what operation, when, and from which station.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchLogs(false)}
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors shadow-sm"
            title="Refresh Ledger"
          >
            <ArrowPathIcon className="w-4 h-4" />
          </button>
          <button
            onClick={handleExportCsv}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            <span>Export Certified CSV</span>
          </button>
        </div>
      </div>

      {/* Top Stat Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Records</p>
          <p className="text-xl font-black text-slate-900 mt-1">{stats?.total_records || logs.length}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Ballots Sealed</p>
          <p className="text-xl font-black text-emerald-600 mt-1">{stats?.ballots_cast || 0}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">PIN Slips Issued</p>
          <p className="text-xl font-black text-indigo-600 mt-1">{stats?.pins_issued || 0}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Desk Check-ins</p>
          <p className="text-xl font-black text-amber-600 mt-1">{stats?.desk_enrollments || 0}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm col-span-2 lg:col-span-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-600">Kiosk Actions</p>
          <p className="text-xl font-black text-cyan-600 mt-1">{stats?.kiosk_actions || 0}</p>
        </div>
      </div>

      {/* Filter Chips & Search Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
        {/* Category Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                category === c.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full lg:w-72">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search actions, officers, IPs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchLogs(false)}
            className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Main Ledger Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center">
            <LoadingSpinner size="lg" text="Retrieving verified audit trail..." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Timestamp (UTC)</th>
                  <th className="py-3 px-4">Action Category</th>
                  <th className="py-3 px-4">Operator / Actor</th>
                  <th className="py-3 px-4">Operation Details</th>
                  <th className="py-3 px-4">Network Station</th>
                  <th className="py-3 px-4 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {logs.map((log) => {
                  const badge = getActionBadge(log.action);
                  const Icon = badge.icon;

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Timestamp */}
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {log.created_at ? format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss') : '—'}
                      </td>

                      {/* Action Category Badge */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${badge.bg}`}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span>{badge.label}</span>
                        </span>
                      </td>

                      {/* Actor */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div>
                          <p className="font-bold text-slate-900">{log.actor_name || 'System Auto'}</p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {log.actor_student_id ? `ID: ${log.actor_student_id}` : log.actor_role || 'SYSTEM'}
                          </p>
                        </div>
                      </td>

                      {/* Details */}
                      <td className="py-3.5 px-4 max-w-md">
                        <p className="text-slate-700 truncate" title={log.details}>
                          {log.details || '—'}
                        </p>
                      </td>

                      {/* IP Address */}
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {log.ip_address || '127.0.0.1'}
                      </td>

                      {/* Inspect Button */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No audit events found matching the selected filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Technical Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheckIcon className="w-5 h-5 text-indigo-400" />
                <span className="font-bold text-sm">Audit Record #{selectedLog.id}</span>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Action:</span>
                  <span className="font-bold text-slate-900">{selectedLog.action}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Timestamp:</span>
                  <span className="text-slate-800">{selectedLog.created_at}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Actor:</span>
                  <span className="text-slate-800">{selectedLog.actor_name} ({selectedLog.actor_student_id || 'System'})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Station IP:</span>
                  <span className="text-slate-800">{selectedLog.ip_address}</span>
                </div>
              </div>

              <div>
                <p className="font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                  Operation Narrative
                </p>
                <p className="p-3 rounded-xl bg-slate-100 text-slate-800 leading-relaxed">
                  {selectedLog.details || 'No descriptive metadata attached.'}
                </p>
              </div>

              <div>
                <p className="font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                  User Agent Client
                </p>
                <p className="p-2.5 rounded-xl bg-slate-100 font-mono text-[11px] text-slate-600 break-all">
                  {selectedLog.user_agent || 'Client agent not recorded'}
                </p>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setSelectedLog(null)}
                  className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs"
                >
                  Close Inspection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLog;
