import { useNavigate } from 'react-router-dom';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckBadgeIcon,
  CheckCircleIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TicketIcon,
  TrashIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '../../api/adminApi';
import { EmptyState, PageHeader, TableSkeleton, errorMessage } from '../ui';
import { usePolling } from '../../hooks/usePolling';
import Modal from '../common/Modal';

export const VoterSlipsManager = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState(null);
  const [slips, setSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [kiosks, setKiosks] = useState([]);

  // Filters
  const [boothFilter, setBoothFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState(''); // '' | 'unused' | 'used'
  const [search, setSearch] = useState('');

  // Generation Modal & Form
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [targetBooth, setTargetBooth] = useState('1');
  const [slipCount, setSlipCount] = useState(50);
  const [generating, setGenerating] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [cancellingSlip, setCancellingSlip] = useState(null);
  const [cancellingBusy, setCancellingBusy] = useState(false);

  const handleCancelSlip = async () => {
    if (!cancellingSlip) return;
    setCancellingBusy(true);
    try {
      await adminApi.cancelSlip(cancellingSlip.id);
      toast.success(`Slip ${cancellingSlip.voting_id} marked as cancelled/void.`);
      setCancellingSlip(null);
      await Promise.all([fetchMetrics(), fetchSlips(false)]);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to cancel slip.'));
    } finally {
      setCancellingBusy(false);
    }
  };

  const fetchKiosks = useCallback(async () => {
    try {
      const data = await adminApi.getKiosks();
      setKiosks(data || []);
    } catch {
      // silent
    }
  }, []);

  const fetchMetrics = useCallback(async () => {
    try {
      const data = await adminApi.getBoothSlipsMetrics();
      if (data) setMetrics(data);
    } catch {
      // silent
    }
  }, []);

  const availableBooths = useMemo(() => {
    const list = [];
    const seen = new Set();
    (kiosks || []).forEach((k) => {
      const num = k.number || k.booth_number;
      if (num && !seen.has(num)) {
        seen.add(num);
        list.push({
          number: num,
          label: k.device_name || `BOOTH-${String(num).padStart(2, '0')}`,
        });
      }
    });
    (metrics?.booths || []).forEach((b) => {
      const num = b.booth_number;
      if (num && !seen.has(num)) {
        seen.add(num);
        list.push({
          number: num,
          label: b.booth_id || `BOOTH-${String(num).padStart(2, '0')}`,
        });
      }
    });
    return list.sort((a, b) => a.number - b.number);
  }, [kiosks, metrics]);

  const fetchSlips = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = {
        page,
        per_page: 50,
      };
      if (boothFilter && boothFilter !== 'all') params.booth_number = boothFilter;
      if (statusFilter) params.status = statusFilter;
      if (search.trim()) params.search = search.trim();

      const data = await adminApi.getBoothSlipsList(params);
      setSlips(data.items || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch (err) {
      if (!silent) toast.error(errorMessage(err, 'Failed to load slips list'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, boothFilter, statusFilter, search]);

  useEffect(() => {
    fetchKiosks();
    fetchMetrics();
    fetchSlips(false);
  }, [fetchKiosks, fetchMetrics, fetchSlips]);

  usePolling(fetchKiosks, 4000);
  usePolling(fetchMetrics, 2000);
  usePolling(() => fetchSlips(true), 2500);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!targetBooth || targetBooth === 'none' || targetBooth === 'all') {
      toast.error('Please select a specific Voting Booth.');
      return;
    }
    const bNum = Number(targetBooth);
    if (!bNum || isNaN(bNum) || bNum < 1) {
      toast.error('Please select a valid Voting Booth.');
      return;
    }

    setGenerating(true);
    try {
      const res = await adminApi.generateSlips(Number(slipCount), bNum);
      toast.success(res.message || `Generated ${res.count_created} voting slips.`);
      setGenerateModalOpen(false);
      setPage(1);
      await fetchKiosks();
      await fetchMetrics();
      await fetchSlips(false);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to generate slips'));
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadAllPdf = async () => {
    setDownloadingPdf(true);
    try {
      const blob = await adminApi.downloadAllSlipsPdf();
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `voting-slips-all-booths.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Downloaded all voting slips PDF');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to download PDF'));
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadSinglePdf = async (slip) => {
    setDownloadingPdf(true);
    try {
      const blob = await adminApi.downloadSingleSlipPdf(slip.id);
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `voting-slip-${slip.voting_id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(`Downloaded Slip ${slip.voting_id} PDF`);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to download slip PDF'));
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadBoothPdf = async (boothNumber) => {
    setDownloadingPdf(true);
    try {
      const blob = await adminApi.downloadBoothSlipsPdf(boothNumber);
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `voting-slips-booth-${String(boothNumber).padStart(2, '0')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(`Downloaded Booth ${boothNumber} slips PDF`);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to download PDF'));
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Compute calculated preview range for target booth
  const getPreviewRange = () => {
    const bNum = parseInt(targetBooth, 10);
    if (isNaN(bNum) || bNum < 1) {
      return 'Please select a booth to preview the slip range.';
    }
    const boothInfo = (metrics?.booths || []).find((b) => b.booth_number === bNum);
    const currentCount = boothInfo?.total_slips || 0;
    const startNum = (bNum * 1000) + currentCount + 1;
    const endNum = startNum + Number(slipCount) - 1;
    return `BOOTH-${String(bNum).padStart(2, '0')}: Slips ${startNum} to ${endNum}`;
  };

  const currentBoothStats = useMemo(() => {
    if (!boothFilter || boothFilter === 'all') {
      return {
        total: metrics?.total_generated ?? total,
        unused: metrics?.total_unused ?? 0,
        active: metrics?.total_active ?? 0,
        used: metrics?.total_used ?? 0,
      };
    }
    if (boothFilter === 'unassigned') {
      const pool = (metrics?.booths || []).find((b) => b.booth_number === null || b.booth_id === 'Unassigned Pool');
      return {
        total: pool?.total_slips ?? 0,
        unused: pool?.unused_slips ?? 0,
        active: pool?.active_slips ?? 0,
        used: pool?.used_slips ?? 0,
      };
    }
    const bStat = (metrics?.booths || []).find((b) => String(b.booth_number) === String(boothFilter));
    return {
      total: bStat?.total_slips ?? 0,
      unused: bStat?.unused_slips ?? 0,
      active: bStat?.active_slips ?? 0,
      used: bStat?.used_slips ?? 0,
    };
  }, [boothFilter, metrics, total]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Voter Slips & Credentials"
        subtitle="Generate and manage pre-issued voter slips, sequential IDs, and printable A4 PDF sheets for each booth."
        actions={
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={downloadingPdf || !metrics?.total_generated}
              onClick={handleDownloadAllPdf}
              className="btn-secondary flex items-center gap-2"
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              <span>{downloadingPdf ? 'Building PDF…' : 'Download All Slips PDF'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const first = availableBooths[0]?.number || 1;
                setTargetBooth(String(first));
                setSlipCount(50);
                setGenerateModalOpen(true);
              }}
              className="btn-primary flex items-center gap-2"
            >
              <PlusIcon className="w-4 h-4" />
              <span>Generate Slips</span>
            </button>
          </div>
        }
      />

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Total Slips Generated</p>
          <p className="text-2xl font-black text-fg mt-1">{metrics?.total_generated ?? total ?? 0}</p>
          <p className="text-[11px] text-muted mt-1">{metrics?.total_booths || 0} active booths</p>
        </div>

        <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Unused Slips</p>
          <p className="text-2xl font-black text-fg mt-1">{metrics?.total_unused ?? (total || 0)}</p>
          <p className="text-[11px] text-muted mt-1">Available in queue</p>
        </div>

        <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand">Active Slips</p>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand" />
            </span>
          </div>
          <p className="text-2xl font-black text-brand mt-1">{metrics?.total_active ?? 0}</p>
          <p className="text-[11px] text-muted mt-1">At voting booths</p>
        </div>

        <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ok">Used Slips (Votes Cast)</p>
          <p className="text-2xl font-black text-ok mt-1">{metrics?.total_used ?? 0}</p>
          <p className="text-[11px] text-muted mt-1">{metrics?.completion_rate ?? 0}% completed</p>
        </div>
      </div>

      {/* Slips Explorer & Filtering Table */}
      <div className="card">
        {/* Table Filters Header */}
        <div className="p-4 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Tabs */}
            {[
              ['', 'All Slips', currentBoothStats.total],
              ['unused', 'Unused', currentBoothStats.unused],
              ['active', 'Active', currentBoothStats.active],
              ['used', 'Used', currentBoothStats.used],
            ].map(([val, lbl, count]) => (
              <button
                key={val}
                type="button"
                onClick={() => { setStatusFilter(val); setPage(1); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  statusFilter === val
                    ? 'bg-brand text-white shadow-2xs'
                    : 'bg-surface text-muted border border-line hover:bg-recessed hover:text-fg'
                }`}
              >
                {val === 'active' && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                )}
                <span>{lbl}</span>
                {count !== undefined && count !== null && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${statusFilter === val ? 'bg-white/20 text-white' : 'bg-recessed text-muted'}`}>
                    {count}
                  </span>
                )}
              </button>
            ))}

            {/* Booth Select Filter */}
            <select
              value={boothFilter || 'all'}
              onChange={(e) => {
                setBoothFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 rounded-xl border border-line bg-surface text-fg text-xs font-semibold shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand/20 cursor-pointer"
            >
              <option value="all">All Booths</option>
              {availableBooths.map((b) => (
                <option key={b.number} value={String(b.number)}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div className="relative sm:w-64">
            <MagnifyingGlassIcon className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search Voting ID..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-line bg-surface text-fg text-xs shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand/20 placeholder:text-muted/60"
            />
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <TableSkeleton rows={5} cols={7} />
        ) : slips.length === 0 ? (
          <EmptyState
            icon={TicketIcon}
            title={total === 0 ? "No voter slips generated yet" : "No slips match the current filter"}
          >
            {total === 0 ? (
              <div className="space-y-3 mt-1">
                <p>Click the <strong>Generate Slips</strong> button above to pre-generate sequential voting credentials with 4-digit PINs.</p>
                <div>
                  <button
                    onClick={() => {
                      setTargetBooth('none');
                      setGenerateModalOpen(true);
                    }}
                    className="btn-primary inline-flex items-center gap-1.5"
                  >
                    <PlusIcon className="w-4 h-4" />
                    <span>Generate Slips Now</span>
                  </button>
                </div>
              </div>
            ) : (
              "Try adjusting your search or booth filters, or generate new slips using the button above."
            )}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Voting ID</th>
                  <th>Booth</th>
                  <th>Machine Allotment</th>
                  <th>Sequence #</th>
                  <th>Status</th>
                  <th>Used At</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {slips.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className="font-mono text-xs font-black px-2.5 py-1 rounded-md bg-recessed text-brand border border-line">
                        {s.voting_id}
                      </span>
                    </td>
                    <td className="font-semibold text-fg">
                      {s.booth_number ? (
                        `BOOTH-${String(s.booth_number).padStart(2, '0')}`
                      ) : (
                        <span className="text-muted font-normal text-xs italic">Unassigned (Pool)</span>
                      )}
                    </td>
                    <td>
                      {s.booth_id ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-ok-soft text-ok">
                          <CheckCircleIcon className="w-3.5 h-3.5" />
                          <span>Allotted to Machine</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-recessed text-muted border border-line">
                          <span>Unallotted</span>
                        </span>
                      )}
                    </td>
                    <td className="text-muted font-mono text-xs">#{s.sequence_number}</td>
                    <td>
                      {s.is_cancelled ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-bad-soft text-bad border border-bad/20">
                          <XCircleIcon className="w-3.5 h-3.5" />
                          <span>Cancelled</span>
                        </span>
                      ) : s.status === 'used' || s.is_used ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-ok-soft text-ok border border-ok/20">
                          <CheckCircleIcon className="w-3.5 h-3.5" />
                          <span>Used</span>
                        </span>
                      ) : s.status === 'active' || s.is_active ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-brand-soft text-brand border border-brand/20">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand" />
                          </span>
                          <span>Active</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-recessed text-muted border border-line">
                          <ClockIcon className="w-3.5 h-3.5 text-muted" />
                          <span>Unused</span>
                        </span>
                      )}
                    </td>
                    <td className="text-muted text-xs font-mono">
                      {s.used_at ? new Date(s.used_at).toLocaleTimeString() : '—'}
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {!s.is_used && !s.is_cancelled && (
                          <button
                            type="button"
                            onClick={() => setCancellingSlip(s)}
                            className="btn-ghost btn-sm text-bad hover:bg-bad/10 flex items-center gap-1"
                            title={`Cancel and void slip ${s.voting_id}`}
                          >
                            <XCircleIcon className="w-3.5 h-3.5" />
                            <span>Cancel</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDownloadSinglePdf(s)}
                          className="btn-ghost btn-sm text-brand flex items-center gap-1"
                          title={`Download individual printable PDF for slip ${s.voting_id}`}
                        >
                          <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                          <span>Slip PDF</span>
                        </button>
                        {s.booth_number ? (
                          <button
                            type="button"
                            onClick={() => handleDownloadBoothPdf(s.booth_number)}
                            className="btn-ghost btn-sm text-muted hover:text-fg flex items-center gap-1"
                            title={`Download printable PDF for Booth ${s.booth_number}`}
                          >
                            <span>Booth PDF</span>
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {pages > 1 && (
          <div className="px-5 py-3.5 border-t border-line flex items-center justify-between text-xs text-muted bg-recessed/30">
            <span>
              Showing page <strong>{page}</strong> of <strong>{pages}</strong> ({total} total slips)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg bg-surface hover:bg-recessed disabled:opacity-40 border border-line font-bold text-fg shadow-2xs transition-colors"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                className="px-3 py-1.5 rounded-lg bg-surface hover:bg-recessed disabled:opacity-40 border border-line font-bold text-fg shadow-2xs transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Cancel Individual Voter Slip Confirmation Modal */}
      <Modal
        isOpen={Boolean(cancellingSlip)}
        onClose={() => !cancellingBusy && setCancellingSlip(null)}
        title={`Cancel Voter Slip ${cancellingSlip?.voting_id || ''}?`}
      >
        {cancellingSlip && (
          <div className="space-y-4">
            <p className="text-sm text-fg leading-relaxed">
              Are you sure you want to void and cancel slip <strong className="font-mono text-brand font-black">{cancellingSlip.voting_id}</strong>?
            </p>
            <p className="text-xs text-muted leading-relaxed">
              This will mark the slip as spoiled/void. The booth terminal will automatically advance to the next valid sequential voting slip. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                className="btn-ghost"
                disabled={cancellingBusy}
                onClick={() => setCancellingSlip(null)}
              >
                Keep Slip
              </button>
              <button
                type="button"
                className="btn-danger flex items-center gap-1.5"
                disabled={cancellingBusy}
                onClick={handleCancelSlip}
              >
                <XCircleIcon className="w-4 h-4" />
                <span>{cancellingBusy ? 'Cancelling…' : 'Confirm Void & Cancel'}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal for Slips Generation */}
      <Modal
        isOpen={generateModalOpen}
        onClose={() => setGenerateModalOpen(false)}
        title={!targetBooth || targetBooth === 'none' || targetBooth === 'all' ? 'Generate Voter Slips' : `Generate Slips for Booth ${targetBooth}`}
      >
        {availableBooths.length === 0 ? (
          <div className="space-y-4 py-2">
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-sm space-y-2">
              <p className="font-bold flex items-center gap-2">
                <span>⚠️</span> No Voting Booths registered yet
              </p>
              <p className="text-xs leading-relaxed">
                Before generating slips, please create your Voting Booths first (e.g. BOOTH-01, BOOTH-02). Slips are strictly assigned directly to specific booths to prevent waste and reduce printing costs.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setGenerateModalOpen(false)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setGenerateModalOpen(false);
                  navigate('/admin/kiosks');
                }}
              >
                Go to Voting Booths
              </button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleGenerate} className="space-y-4">
          <p className="text-xs text-muted">
            Pre-generates sequential voting IDs with cryptographically secure 4-digit PINs assigned directly to the selected booth terminal.
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-fg">
              Target Voting Booth <span className="text-brand font-bold text-[11px]">* Required</span>
            </label>
            <select
              value={targetBooth}
              onChange={(e) => setTargetBooth(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-line bg-surface text-fg text-sm shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand/25"
              required
            >
              {availableBooths.map((b) => (
                <option key={b.number} value={String(b.number)}>
                  {b.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted">
              Slips are assigned exclusively to this booth to eliminate slip waste.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-fg">Number of Slips to Generate</label>
            <input
              type="number"
              min={1}
              max={1500}
              value={slipCount}
              onChange={(e) => setSlipCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full px-3 py-2 rounded-xl border border-line bg-surface text-fg text-sm shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand/25"
              required
            />
            <p className="text-[11px] text-muted">{getPreviewRange()}</p>
          </div>

          <div className="p-3 rounded-xl bg-recessed/60 border border-line text-xs text-muted space-y-1">
            <p className="font-bold text-fg">Voter Slips Generation Guide:</p>
            <p>• Sequential slip IDs are formatted with the election prefix (e.g. SUE26-E1-1001).</p>
            <p>• Each slip includes an authorized 4-digit voting PIN for kiosk unlock.</p>
            <p>• Slips can be downloaded individually or as printable A4 PDF sheets.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setGenerateModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={generating}
              className="btn-primary"
            >
              {generating ? 'Generating…' : 'Generate Slips'}
            </button>
          </div>
        </form>
        )}
      </Modal>
    </div>
  );
};

export default VoterSlipsManager;