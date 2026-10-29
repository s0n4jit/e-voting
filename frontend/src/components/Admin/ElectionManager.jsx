import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import LoadingSpinner from '../common/LoadingSpinner';
import Modal from '../common/Modal';
import StatusBadge from '../common/StatusBadge';
import { toast } from 'react-hot-toast';
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckCircleIcon,
  NoSymbolIcon,
  MegaphoneIcon,
  UserGroupIcon,
  ChartBarIcon,
  CalendarIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';

export const ElectionManager = () => {
  const [elections, setElections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingElection, setEditingElection] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_time: '',
    end_time: '',
    is_active: false,
    results_published: false,
  });

  const fetchElections = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getElections();
      const list = Array.isArray(data) ? data : (data.elections || []);
      setElections(list);
    } catch (err) {
      console.error('Failed to load elections:', err);
      toast.error('Could not load elections list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchElections();
  }, []);

  const openCreateModal = () => {
    setEditingElection(null);
    // Default start_time now, end_time 24h later in format suitable for datetime-local
    const now = new Date();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const toInputFormat = (d) => d.toISOString().slice(0, 16);

    setFormData({
      title: '',
      description: '',
      start_time: toInputFormat(now),
      end_time: toInputFormat(tomorrow),
      is_active: true,
      results_published: false,
    });
    setModalOpen(true);
  };

  const openEditModal = (elec) => {
    setEditingElection(elec);
    const toInputFormat = (dateStr) => {
      if (!dateStr) return '';
      try {
        return new Date(dateStr).toISOString().slice(0, 16);
      } catch (e) {
        return '';
      }
    };

    setFormData({
      title: elec.title || '',
      description: elec.description || '',
      start_time: toInputFormat(elec.start_time),
      end_time: toInputFormat(elec.end_time),
      is_active: Boolean(elec.is_active),
      results_published: Boolean(elec.results_published),
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast.error('Election title is required.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        start_time: new Date(formData.start_time).toISOString(),
        end_time: new Date(formData.end_time).toISOString(),
        is_active: formData.is_active,
        results_published: formData.results_published,
      };

      if (editingElection) {
        await adminApi.updateElection(editingElection.id, payload);
        toast.success('Election updated successfully!');
      } else {
        await adminApi.createElection(payload);
        toast.success('Election created successfully!');
      }

      setModalOpen(false);
      fetchElections();
    } catch (err) {
      console.error('Error saving election:', err);
      const detail = err.response?.data?.message || err.response?.data?.error || 'Failed to save election.';
      toast.error(detail);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (elec) => {
    const nextState = !elec.is_active;
    try {
      await adminApi.toggleElectionActive(elec.id, nextState);
      toast.success(`Election ${nextState ? 'activated' : 'closed'} successfully.`);
      fetchElections();
    } catch (err) {
      console.error('Error toggling status:', err);
      toast.error('Could not toggle election status.');
    }
  };

  const handlePublishResults = async (elec) => {
    if (elec.results_published) {
      toast.info('Results are already published.');
      return;
    }
    if (window.confirm(`Publish verified tally results for "${elec.title}" to all students?`)) {
      try {
        await adminApi.publishResults(elec.id);
        toast.success('Results published to campus!');
        fetchElections();
      } catch (err) {
        console.error('Error publishing results:', err);
        toast.error('Failed to publish results.');
      }
    }
  };

  const handleDeleteElection = async (elec) => {
    if (window.confirm(`Are you sure you want to delete election "${elec.title}"? This cannot be undone.`)) {
      try {
        await adminApi.deleteElection(elec.id);
        toast.success('Election deleted.');
        fetchElections();
      } catch (err) {
        console.error('Error deleting election:', err);
        toast.error('Could not delete election.');
      }
    }
  };

  const formatDateString = (dateStr) => {
    if (!dateStr) return 'TBD';
    try {
      return format(new Date(dateStr), 'MMM d, yyyy h:mm a');
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            Election Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Create, schedule, activate, and certify campus student elections.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchElections}
            className="btn btn-secondary btn-sm gap-1.5"
            title="Refresh list"
          >
            <ArrowPathIcon className="w-4 h-4" />
            <span>Refresh</span>
          </button>
          <button
            onClick={openCreateModal}
            className="btn btn-primary btn-sm gap-1.5 shadow-sm"
          >
            <PlusIcon className="w-4 h-4" />
            <span>Create New Election</span>
          </button>
        </div>
      </div>

      {/* Main Table */}
      {loading ? (
        <div className="card py-16">
          <LoadingSpinner text="Loading elections roster..." />
        </div>
      ) : elections.length === 0 ? (
        <div className="card p-12 text-center border-dashed border-2">
          <CalendarIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-gray-900">No Elections Created</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
            Get started by scheduling a new campus election.
          </p>
          <button onClick={openCreateModal} className="mt-4 btn btn-primary btn-sm">
            Create Election
          </button>
        </div>
      ) : (
        <div className="table-container bg-white">
          <table className="table">
            <thead>
              <tr>
                <th>Election Info</th>
                <th>Voting Window</th>
                <th>Poll Status</th>
                <th>Results Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {elections.map((elec) => (
                <tr key={elec.id}>
                  <td>
                    <div className="font-bold text-gray-900 text-sm">{elec.title}</div>
                    <div className="text-xs text-gray-500 line-clamp-1 max-w-xs mt-0.5">
                      {elec.description || 'No description.'}
                    </div>
                    <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                      ID: #{elec.id}
                    </div>
                  </td>
                  <td>
                    <div className="text-xs text-gray-700">
                      <span className="font-medium">From:</span> {formatDateString(elec.start_time)}
                    </div>
                    <div className="text-xs text-gray-700 mt-0.5">
                      <span className="font-medium">To:</span> {formatDateString(elec.end_time)}
                    </div>
                  </td>
                  <td>
                    <StatusBadge
                      status={elec.is_active ? 'active' : 'closed'}
                      label={elec.is_active ? 'Live Poll' : 'Closed / Paused'}
                    />
                  </td>
                  <td>
                    <StatusBadge
                      status={elec.results_published ? 'published' : 'draft'}
                      label={elec.results_published ? 'Certified & Live' : 'Unpublished'}
                    />
                  </td>
                  <td className="text-right">
                    <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                      {/* Manage Candidates */}
                      <Link
                        to={`/admin/candidates/${elec.id}`}
                        className="btn btn-secondary btn-sm text-xs gap-1"
                        title="Manage candidates on this ballot"
                      >
                        <UserGroupIcon className="w-3.5 h-3.5 text-primary-600" />
                        <span>Candidates</span>
                      </Link>

                      {/* View Tally Results */}
                      <Link
                        to={`/admin/results/${elec.id}`}
                        className="btn btn-secondary btn-sm text-xs gap-1"
                        title="View vote counts and analytics"
                      >
                        <ChartBarIcon className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Tally</span>
                      </Link>

                      {/* Toggle Active */}
                      <button
                        onClick={() => handleToggleActive(elec)}
                        className={`btn btn-sm text-xs gap-1 ${
                          elec.is_active
                            ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                        }`}
                        title={elec.is_active ? 'Close this election' : 'Open this election for voting'}
                      >
                        {elec.is_active ? (
                          <>
                            <NoSymbolIcon className="w-3.5 h-3.5" />
                            <span>Close</span>
                          </>
                        ) : (
                          <>
                            <CheckCircleIcon className="w-3.5 h-3.5" />
                            <span>Activate</span>
                          </>
                        )}
                      </button>

                      {/* Publish Results */}
                      {!elec.results_published && (
                        <button
                          onClick={() => handlePublishResults(elec)}
                          className="btn btn-sm text-xs bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 gap-1"
                          title="Publish official results publicly"
                        >
                          <MegaphoneIcon className="w-3.5 h-3.5" />
                          <span>Publish</span>
                        </button>
                      )}

                      {/* Edit */}
                      <button
                        onClick={() => openEditModal(elec)}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
                        title="Edit details"
                      >
                        <PencilSquareIcon className="w-4 h-4" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDeleteElection(elec)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-danger-600 hover:bg-danger-50 transition-colors"
                        title="Delete election"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => !submitting && setModalOpen(false)}
        title={editingElection ? 'Edit Election Settings' : 'Create New Campus Election'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="title">
              Election Title *
            </label>
            <input
              id="title"
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Student Council Presidential Election 2026"
              className="input"
            />
          </div>

          <div>
            <label className="label" htmlFor="description">
              Election Description
            </label>
            <textarea
              id="description"
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe the scope, eligibility criteria, and instructions for voters..."
              className="input resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="start_time">
                Start Date & Time
              </label>
              <input
                id="start_time"
                type="datetime-local"
                required
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                className="input"
              />
            </div>

            <div>
              <label className="label" htmlFor="end_time">
                End Date & Time
              </label>
              <input
                id="end_time"
                type="datetime-local"
                required
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                className="input"
              />
            </div>
          </div>

          <div className="pt-2 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-gray-800">
                Poll is Open / Active for voting
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.results_published}
                onChange={(e) => setFormData({ ...formData, results_published: e.target.checked })}
                className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
              />
              <span className="text-sm font-medium text-gray-800">
                Publish results to voters and public
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              disabled={submitting}
              onClick={() => setModalOpen(false)}
              className="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary btn-sm px-5"
            >
              {submitting ? 'Saving...' : editingElection ? 'Update Election' : 'Create Election'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ElectionManager;
