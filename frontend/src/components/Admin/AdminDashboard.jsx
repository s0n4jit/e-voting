import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import LoadingSpinner from '../common/LoadingSpinner';
import StatusBadge from '../common/StatusBadge';
import {
  UsersIcon,
  ArchiveBoxIcon,
  CheckCircleIcon,
  DocumentMagnifyingGlassIcon,
  ArrowRightIcon,
  PlusIcon,
  ArrowUpTrayIcon,
  ShieldCheckIcon,
  ExclamationCircleIcon,
  TicketIcon,
  ComputerDesktopIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';

export const AdminDashboard = () => {
  const [stats, setStats] = useState({
    totalVoters: 0,
    activeElections: 0,
    ballotsCast: 0,
    auditEvents: 0,
  });
  const [recentElections, setRecentElections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch elections, voters, and audit logs concurrently
        const [electionsRes, votersRes, logsRes] = await Promise.allSettled([
          adminApi.getElections(),
          adminApi.getVoters(),
          adminApi.getAuditLogs({ limit: 10 }),
        ]);

        const elections = electionsRes.status === 'fulfilled'
          ? (Array.isArray(electionsRes.value) ? electionsRes.value : electionsRes.value?.elections || [])
          : [];

        const voters = votersRes.status === 'fulfilled'
          ? (Array.isArray(votersRes.value) ? votersRes.value : votersRes.value?.voters || [])
          : [];

        const logs = logsRes.status === 'fulfilled'
          ? (Array.isArray(logsRes.value) ? logsRes.value : logsRes.value?.logs || logsRes.value?.audit_logs || [])
          : [];

        const activeCount = elections.filter((e) => e.is_active).length;
        const totalVotesCast = elections.reduce((acc, curr) => acc + (curr.total_votes || curr.votes_count || 0), 0);

        setStats({
          totalVoters: voters.length,
          activeElections: activeCount,
          ballotsCast: totalVotesCast,
          auditEvents: logs.length > 0 ? (logsRes.value?.total || logs.length) : 0,
        });

        setRecentElections(elections.slice(0, 5));
      } catch (err) {
        console.error('Failed to load admin dashboard summary:', err);
        setError('Error retrieving administration overview metrics.');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const formatDateString = (dateStr) => {
    if (!dateStr) return '—';
    try {
      return format(new Date(dateStr), 'MMM d, yyyy');
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Title & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            Administrator Center
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Campus election governance, cryptographic audit verification, and ballot management.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/admin/desk"
            className="btn btn-secondary btn-sm gap-1.5"
          >
            <TicketIcon className="w-4 h-4 text-emerald-600" />
            <span>Polling Desk</span>
          </Link>
          <Link
            to="/admin/officers"
            className="btn btn-secondary btn-sm gap-1.5"
          >
            <UserGroupIcon className="w-4 h-4 text-primary-600" />
            <span>Desk Officers</span>
          </Link>
          <Link
            to="/admin/kiosks"
            className="btn btn-secondary btn-sm gap-1.5"
          >
            <ComputerDesktopIcon className="w-4 h-4 text-indigo-600" />
            <span>Booth Kiosks</span>
          </Link>
          <Link
            to="/admin/elections"
            className="btn btn-primary btn-sm gap-1.5 shadow-sm"
          >
            <PlusIcon className="w-4 h-4" />
            <span>New Election</span>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="card py-16">
          <LoadingSpinner text="Aggregating election telemetry..." />
        </div>
      ) : error ? (
        <div className="card p-8 text-center bg-rose-50 border-rose-200">
          <ExclamationCircleIcon className="w-8 h-8 text-rose-500 mx-auto mb-2" />
          <p className="text-rose-800 font-semibold">{error}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Summary Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Registered Voters */}
            <div className="card p-5 border-l-4 border-l-primary-600 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Registered Voters
                </p>
                <p className="text-3xl font-extrabold text-gray-900 mt-1">
                  {stats.totalVoters.toLocaleString()}
                </p>
                <Link
                  to="/admin/voters"
                  className="text-xs text-primary-600 hover:text-primary-800 font-medium inline-flex items-center gap-1 mt-2"
                >
                  Manage Roster <ArrowRightIcon className="w-3 h-3" />
                </Link>
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
                <UsersIcon className="w-6 h-6" />
              </div>
            </div>

            {/* Active Elections */}
            <div className="card p-5 border-l-4 border-l-emerald-600 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Active Elections
                </p>
                <p className="text-3xl font-extrabold text-gray-900 mt-1">
                  {stats.activeElections}
                </p>
                <Link
                  to="/admin/elections"
                  className="text-xs text-emerald-600 hover:text-emerald-800 font-medium inline-flex items-center gap-1 mt-2"
                >
                  View Polls <ArrowRightIcon className="w-3 h-3" />
                </Link>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <ArchiveBoxIcon className="w-6 h-6" />
              </div>
            </div>

            {/* Ballots Cast */}
            <div className="card p-5 border-l-4 border-l-indigo-600 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Ballots Cast
                </p>
                <p className="text-3xl font-extrabold text-gray-900 mt-1">
                  {stats.ballotsCast.toLocaleString()}
                </p>
                <span className="text-xs text-gray-400 block mt-2">
                  Blind cryptographic tokens
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <CheckCircleIcon className="w-6 h-6" />
              </div>
            </div>

            {/* Security Audit Events */}
            <div className="card p-5 border-l-4 border-l-purple-600 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Audit Events
                </p>
                <p className="text-3xl font-extrabold text-gray-900 mt-1">
                  {stats.auditEvents.toLocaleString()}
                </p>
                <Link
                  to="/admin/audit"
                  className="text-xs text-purple-600 hover:text-purple-800 font-medium inline-flex items-center gap-1 mt-2"
                >
                  Inspect Trail <ArrowRightIcon className="w-3 h-3" />
                </Link>
              </div>
              <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <DocumentMagnifyingGlassIcon className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Quick Action Navigation Tiles */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Link
              to="/admin/elections"
              className="card p-6 border border-gray-200 hover:border-primary-400 hover:shadow-md transition-all group"
            >
              <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <ArchiveBoxIcon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-gray-900 group-hover:text-primary-600 text-base">
                Election Management
              </h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Configure ballot windows, register candidates, activate live voting sessions, and certify tally publications.
              </p>
            </Link>

            <Link
              to="/admin/voters"
              className="card p-6 border border-gray-200 hover:border-primary-400 hover:shadow-md transition-all group"
            >
              <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <UsersIcon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-gray-900 group-hover:text-primary-600 text-base">
                Voter Roster & CSV Import
              </h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Add eligible campus voters, upload bulk CSV student rosters, and view eligibility states with hash anonymization.
              </p>
            </Link>

            <Link
              to="/admin/audit"
              className="card p-6 border border-gray-200 hover:border-primary-400 hover:shadow-md transition-all group"
            >
              <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <ShieldCheckIcon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-gray-900 group-hover:text-primary-600 text-base">
                Tamper-Evident Audit Log
              </h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Monitor immutable timestamps, system actions, IP logs, and cryptographic access events in real-time.
              </p>
            </Link>
          </div>

          {/* Recent Elections List */}
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h2 className="text-base font-bold text-gray-900">Recent Elections</h2>
              <Link
                to="/admin/elections"
                className="text-xs font-semibold text-primary-600 hover:text-primary-800"
              >
                View All →
              </Link>
            </div>

            {recentElections.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">
                No elections created yet. Click "New Election" to schedule the first campus poll.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Window</th>
                      <th>Status</th>
                      <th>Results</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentElections.map((elec) => (
                      <tr key={elec.id}>
                        <td>
                          <div className="font-semibold text-gray-900">{elec.title}</div>
                          <div className="text-xs text-gray-400 font-mono">ID: {elec.id}</div>
                        </td>
                        <td className="text-xs text-gray-500">
                          {formatDateString(elec.start_time)} – {formatDateString(elec.end_time)}
                        </td>
                        <td>
                          <StatusBadge
                            status={elec.is_active ? 'active' : 'closed'}
                            label={elec.is_active ? 'Active' : 'Closed'}
                          />
                        </td>
                        <td>
                          <StatusBadge
                            status={elec.results_published ? 'published' : 'draft'}
                            label={elec.results_published ? 'Published' : 'Hidden'}
                          />
                        </td>
                        <td className="text-right space-x-2">
                          <Link
                            to={`/admin/candidates/${elec.id}`}
                            className="btn btn-secondary btn-sm text-xs"
                          >
                            Candidates
                          </Link>
                          <Link
                            to={`/admin/results/${elec.id}`}
                            className="btn btn-primary btn-sm text-xs"
                          >
                            Tally
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
