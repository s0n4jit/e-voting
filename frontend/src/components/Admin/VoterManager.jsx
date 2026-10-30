import React, { useState, useEffect } from 'react';
import { adminApi } from '../../api/adminApi';
import LoadingSpinner from '../common/LoadingSpinner';
import Modal from '../common/Modal';
import StatusBadge from '../common/StatusBadge';
import { toast } from 'react-hot-toast';
import Papa from 'papaparse';
import {
  UserPlusIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

export const VoterManager = () => {
  const [voters, setVoters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Single voter form
  const [singleVoter, setSingleVoter] = useState({
    student_id: '',
    name: '',
    email: '',
    department: 'Computer Science',
    year: 'Year 3',
    password: '',
  });

  // CSV Import state
  const [csvFile, setCsvFile] = useState(null);
  const [csvPreview, setCsvPreview] = useState([]);
  const [importSummary, setImportSummary] = useState(null);

  const fetchVoters = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await adminApi.getVoters();
      const list = Array.isArray(data) ? data : (data?.voters || []);
      setVoters(list);
    } catch (err) {
      if (!silent) {
        console.error('Failed to load voters list:', err);
        toast.error('Could not fetch voter roster.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchVoters(false);

    // Silent background poll every 4 seconds
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      // Skip background update if modal forms are actively open to avoid jarring input state
      if (addModalOpen || csvModalOpen || submitting) return;
      fetchVoters(true);
    }, 4000);

    return () => clearInterval(interval);
  }, [addModalOpen, csvModalOpen, submitting]);

  const handleAddSingleVoter = async (e) => {
    e.preventDefault();
    if (!singleVoter.student_id.trim() || !singleVoter.name.trim() || !singleVoter.email.trim()) {
      toast.error('Student ID, Name, and Email are required.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        student_id: singleVoter.student_id.trim().toUpperCase(),
        name: singleVoter.name.trim(),
        email: singleVoter.email.trim(),
        department: singleVoter.department.trim(),
        year: singleVoter.year.trim(),
        password: singleVoter.password.trim() || 'Student@1234',
        role: 'voter',
      };

      await adminApi.addVoter(payload);
      toast.success(`Voter ${payload.student_id} registered successfully.`);
      setAddModalOpen(false);
      setSingleVoter({
        student_id: '',
        name: '',
        email: '',
        department: 'Computer Science',
        year: 'Year 3',
        password: '',
      });
      fetchVoters();
    } catch (err) {
      console.error('Error adding voter:', err);
      const detail = err.response?.data?.message || err.response?.data?.error || 'Failed to add voter.';
      toast.error(detail);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCsvFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setCsvFile(file);
    setImportSummary(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setCsvPreview(results.data.slice(0, 5));
      },
      error: (err) => {
        console.error('CSV parse error:', err);
        toast.error('Error parsing CSV file format.');
      },
    });
  };

  const handleImportCsv = async () => {
    if (!csvFile) {
      toast.error('Please choose a valid CSV file.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await adminApi.importVotersCsv(csvFile);
      setImportSummary(res);
      toast.success('Voter roster imported successfully!');
      fetchVoters();
    } catch (err) {
      console.error('Failed to import CSV:', err);
      const detail = err.response?.data?.message || err.response?.data?.error || 'CSV import failed. Check file columns.';
      toast.error(detail);
    } finally {
      setSubmitting(false);
    }
  };

  const downloadSampleCsv = () => {
    const sampleHeaders = 'student_id,name,email,department,year,password\n';
    const sampleRow1 = 'STU021,David Miller,david@uni.edu,Computer Science,Year 3,Student@1234\n';
    const sampleRow2 = 'STU022,Elena Rostova,elena@uni.edu,Electronics,Year 2,Student@1234\n';
    const blob = new Blob([sampleHeaders + sampleRow1 + sampleRow2], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_voter_roster.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Filter voters by search term
  const filteredVoters = voters.filter((v) => {
    const term = searchTerm.toLowerCase();
    const id = (v.student_id || '').toLowerCase();
    const name = (v.name || '').toLowerCase();
    const email = (v.email || '').toLowerCase();
    const dept = (v.department || '').toLowerCase();
    return id.includes(term) || name.includes(term) || email.includes(term) || dept.includes(term);
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              Voter Registry & Roster
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Sync (4s)
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Manage student eligibility, enroll individual voters, or bulk import via CSV.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setCsvModalOpen(true)}
            className="btn btn-secondary btn-sm gap-1.5"
          >
            <ArrowUpTrayIcon className="w-4 h-4 text-emerald-600" />
            <span>Bulk CSV Import</span>
          </button>

          <button
            onClick={() => setAddModalOpen(true)}
            className="btn btn-primary btn-sm gap-1.5 shadow-sm"
          >
            <UserPlusIcon className="w-4 h-4" />
            <span>Add Single Voter</span>
          </button>
        </div>
      </div>

      {/* Search and summary bar */}
      <div className="card p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-96">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
            <MagnifyingGlassIcon className="h-4 w-4" />
          </div>
          <input
            type="text"
            placeholder="Search by student ID, name, or department..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto text-xs text-gray-500">
          <span>
            Total Registered: <strong className="text-gray-900">{voters.length}</strong>
          </span>
          <button
            onClick={fetchVoters}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
            title="Refresh list"
          >
            <ArrowPathIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="card py-16">
          <LoadingSpinner text="Loading eligible voter records..." />
        </div>
      ) : filteredVoters.length === 0 ? (
        <div className="card p-12 text-center border-dashed border-2">
          <DocumentTextIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-gray-900">No Voters Found</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
            {searchTerm ? 'No results matched your search criteria.' : 'Import or add students to populate the electoral roll.'}
          </p>
        </div>
      ) : (
        <div className="table-container bg-white">
          <table className="table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Full Name</th>
                <th>Email / Contact</th>
                <th>Department</th>
                <th>Year</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredVoters.map((voter) => (
                <tr key={voter.id || voter.student_id}>
                  <td className="font-mono font-bold text-gray-900 text-xs">
                    {voter.student_id}
                  </td>
                  <td className="font-semibold text-gray-800 text-sm">
                    {voter.name}
                  </td>
                  <td className="text-xs text-gray-500 font-mono">
                    {voter.email || '—'}
                  </td>
                  <td className="text-xs text-gray-700">
                    {voter.department || 'General'}
                  </td>
                  <td className="text-xs text-gray-600">
                    {voter.year || 'Undergraduate'}
                  </td>
                  <td>
                    <StatusBadge
                      status={voter.is_active !== false ? 'active' : 'inactive'}
                      label={voter.is_active !== false ? 'Eligible' : 'Deactivated'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Single Voter Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => !submitting && setAddModalOpen(false)}
        title="Add Single Eligible Voter"
      >
        <form onSubmit={handleAddSingleVoter} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="single_student_id">
                Student ID *
              </label>
              <input
                id="single_student_id"
                type="text"
                required
                value={singleVoter.student_id}
                onChange={(e) => setSingleVoter({ ...singleVoter, student_id: e.target.value })}
                placeholder="e.g. STU025"
                className="input uppercase font-mono"
              />
            </div>

            <div>
              <label className="label" htmlFor="single_name">
                Full Name *
              </label>
              <input
                id="single_name"
                type="text"
                required
                value={singleVoter.name}
                onChange={(e) => setSingleVoter({ ...singleVoter, name: e.target.value })}
                placeholder="e.g. Maya Lin"
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="single_email">
              Institutional Email *
            </label>
            <input
              id="single_email"
              type="email"
              required
              value={singleVoter.email}
              onChange={(e) => setSingleVoter({ ...singleVoter, email: e.target.value })}
              placeholder="e.g. maya@campus.edu"
              className="input font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="single_dept">
                Department
              </label>
              <input
                id="single_dept"
                type="text"
                value={singleVoter.department}
                onChange={(e) => setSingleVoter({ ...singleVoter, department: e.target.value })}
                placeholder="Computer Science"
                className="input"
              />
            </div>

            <div>
              <label className="label" htmlFor="single_year">
                Academic Year
              </label>
              <input
                id="single_year"
                type="text"
                value={singleVoter.year}
                onChange={(e) => setSingleVoter({ ...singleVoter, year: e.target.value })}
                placeholder="Year 3"
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="single_pw">
              Initial Password (Default: Student@1234)
            </label>
            <input
              id="single_pw"
              type="text"
              value={singleVoter.password}
              onChange={(e) => setSingleVoter({ ...singleVoter, password: e.target.value })}
              placeholder="Leave blank for default: Student@1234"
              className="input text-xs font-mono"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              disabled={submitting}
              onClick={() => setAddModalOpen(false)}
              className="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary btn-sm px-5"
            >
              {submitting ? 'Enrolling...' : 'Enroll Voter'}
            </button>
          </div>
        </form>
      </Modal>

      {/* CSV Bulk Import Modal */}
      <Modal
        isOpen={csvModalOpen}
        onClose={() => !submitting && setCsvModalOpen(false)}
        title="Bulk Import Student Roster (CSV)"
        maxWidth="max-w-xl"
      >
        <div className="space-y-5">
          <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs text-indigo-900 flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">CSV Formatting Requirement</p>
              <p className="mt-0.5 text-gray-600">
                Columns required: <span className="font-mono text-indigo-800">student_id, name, email, department, year, password</span>
              </p>
            </div>
            <button
              type="button"
              onClick={downloadSampleCsv}
              className="btn btn-secondary btn-xs shrink-0 gap-1 text-[11px]"
            >
              <ArrowDownTrayIcon className="w-3.5 h-3.5 text-primary-600" />
              Download Template
            </button>
          </div>

          {/* File input */}
          <div>
            <label className="label">Upload .csv File</label>
            <input
              type="file"
              accept=".csv"
              onChange={handleCsvFileChange}
              className="block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 cursor-pointer"
            />
          </div>

          {/* Parsed Preview */}
          {csvPreview.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Parsed Sample Preview (Top {csvPreview.length} rows)
              </p>
              <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-40">
                <table className="min-w-full text-[11px]">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="p-2 text-left">ID</th>
                      <th className="p-2 text-left">Name</th>
                      <th className="p-2 text-left">Email</th>
                      <th className="p-2 text-left">Dept</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-mono">
                    {csvPreview.map((row, idx) => (
                      <tr key={idx}>
                        <td className="p-2 font-bold">{row.student_id || row['Student ID']}</td>
                        <td className="p-2 font-sans">{row.name || row['Name']}</td>
                        <td className="p-2 text-gray-500">{row.email || row['Email']}</td>
                        <td className="p-2 font-sans">{row.department || row['Department']}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import Summary Response */}
          {importSummary && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <CheckCircleIcon className="w-4 h-4 text-emerald-600" />
                <span>Import Job Completed</span>
              </div>
              <p>Total Processed: {importSummary.processed || importSummary.total || csvPreview.length}</p>
              {importSummary.created !== undefined && <p>New Voters Added: {importSummary.created}</p>}
              {importSummary.errors && importSummary.errors.length > 0 && (
                <p className="text-rose-700">Errors encountered: {importSummary.errors.length}</p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setCsvModalOpen(false);
                setCsvFile(null);
                setCsvPreview([]);
                setImportSummary(null);
              }}
              className="btn btn-secondary btn-sm"
            >
              Close
            </button>
            <button
              type="button"
              disabled={!csvFile || submitting}
              onClick={handleImportCsv}
              className="btn btn-primary btn-sm px-5"
            >
              {submitting ? 'Importing Roster...' : 'Start Import'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default VoterManager;
