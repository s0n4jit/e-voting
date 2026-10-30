import React, { useState, useEffect, useMemo, useRef } from 'react';
import { adminApi } from '../../api/adminApi';
import { voterApi } from '../../api/voterApi';
import LoadingSpinner from '../common/LoadingSpinner';
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
  BuildingLibraryIcon,
  UserPlusIcon,
  XMarkIcon,
  QrCodeIcon,
  IdentificationIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

export const PollingDesk = () => {
  const [elections, setElections] = useState([]);
  const [selectedElectionId, setSelectedElectionId] = useState('');
  const [voters, setVoters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [issuingStudentId, setIssuingStudentId] = useState(null);

  // On-the-spot quick check-in state
  const [checkinId, setCheckinId] = useState('');
  const [checkinName, setCheckinName] = useState('');
  const [checkinDept, setCheckinDept] = useState('');
  const [isEnrollingNew, setIsEnrollingNew] = useState(false);

  // Active PIN Slip Modal
  const [slipModalOpen, setSlipModalOpen] = useState(false);
  const [activeSlip, setActiveSlip] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(1200);

  const slipPrintRef = useRef(null);

  // Load elections and initial voters
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        let loadedElections = [];
        try {
          const activeElectionsData = await voterApi.getActiveElections();
          const list = Array.isArray(activeElectionsData)
            ? activeElectionsData
            : activeElectionsData?.elections || [];
          loadedElections = list;
          setElections(list);
          if (list.length > 0) {
            setSelectedElectionId(String(list[0].id));
          }
        } catch (e) {
          try {
            const adminElections = await adminApi.getElections();
            const list = Array.isArray(adminElections)
              ? adminElections
              : adminElections?.elections || [];
            loadedElections = list;
            setElections(list);
            if (list.length > 0) setSelectedElectionId(String(list[0].id));
          } catch (e2) {
            console.warn('Elections lookup fallback:', e2);
          }
        }

        const votersRes = await adminApi.getDeskVoters('');
        const vList = Array.isArray(votersRes) ? votersRes : votersRes?.voters || [];
        setVoters(vList);

        if (votersRes?.elections && loadedElections.length === 0) {
          setElections(votersRes.elections);
          if (votersRes.elections.length > 0) {
            setSelectedElectionId(String(votersRes.elections[0].id));
          }
        } else if (votersRes?.election && loadedElections.length === 0) {
          setElections([votersRes.election]);
          setSelectedElectionId(String(votersRes.election.id));
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

  // Real-time silent polling every 3 seconds to keep turnout & voting statuses synced
  useEffect(() => {
    let isSubscribed = true;

    const silentPoll = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const data = await adminApi.getDeskVoters({
          election_id: selectedElectionId || undefined,
        });
        const list = Array.isArray(data) ? data : data?.voters || [];
        if (isSubscribed && Array.isArray(list) && list.length > 0) {
          setVoters(list);
        }
      } catch (err) {
        // silent
      }
    };

    const interval = setInterval(silentPoll, 3000);
    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [selectedElectionId]);

  // Selected election object
  const currentElection = elections.find((e) => String(e.id) === String(selectedElectionId));

  // Filtered voters list for queue table
  const filteredVoters = useMemo(() => {
    if (!searchQuery.trim()) return voters;
    const q = searchQuery.toLowerCase().trim();
    return voters.filter(
      (v) =>
        (v.student_id && v.student_id.toLowerCase().includes(q)) ||
        (v.name && v.name.toLowerCase().includes(q)) ||
        (v.department && v.department.toLowerCase().includes(q))
    );
  }, [voters, searchQuery]);

  // Check-in input matcher: check if typed ID already exists in DB
  const matchedStudent = useMemo(() => {
    if (!checkinId.trim()) return null;
    const clean = checkinId.trim().toUpperCase();
    return voters.find((v) => v.student_id?.toUpperCase() === clean) || null;
  }, [voters, checkinId]);

  // Auto-fill fields if matched
  useEffect(() => {
    if (matchedStudent) {
      setCheckinName(matchedStudent.name || '');
      setCheckinDept(matchedStudent.department || '');
      setIsEnrollingNew(false);
    } else if (checkinId.trim().length >= 3) {
      setIsEnrollingNew(true);
    } else {
      setIsEnrollingNew(false);
    }
  }, [matchedStudent, checkinId]);

  // Expiry countdown timer for active slip modal
  useEffect(() => {
    if (!slipModalOpen || !activeSlip) return;

    if (activeSlip.expires_at) {
      const expiryMs = new Date(activeSlip.expires_at).getTime();
      const nowMs = Date.now();
      const diffSec = Math.max(0, Math.floor((expiryMs - nowMs) / 1000));
      setRemainingSeconds(diffSec > 0 ? diffSec : 1200);
    } else {
      setRemainingSeconds(1200);
    }

    const interval = setInterval(() => {
      setRemainingSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [slipModalOpen, activeSlip]);

  const formatCountdown = (secs) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Issue PIN handler (supports existing student or on-the-spot enrollment)
  const handleIssueSlip = async (studentToIssue = null) => {
    if (!selectedElectionId) {
      toast.error('Please select an active election slate.');
      return;
    }

    const targetStudentId = (studentToIssue?.student_id || checkinId).trim().toUpperCase();
    const targetName = (studentToIssue?.name || checkinName).trim();
    const targetDept = (studentToIssue?.department || checkinDept).trim();

    if (!targetStudentId) {
      toast.error('Please scan or enter the Student ID.');
      return;
    }

    // Check if already voted
    const existing = voters.find((v) => v.student_id?.toUpperCase() === targetStudentId);
    if (existing && (existing.has_voted || existing.status === 'voted')) {
      toast.error(`Student ${targetStudentId} has ALREADY VOTED. Duplicate voting is prohibited!`);
      return;
    }

    setIssuingStudentId(targetStudentId);

    try {
      const response = await adminApi.issueDeskPin({
        student_id: targetStudentId,
        election_id: selectedElectionId,
        name: targetName || targetStudentId,
        department: targetDept || 'General',
      });

      const pin = response.pin || response.voting_pin;
      const expiresAt = response.expires_at || new Date(Date.now() + 20 * 60 * 1000).toISOString();

      const slipData = {
        pin: String(pin),
        student_id: targetStudentId,
        name: response.name || targetName || targetStudentId,
        department: response.department || targetDept || 'General Campus',
        election_title: response.election_title || currentElection?.title || 'General Election 2026-27',
        election_id: selectedElectionId,
        issued_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        expires_at: expiresAt,
        is_new_registration: Boolean(response.is_new_registration),
      };

      setActiveSlip(slipData);
      setSlipModalOpen(true);

      // Clear quick check-in form
      setCheckinId('');
      setCheckinName('');
      setCheckinDept('');
      setIsEnrollingNew(false);

      toast.success(
        response.is_new_registration
          ? `Student ${targetStudentId} enrolled on-the-spot & PIN slip issued!`
          : `Voting PIN issued for ${slipData.name}`
      );

      // Refresh list
      const votersRes = await adminApi.getDeskVoters({ election_id: selectedElectionId });
      if (Array.isArray(votersRes)) setVoters(votersRes);
      else if (votersRes?.voters) setVoters(votersRes.voters);
    } catch (err) {
      console.error('Failed to issue desk slip:', err);
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to issue voting PIN slip.';
      toast.error(msg);
    } finally {
      setIssuingStudentId(null);
    }
  };

  const handlePrintSlip = () => {
    window.print();
  };

  // Turnout summary stats
  const totalEnrolled = voters.length;
  const totalVoted = voters.filter((v) => v.has_voted || v.status === 'voted').length;
  const activePins = voters.filter((v) => v.pin_active || v.status === 'pin_active').length;
  const turnoutPercent = totalEnrolled > 0 ? Math.round((totalVoted / totalEnrolled) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            Polling Desk Check-In & PIN Issuance
            <span className="px-2.5 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold font-mono">
              OFFICIAL DESK
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Verify College ID cards, register students on-the-spot, and print single-use 6-digit voting slips.
          </p>
        </div>

        {/* Election Selector */}
        {elections.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Slate:</span>
            <select
              value={selectedElectionId}
              onChange={(e) => setSelectedElectionId(e.target.value)}
              className="bg-white border border-slate-300 text-slate-800 text-xs font-semibold rounded-xl px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {elections.map((elec) => (
                <option key={elec.id} value={elec.id}>
                  {elec.title} {elec.is_active ? '● (Active)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Top Station Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Enrolled</p>
          <p className="text-2xl font-black text-slate-900 mt-1">{totalEnrolled}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Verified eligible students</p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Ballots Cast</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-emerald-600">{totalVoted}</span>
            <span className="text-xs font-bold text-slate-500">({turnoutPercent}% turnout)</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
            <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${turnoutPercent}%` }} />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-500">Active PIN Slips</p>
          <p className="text-2xl font-black text-amber-500 mt-1">{activePins}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Voters at booths currently</p>
        </div>

        <div className="p-4 rounded-2xl bg-gradient-to-tr from-indigo-900 to-slate-900 text-white shadow-md border border-indigo-800">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">Station Status</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-lg font-bold text-white">Live & Synchronized</span>
          </div>
          <p className="text-[11px] text-indigo-200/80 mt-0.5 font-mono">Silent real-time refresh active</p>
        </div>
      </div>

      {/* Main Section: Check-In Console & Auto-Registration */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Quick ID Check-in & Auto-Enrollment Card */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 relative overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center">
                  <IdentificationIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Voter Verification & Slip Generator</h3>
                  <p className="text-xs text-slate-500">Scan barcode on College ID or enter Student ID manually.</p>
                </div>
              </div>

              {matchedStudent && (
                <span
                  className={`px-3 py-1 rounded-xl text-xs font-bold uppercase tracking-wider border ${
                    matchedStudent.has_voted || matchedStudent.status === 'voted'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : matchedStudent.pin_active || matchedStudent.status === 'pin_active'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                >
                  {matchedStudent.has_voted || matchedStudent.status === 'voted'
                    ? '● Already Voted'
                    : matchedStudent.pin_active || matchedStudent.status === 'pin_active'
                    ? '● PIN Slip Active'
                    : '● Verified Eligible'}
                </span>
              )}
            </div>

            {/* Check-in Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleIssueSlip();
              }}
              className="mt-6 space-y-4"
            >
              {/* Student ID Input */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  1. Student ID / Roll Number *
                </label>
                <div className="relative">
                  <IdentificationIcon className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="Scan barcode or type (e.g. CS-2024-042 or STU001)"
                    value={checkinId}
                    onChange={(e) => setCheckinId(e.target.value.toUpperCase())}
                    className="w-full bg-slate-50 border-2 border-slate-300 rounded-2xl pl-11 pr-4 py-3 text-base font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 uppercase"
                    autoFocus
                  />
                </div>
              </div>

              {/* Matched / Auto-Enrollment Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    2. Student Full Name {isEnrollingNew && <span className="text-indigo-600">(On-the-spot)</span>}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Rahul Sharma"
                    value={checkinName}
                    onChange={(e) => setCheckinName(e.target.value)}
                    disabled={Boolean(matchedStudent)}
                    className={`w-full border rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                      matchedStudent
                        ? 'bg-slate-100 text-slate-700 border-slate-200 cursor-not-allowed'
                        : 'bg-slate-50 text-slate-900 border-slate-300 focus:outline-none focus:border-indigo-600'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    3. Academic Department / Stream
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Computer Science / BCA / Arts"
                    value={checkinDept}
                    onChange={(e) => setCheckinDept(e.target.value)}
                    disabled={Boolean(matchedStudent)}
                    className={`w-full border rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                      matchedStudent
                        ? 'bg-slate-100 text-slate-700 border-slate-200 cursor-not-allowed'
                        : 'bg-slate-50 text-slate-900 border-slate-300 focus:outline-none focus:border-indigo-600'
                    }`}
                  />
                </div>
              </div>

              {/* On-The-Spot Enrollment Banner */}
              {isEnrollingNew && !matchedStudent && (
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2.5 animate-fade-in">
                  <UserPlusIcon className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">On-The-Spot Student Enrollment</p>
                    <p className="text-[11px] text-amber-700/90 mt-0.5 leading-relaxed">
                      Student <span className="font-mono font-bold">{checkinId}</span> is not yet in the pre-loaded roster. Submitting will register this student instantly and issue their voting PIN slip.
                    </p>
                  </div>
                </div>
              )}

              {/* Already Voted Rejection Alert */}
              {matchedStudent && (matchedStudent.has_voted || matchedStudent.status === 'voted') && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-3 animate-fade-in">
                  <ExclamationTriangleIcon className="w-6 h-6 text-rose-600 shrink-0" />
                  <div>
                    <p className="font-bold text-sm">VOTING BLOCKED: Already Cast Ballot</p>
                    <p className="text-[11px] text-rose-700 mt-0.5">
                      This student has already recorded their vote in the certified ledger. Duplicate slips are strictly prohibited.
                    </p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                <p className="text-xs text-slate-400">
                  Voting slips are single-use and automatically expire in 20 minutes.
                </p>

                <button
                  type="submit"
                  disabled={
                    Boolean(issuingStudentId) ||
                    !checkinId.trim() ||
                    Boolean(matchedStudent && (matchedStudent.has_voted || matchedStudent.status === 'voted'))
                  }
                  className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-primary-600 hover:from-indigo-500 hover:to-primary-500 text-white font-extrabold text-sm shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {issuingStudentId ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span>Generating Slip...</span>
                    </>
                  ) : isEnrollingNew ? (
                    <>
                      <UserPlusIcon className="w-5 h-5" />
                      <span>Enroll & Issue Voting Slip</span>
                    </>
                  ) : (
                    <>
                      <TicketIcon className="w-5 h-5" />
                      <span>Issue 6-Digit Voting Slip</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Quick Roster Queue / Search */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Voter Registry Search</h3>
                <p className="text-xs text-slate-500">Search enrolled students or click to issue slip directly.</p>
              </div>

              <div className="relative w-full sm:w-64">
                <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Student ID</th>
                    <th className="py-3 px-4">Full Name</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Desk Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredVoters.slice(0, 15).map((voter) => (
                    <tr key={voter.student_id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{voter.student_id}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{voter.name}</td>
                      <td className="py-3 px-4 text-slate-500">{voter.department || 'General'}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                            voter.has_voted || voter.status === 'voted'
                              ? 'bg-rose-100 text-rose-700'
                              : voter.pin_active || voter.status === 'pin_active'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {voter.has_voted || voter.status === 'voted'
                            ? 'Voted'
                            : voter.pin_active || voter.status === 'pin_active'
                            ? 'PIN Active'
                            : 'Ready'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {voter.has_voted || voter.status === 'voted' ? (
                          <span className="text-[11px] font-semibold text-slate-400">Completed</span>
                        ) : (
                          <button
                            onClick={() => handleIssueSlip(voter)}
                            disabled={issuingStudentId === voter.student_id}
                            className="px-3 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition-colors border border-indigo-200 disabled:opacity-50"
                          >
                            {issuingStudentId === voter.student_id ? 'Generating...' : 'Issue Slip'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredVoters.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No enrolled voters matched '{searchQuery}'. Use the quick check-in above to enroll on-the-spot!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column (1 Col): Station Instructions & Verification Guidelines */}
        <div className="space-y-6">
          <div className="p-6 rounded-3xl bg-slate-900 text-white shadow-sm space-y-4">
            <div className="flex items-center gap-2.5 text-indigo-300">
              <ShieldCheckIcon className="w-6 h-6" />
              <h4 className="font-bold text-sm tracking-tight text-white">Desk Verification Protocol</h4>
            </div>

            <ol className="list-decimal pl-4 space-y-2.5 text-xs text-slate-300 leading-relaxed">
              <li>
                <span className="font-bold text-white">Inspect College ID Card:</span> Verify photograph and student identity against physical card.
              </li>
              <li>
                <span className="font-bold text-white">Check Voting Eligibility:</span> Ensure student has not already cast their ballot.
              </li>
              <li>
                <span className="font-bold text-white">Generate Slip:</span> Click issue to generate a single-use 6-digit PIN slip.
              </li>
              <li>
                <span className="font-bold text-white">Direct to Booth:</span> Voter must unlock ballot within 20 minutes at any booth terminal.
              </li>
            </ol>

            <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
              <SparklesIcon className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Ballot Secrecy: Voting PIN is destroyed permanently upon vote submission.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Official Physical Voting Slip Modal (Print Ready) */}
      {slipModalOpen && activeSlip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col">
            {/* Modal Screen Header (Hidden on Print) */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between print:hidden">
              <div className="flex items-center gap-2">
                <TicketIcon className="w-5 h-5 text-indigo-400" />
                <span className="font-bold text-sm">Official Voting Access Slip</span>
              </div>
              <button
                onClick={() => setSlipModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Slip Content */}
            <div ref={slipPrintRef} className="p-8 text-slate-900 space-y-6 print:p-4">
              {/* College Header */}
              <div className="text-center pb-4 border-b-2 border-slate-900 border-dashed">
                <h3 className="font-black text-base uppercase tracking-tight text-slate-900">
                  Campus Electoral Committee
                </h3>
                <p className="text-xs font-bold text-slate-600 mt-0.5">{activeSlip.election_title}</p>
                <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-[10px] font-mono font-bold uppercase tracking-widest text-slate-700">
                  Official Polling Booth Access Token
                </span>
              </div>

              {/* Student Identification */}
              <div className="grid grid-cols-2 gap-3 text-xs p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400">Student ID</p>
                  <p className="font-mono font-black text-sm text-slate-900">{activeSlip.student_id}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400">Voter Name</p>
                  <p className="font-bold text-sm text-slate-900 truncate">{activeSlip.name}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Department</p>
                  <p className="font-medium text-xs text-slate-700">{activeSlip.department}</p>
                </div>
              </div>

              {/* The 6-Digit PIN Display */}
              <div className="text-center py-2">
                <p className="text-xs font-bold uppercase tracking-widest text-indigo-700 mb-2">
                  Your 6-Digit Voting PIN
                </p>
                <div className="flex items-center justify-center gap-2">
                  {activeSlip.pin.split('').map((digit, i) => (
                    <span
                      key={i}
                      className="w-11 h-14 rounded-2xl bg-indigo-50 border-2 border-indigo-400 text-indigo-950 font-mono font-black text-2xl flex items-center justify-center shadow-inner"
                    >
                      {digit}
                    </span>
                  ))}
                </div>
              </div>

              {/* Expiry & Instructions */}
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-center text-xs space-y-1">
                <p className="font-bold flex items-center justify-center gap-1.5">
                  <ClockIcon className="w-4 h-4 text-amber-600" />
                  Expires In: <span className="font-mono">{formatCountdown(remainingSeconds)}</span>
                </p>
                <p className="text-[11px] text-amber-700/90 leading-tight">
                  Single-use only. Proceed to any booth terminal immediately.
                </p>
              </div>

              {/* Secrecy Watermark */}
              <p className="text-[10px] text-slate-400 text-center border-t border-slate-200 pt-3 font-mono">
                Issued at {activeSlip.issued_at} • Strict Ballot Secrecy Enforced
              </p>
            </div>

            {/* Modal Actions (Hidden on Print) */}
            <div className="px-6 py-4 bg-slate-100 border-t border-slate-200 flex items-center justify-end gap-3 print:hidden">
              <button
                type="button"
                onClick={() => setSlipModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-800"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handlePrintSlip}
                className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md flex items-center gap-2 transition-all"
              >
                <PrinterIcon className="w-4 h-4" />
                <span>Print Paper Slip</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PollingDesk;
