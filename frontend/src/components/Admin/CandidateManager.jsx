import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import LoadingSpinner from '../common/LoadingSpinner';
import Modal from '../common/Modal';
import { toast } from 'react-hot-toast';
import {
  ArrowLeftIcon,
  PlusIcon,
  TrashIcon,
  UserPlusIcon,
  AcademicCapIcon,
  BuildingOfficeIcon,
  UserIcon,
} from '@heroicons/react/24/outline';

const CANONICAL_PORTFOLIOS = [
  'Vice President',
  'General Secretary',
  'Assistant General Secretary',
  'Cultural Secretary',
  'Magazine Secretary',
  'Boys Common Room Secretary',
  'Girls Common Room Secretary',
  'Major Games Secretary',
  'Minor Games Secretary',
];

export const CandidateManager = () => {
  const { electionId } = useParams();
  const [candidates, setCandidates] = useState([]);
  const [election, setElection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New candidate form
  const [formData, setFormData] = useState({
    name: '',
    position: 'General Secretary',
    party: '',
    bio: '',
  });

  const fetchCandidatesAndElection = async () => {
    try {
      setLoading(true);
      // Fetch election details
      try {
        const electionsRes = await adminApi.getElections();
        const list = Array.isArray(electionsRes) ? electionsRes : (electionsRes?.elections || []);
        const found = list.find((e) => String(e.id) === String(electionId));
        if (found) setElection(found);
      } catch (e) {
        console.warn('Could not fetch election detail:', e);
      }

      // Fetch candidates
      const candRes = await adminApi.getCandidates(electionId);
      const candList = Array.isArray(candRes) ? candRes : (candRes?.candidates || []);
      setCandidates(candList);
    } catch (err) {
      console.error('Failed to load candidate list:', err);
      toast.error('Could not fetch candidates for this election.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (electionId) {
      fetchCandidatesAndElection();
    }
  }, [electionId]);

  const handleAddCandidate = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Candidate name is required.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        position: formData.position.trim(),
        party: formData.party.trim(),
        bio: formData.bio.trim(),
        election_id: Number(electionId),
      };

      await adminApi.addCandidate(electionId, payload);
      toast.success('Candidate successfully registered!');
      setModalOpen(false);
      setFormData({
        name: '',
        position: 'General Secretary',
        party: '',
        bio: '',
      });
      fetchCandidatesAndElection();
    } catch (err) {
      console.error('Failed to add candidate:', err);
      const detail = err.response?.data?.message || err.response?.data?.error || 'Failed to add candidate.';
      toast.error(detail);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCandidate = async (candidate) => {
    if (window.confirm(`Are you sure you want to remove candidate "${candidate.name}" from this election?`)) {
      try {
        await adminApi.deleteCandidate(candidate.id, electionId);
        toast.success('Candidate removed.');
        fetchCandidatesAndElection();
      } catch (err) {
        console.error('Failed to delete candidate:', err);
        toast.error('Could not remove candidate.');
      }
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Navigation & Header */}
      <div className="mb-6">
        <Link
          to="/admin/elections"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 font-medium mb-3 transition-colors"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Back to Election Manager
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              Candidate Slate Management
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Election: <span className="font-semibold text-gray-800">{election?.title || `#${electionId}`}</span>
            </p>
          </div>

          <button
            onClick={() => setModalOpen(true)}
            className="btn btn-primary btn-sm gap-1.5 shadow-sm self-start sm:self-auto"
          >
            <PlusIcon className="w-4 h-4" />
            <span>Add Candidate</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card py-16">
          <LoadingSpinner text="Loading candidates..." />
        </div>
      ) : candidates.length === 0 ? (
        <div className="card p-12 text-center border-dashed border-2">
          <UserPlusIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-gray-900">No Candidates Registered Yet</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
            Add nominees who will appear on the secret ballot paper for this election.
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="mt-4 btn btn-primary btn-sm"
          >
            Add First Candidate
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {candidates.map((cand) => (
            <div
              key={cand.id}
              className="card border border-gray-200 hover:border-primary-300 p-5 flex flex-col justify-between transition-all duration-150 shadow-xs hover:shadow-md"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-primary-100 text-primary-700 font-bold flex items-center justify-center text-base border border-primary-200">
                      {cand.name ? cand.name.charAt(0).toUpperCase() : <UserIcon className="w-5 h-5" />}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-base leading-tight">
                        {cand.name}
                      </h3>
                      <p className="text-xs font-semibold text-primary-700 flex items-center gap-1 mt-0.5">
                        <AcademicCapIcon className="w-3.5 h-3.5" />
                        {cand.position || 'President'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteCandidate(cand)}
                    className="p-1 rounded-lg text-gray-400 hover:text-danger-600 hover:bg-danger-50 transition-colors"
                    title="Remove candidate"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>

                {cand.party && (
                  <div className="mt-3 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                    <BuildingOfficeIcon className="w-3.5 h-3.5 text-slate-400" />
                    <span>{cand.party}</span>
                  </div>
                )}

                {cand.bio && (
                  <p className="mt-3 text-xs text-gray-600 line-clamp-3 leading-relaxed border-t border-gray-100 pt-3">
                    {cand.bio}
                  </p>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
                <span>Candidate ID: #{cand.id}</span>
                <span className="text-emerald-600 font-medium">Eligible Ballot Entry</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Candidate Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => !submitting && setModalOpen(false)}
        title="Register Ballot Nominee"
      >
        <form onSubmit={handleAddCandidate} className="space-y-4">
          <div>
            <label className="label" htmlFor="name">
              Candidate Full Name *
            </label>
            <input
              id="name"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Carol Smith"
              className="input"
            />
          </div>

          <div>
            <label className="label" htmlFor="position">
              Contested Portfolio *
            </label>
            <select
              id="position"
              required
              value={formData.position}
              onChange={(e) => setFormData({ ...formData, position: e.target.value })}
              className="input bg-white text-gray-900"
            >
              {CANONICAL_PORTFOLIOS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-500 mt-1">
              Note: The College Principal presides as ex-officio Union President.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="party">
              Department / Party / Student Slate
            </label>
            <input
              id="party"
              type="text"
              value={formData.party}
              onChange={(e) => setFormData({ ...formData, party: e.target.value })}
              placeholder="e.g. Department of Computer Science / Unity Slate"
              className="input"
            />
          </div>

          <div>
            <label className="label" htmlFor="bio">
              Brief Candidate Manifesto / Bio
            </label>
            <textarea
              id="bio"
              rows={3}
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              placeholder="Outline the candidate's agenda and background..."
              className="input resize-none"
            />
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
              {submitting ? 'Registering...' : 'Add to Ballot'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default CandidateManager;
