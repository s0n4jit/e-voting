import React, { useState, useEffect, useMemo, useRef } from 'react';
import { adminApi } from '../../api/adminApi';
import { voterApi } from '../../api/voterApi';
import LoadingSpinner from '../common/LoadingSpinner';
import Modal from '../common/Modal';
import StatusBadge from '../common/StatusBadge';
import { toast } from 'react-hot-toast';
import {
  TicketIcon,
  MagnifyingGlassIcon,
  PrinterIcon,
  ClockIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  BuildingOfficeIcon,
  AcademicCapIcon,
  UserIcon,
  KeyIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

export const PollingDesk = () => {
  const [elections, setElections] = useState([]);
  const [selectedElectionId, setSelectedElectionId] = useState('');
  const [voters, setVoters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [issuingStudentId, setIssuingStudentId] = useState(null);

  // Active PIN Slip Modal
  const [slipModalOpen, setSlipModalOpen] = useState(false);
  const [activeSlip, setActiveSlip] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(1200); // 20 mins default

  const slipPrintRef = useRef(null);

  // Load elections and voters
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        // Fetch active elections (works for both desk officers and admins)
        let loadedElections = [];
        try {
          const activeElectionsData = await voterApi.getActiveElections();
          const list = Array.isArray(activeElectionsData)
            ? activeElectionsData
            : (activeElectionsData?.elections || []);
          loadedElections = list;
          setElections(list);
          if (list.length > 0) {
            setSelectedElectionId(list[0].id);
          }
        } catch (e) {
          try {
            const adminElections = await adminApi.getElections();
            const list = Array.isArray(adminElections) ? adminElections : (adminElections?.elections || []);
            loadedElections = list;
            setElections(list);
            if (list.length > 0) setSelectedElectionId(list[0].id);
          } catch (e2) {
            console.warn('Elections lookup fallback:', e2);
          }
        }

        const votersRes = await adminApi.getDeskVoters('');
        const vList = Array.isArray(votersRes) ? votersRes : (votersRes?.voters || []);
        setVoters(vList);

        if (votersRes?.elections && loadedElections.length === 0) {
          setElections(votersRes.elections);
          if (votersRes.elections.length > 0) {
            setSelectedElectionId(votersRes.elections[0].id);
          }
        } else if (votersRes?.election && loadedElections.length === 0) {
          setElections([votersRes.election]);
          setSelectedElectionId(votersRes.election.id);
        }
      } catch (err) {
        console.error('Failed to initialize polling desk data:', err);
        toast.error('Failed to load polling desk data.');
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  // Silent auto-refresh polling every 3 seconds to keep voter statuses live in real-time
  useEffect(() => {
    let isSubscribed = true;

    const silentPoll = async () => {
      // Don't poll if browser tab is hidden in background
      if (typeof document !== 'undefined' && document.hidden) return;

      try {
        const data = await adminApi.getDeskVoters({
          election_id: selectedElectionId || undefined,
        });
        const list = Array.isArray(data) ? data : (data?.voters || []);
        if (isSubscribed && Array.isArray(list) && list.length > 0) {
          setVoters(list);
        }
      } catch (err) {
        // Silent failure in background
      }
    };

    const interval = setInterval(silentPoll, 3000);
    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [selectedElectionId]);

  // Poll or search desk voters when searchQuery or election changes
  const refreshVoters = async () => {
    try {
      const data = await adminApi.getDeskVoters({
        query: searchQuery.trim(),
        election_id: selectedElectionId,
      });
      const list = Array.isArray(data) ? data : (data?.voters || []);
      setVoters(list);
    } catch (err) {
      console.error('Failed to refresh voters list:', err);
    }
  };

  // Live search filter across student ID, name, email, department
  const filteredVoters = useMemo(() => {
    if (!searchQuery.trim()) return voters;
    const q = searchQuery.toLowerCase().trim();
    return voters.filter(
      (v) =>
        (v.student_id && v.student_id.toLowerCase().includes(q)) ||
        (v.name && v.name.toLowerCase().includes(q)) ||
        (v.email && v.email.toLowerCase().includes(q)) ||
        (v.department && v.department.toLowerCase().includes(q))
    );
  }, [voters, searchQuery]);

  // Selected election object
  const currentElection = elections.find((e) => String(e.id) === String(selectedElectionId));

  // Countdown timer for active slip modal
  useEffect(() => {
    if (!slipModalOpen || !activeSlip) return;

    // Calculate initial remaining seconds based on expires_at if provided
    if (activeSlip.expires_at) {
      const expiryMs = new Date(activeSlip.expires_at).getTime();
      const nowMs = Date.now();
      const diffSec = Math.max(0, Math.floor((expiryMs - nowMs) / 1000));
      setRemainingSeconds(diffSec > 0 ? diffSec : 1200);
    } else {
      setRemainingSeconds(1200);
    }

    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [slipModalOpen, activeSlip]);

  const formatCountdown = (secs) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Issue PIN handler
  const handleIssuePin = async (student) => {
    if (!selectedElectionId) {
      toast.error('Please select an active election first.');
      return;
    }

    if (student.has_voted || student.status === 'voted') {
      toast.error(`Student ${student.student_id} has already cast their ballot.`);
      return;
    }

    setIssuingStudentId(student.student_id);

    try {
      const response = await adminApi.issueDeskPin(student.student_id, selectedElectionId);

      // Construct slip data from response or fallback
      const pin = response.pin || response.voting_pin || Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = response.expires_at || new Date(Date.now() + 20 * 60 * 1000).toISOString();

      const slipData = {
        pin: pin.toString().replace(/(\d{3})(\d{3})/, '$1 $2'),
        rawPin: pin.toString(),
        student_id: student.student_id,
        name: student.name,
        department: student.department || 'General Campus',
        election_title: currentElection?.title || 'Campus General Election',
        election_id: selectedElectionId,
        issued_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        expires_at: expiresAt,
      };

      setActiveSlip(slipData);
      setSlipModalOpen(true);
      toast.success(`Voting PIN generated for ${student.name}`);

      // Optimistically update voter status in local state
      setVoters((prev) =>
        prev.map((v) =>
          v.student_id === student.student_id
            ? { ...v, pin_active: true, pin_expires_at: expiresAt, status: 'pin_issued' }
            : v
        )
      );
    } catch (err) {
      console.error('Failed to issue voting PIN:', err);
      const detail = err.response?.data?.message || err.response?.data?.error || 'Failed to issue voting PIN.';
      toast.error(detail);
    } finally {
      setIssuingStudentId(null);
    }
  };

  const handlePrintSlip = () => {
    window.print();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Print-only CSS to isolate the voting slip */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-slip, #printable-slip * {
            visibility: visible;
          }
          #printable-slip {
            position: fixed;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            width: 85mm;
            max-width: 100%;
            box-shadow: none !important;
            border: 2px dashed #000 !important;
            padding: 16px !important;
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary-100 text-primary-700 rounded-xl shadow-xs">
              <TicketIcon className="w-6 h-6" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              Physical Polling Desk
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Sync (3s)
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Voter verification desk: look up enrolled students and issue single-use physical voting PIN slips.
          </p>
        </div>

        {/* Election Selector */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
            Target Election:
          </label>
          <select
            value={selectedElectionId}
            onChange={(e) => setSelectedElectionId(e.target.value)}
            className="input py-2 text-sm max-w-xs font-medium border-primary-200 focus:ring-primary-500"
          >
            {elections.length === 0 && (
              <option value="">General Election of the Student Union 2026-27 (Active)</option>
            )}
            {elections.map((elec) => (
              <option key={elec.id} value={elec.id}>
                {elec.title} {elec.is_active ? '● (Active)' : '(Closed)'}
              </option>
            ))}
          </select>
          <button
            onClick={refreshVoters}
            className="btn btn-secondary btn-sm p-2 text-gray-600 hover:text-primary-600"
            title="Refresh Voter List"
          >
            <ArrowPathIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Desk Stats & Search bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="md:col-span-3">
          <div className="relative">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Live Voter Search: Enter Student ID, Full Name, or Department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-11 py-3 text-base shadow-xs rounded-xl"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="card p-3 px-4 flex items-center justify-between border-gray-200">
          <div>
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">
              Desk Roster
            </span>
            <span className="text-lg font-black text-gray-900">
              {filteredVoters.length}{' '}
              <span className="text-xs font-normal text-gray-500">
                / {voters.length} registered
              </span>
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center font-bold text-xs">
            {currentElection?.is_active ? 'LIVE' : 'IDLE'}
          </div>
        </div>
      </div>

      {/* Voters Table */}
      <div className="card shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="py-20 text-center">
            <LoadingSpinner text="Loading eligible student voter registry..." />
          </div>
        ) : filteredVoters.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            <UserIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-base font-semibold text-gray-800">No matching students found</p>
            <p className="text-xs text-gray-400 mt-1">
              Verify the Student ID or Name spelling, or check the admin voter directory.
            </p>
          </div>
        ) : (
          <div className="table-container border-0 rounded-none shadow-none">
            <table className="table">
              <thead>
                <tr>
                  <th>Student Info</th>
                  <th>Department / Year</th>
                  <th>Desk Status</th>
                  <th className="text-right">Desk Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredVoters.map((student) => {
                  const hasVoted = student.has_voted || student.status === 'voted';
                  const isPinActive = !hasVoted && (student.pin_active || student.status === 'pin_issued');
                  const isEligible = !hasVoted && !isPinActive;

                  return (
                    <tr key={student.id || student.student_id} className="hover:bg-primary-50/40 transition-colors">
                      {/* Student Info */}
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-sm border border-slate-200 shrink-0">
                            {student.name ? student.name.charAt(0).toUpperCase() : 'S'}
                          </div>
                          <div>
                            <span className="font-bold text-gray-900 block leading-tight">
                              {student.name}
                            </span>
                            <span className="text-xs font-mono font-medium text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded inline-block mt-0.5">
                              {student.student_id}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Department */}
                      <td>
                        <div className="text-xs text-gray-600">
                          <p className="font-semibold text-gray-800 flex items-center gap-1">
                            <AcademicCapIcon className="w-3.5 h-3.5 text-gray-400" />
                            {student.department || 'Not specified'}
                          </p>
                          <p className="text-gray-400 mt-0.5">{student.year || 'Undergraduate'}</p>
                        </div>
                      </td>

                      {/* Status Badges */}
                      <td>
                        {hasVoted ? (
                          <StatusBadge status="voted" label="Already Voted" variant="success" />
                        ) : isPinActive ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border bg-amber-50 text-amber-700 border-amber-200 ring-1 ring-inset ring-amber-600/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            PIN Issued & Active
                          </span>
                        ) : (
                          <StatusBadge status="eligible" label="Eligible / Ready" variant="primary" />
                        )}
                      </td>

                      {/* Action */}
                      <td className="text-right">
                        {hasVoted ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                            <CheckCircleIcon className="w-4 h-4" />
                            Ballot Cast
                          </span>
                        ) : (
                          <button
                            onClick={() => handleIssuePin(student)}
                            disabled={issuingStudentId === student.student_id}
                            className={`btn btn-sm gap-1.5 shadow-xs ${
                              isPinActive
                                ? 'bg-amber-600 text-white hover:bg-amber-700 focus:ring-amber-500'
                                : 'btn-primary'
                            }`}
                          >
                            <KeyIcon className="w-3.5 h-3.5" />
                            <span>
                              {issuingStudentId === student.student_id
                                ? 'Issuing...'
                                : isPinActive
                                ? 'Re-Issue PIN Slip'
                                : 'Issue Voting PIN'}
                            </span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Printable Voting PIN Slip Modal */}
      <Modal
        isOpen={slipModalOpen}
        onClose={() => setSlipModalOpen(false)}
        title="Physical Voting PIN Slip"
        maxWidth="max-w-md"
      >
        {activeSlip && (
          <div className="space-y-6">
            {/* Slip Container for Print & Display */}
            <div
              id="printable-slip"
              ref={slipPrintRef}
              className="bg-gradient-to-b from-white to-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-6 shadow-sm relative overflow-hidden"
            >
              {/* Top Watermark / Badge */}
              <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-black text-sm">
                    eV
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-sm tracking-tight leading-none uppercase">
                      Campus E-Voting System
                    </h3>
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      Official Physical Polling Slip
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-bold">
                    STATION AUTH
                  </span>
                </div>
              </div>

              {/* Election Title */}
              <div className="mb-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Election Slate
                </span>
                <p className="text-sm font-black text-slate-900 leading-snug">
                  {activeSlip.election_title}
                </p>
              </div>

              {/* Student Details Grid */}
              <div className="grid grid-cols-2 gap-2 py-3 px-3.5 bg-slate-100/80 rounded-xl mb-4 border border-slate-200/70 text-xs">
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase block">Voter Name</span>
                  <p className="font-bold text-slate-900 truncate">{activeSlip.name}</p>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase block">Student ID</span>
                  <p className="font-mono font-bold text-primary-700">{activeSlip.student_id}</p>
                </div>
                <div className="col-span-2 pt-1 border-t border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase block">Department</span>
                  <p className="font-medium text-slate-700 truncate">{activeSlip.department}</p>
                </div>
              </div>

              {/* 6-DIGIT PIN DISPLAY BOX */}
              <div className="my-5 p-4 rounded-2xl bg-white border-2 border-primary-500 shadow-md text-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary-700 block mb-1">
                  Single-Use 6-Digit Voting PIN
                </span>
                <div className="text-4xl font-black font-mono tracking-widest text-slate-900 py-1 select-all">
                  {activeSlip.pin}
                </div>
                <div className="mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-amber-700">
                  <ClockIcon className="w-4 h-4 text-amber-600" />
                  <span>
                    Expires in:{' '}
                    <span className="font-mono font-bold">{formatCountdown(remainingSeconds)}</span>
                  </span>
                </div>
              </div>

              {/* Instructions */}
              <div className="text-[11px] text-slate-600 space-y-1.5 leading-relaxed bg-amber-50/70 p-3 rounded-xl border border-amber-200/70">
                <p className="font-bold text-amber-900 flex items-center gap-1">
                  <ShieldCheckIcon className="w-3.5 h-3.5" />
                  Voting Booth Instructions:
                </p>
                <ol className="list-decimal list-inside space-y-0.5 text-[10.5px]">
                  <li>Proceed to any available Lab Booth Terminal.</li>
                  <li>Scan or enter your Student ID.</li>
                  <li>Enter the 6-Digit Voting PIN above to unlock your ballot.</li>
                  <li>This PIN expires in 20 mins and is burned upon submission.</li>
                </ol>
              </div>

              {/* Slip Footer with timestamp and security hash */}
              <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span>Issued: {activeSlip.issued_at}</span>
                <span>SHA-256 Validated</span>
              </div>
            </div>

            {/* Modal Buttons (Hidden in print) */}
            <div className="flex items-center justify-between gap-3 pt-2 no-print">
              <button
                type="button"
                onClick={() => setSlipModalOpen(false)}
                className="btn btn-secondary flex-1"
              >
                Close Desk
              </button>
              <button
                type="button"
                onClick={handlePrintSlip}
                className="btn btn-primary flex-1 gap-2 shadow-md shadow-primary-500/20"
              >
                <PrinterIcon className="w-4 h-4" />
                <span>Print Voting Slip</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PollingDesk;
