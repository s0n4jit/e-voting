import React, { useCallback, useEffect, useState } from 'react';
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
} from '@heroicons/react/24/outline';
import { adminApi } from '../../api/adminApi';
import { EmptyState, PageHeader, TableSkeleton, errorMessage } from '../ui';
import { usePolling } from '../../hooks/usePolling';
import Modal from '../common/Modal';

export const VoterSlipsManager = () => {
  const [metrics, setMetrics] = useState(null);
  const [slips, setSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);

  // Filters
  const [boothFilter, setBoothFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // '' | 'unused' | 'used'
  const [search, setSearch] = useState('');

  // Generation Modal & Form
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [targetBooth, setTargetBooth] = useState('all');
  const [slipCount, setSlipCount] = useState(50);
  const [generating, setGenerating] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const fetchMetrics = useCallback(async () => {
    try {
      const data = await adminApi.getBoothSlipsMetrics();
      setMetrics(data);
    } catch {
      // silent
    }
  }, []);

  const fetchSlips = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = {
        page,
        per_page: 50,
      };
      if (boothFilter) params.booth_number = boothFilter;
      if (statusFilter === 'unused') params.is_used = false;
      if (statusFilter === 'used') params.is_used = true;
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
    fetchMetrics();
    fetchSlips(false);
  }, [fetchMetrics, fetchSlips]);

  usePolling(fetchMetrics, 3000);
  usePolling(() => fetchSlips(true), 4000);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setGenerating(true);
    try {
      if (targetBooth === 'all') {
        const res = await adminApi.generateAllBoothSlips(Number(slipCount));
        toast.success(res.message || `Generated ${res.total_created} slips across booths.`);
      } else {
        const res = await adminApi.generateBoothSlips(Number(targetBooth), Number(slipCount));
        toast.success(res.message || `Generated ${res.count_created} slips for Booth ${targetBooth}.`);
      }
      setGenerateModalOpen(false);
      setPage(1);
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
    if (targetBooth === 'all') {
      return `Generates ${slipCount} sequential slips for each active booth.`;
    }
    const bNum = Number(targetBooth);
    const boothInfo = (metrics?.booths || []).find((b) => b.booth_number === bNum);
    const currentCount = boothInfo?.total_slips || 0;
    const startSeq = currentCount + 1;
    const endSeq = currentCount + Number(slipCount);
    return `Booth ${bNum}: Slips ${bNum}${String(startSeq).padStart(3, '0')} to ${bNum}${String(endSeq).padStart(3, '0')}`;
  };

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
                setTargetBooth('all');
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
          <p className="text-2xl font-black text-fg mt-1">{metrics?.total_generated ?? '—'}</p>
          <p className="text-[11px] text-muted mt-1">{metrics?.total_booths || 0} active booths</p>
        </div>

        <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ok">Used Slips (Votes Cast)</p>
          <p className="text-2xl font-black text-ok mt-1">{metrics?.total_used ?? '—'}</p>
          <p className="text-[11px] text-muted mt-1">{metrics?.completion_rate ?? 0}% completed</p>
        </div>

        <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-wider text-brand">Unused Slips Remaining</p>
          <p className="text-2xl font-black text-brand mt-1">{metrics?.total_unused ?? '—'}</p>
          <p className="text-[11px] text-muted mt-1">Available for voters</p>
        </div>

        <div className="p-4 rounded-2xl bg-surface border border-line shadow-card">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Completion Rate</p>
          <p className="text-2xl font-black text-fg mt-1">{metrics?.completion_rate ?? 0}%</p>
          <div className="w-full bg-recessed rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className="bg-brand h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, metrics?.completion_rate || 0)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Quick Generator Panel */}
      <div className="p-5 rounded-2xl bg-surface border border-line shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-fg text-sm flex items-center gap-2">
              <TicketIcon className="w-4 h-4 text-brand" />
              Quick Slips Generator
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Enter the number of slips required. Slips persist permanently across server restarts and browser refreshes.
            </p>
          </div>
        </div>

        <form onSubmit={handleGenerate} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted">Target Booth</label>
            <select
              value={targetBooth}
              onChange={(e) => setTargetBooth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl border border-line bg-surface text-fg text-xs shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand/20"
            >
              <option value="all">All Booths (Distribute equally)</option>
              {(metrics?.booths || []).map((b) => (
                <option key={b.booth_number} value={b.booth_number}>
                  {b.booth_id} (Currently at {b.current_voting_id})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted">Slips Quantity</label>
            <input
              type="number"
              min={1}
              max={1000}
              value={slipCount}
              onChange={(e) => setSlipCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full px-3 py-2 rounded-xl border border-line bg-surface text-fg text-xs shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand/20"
              required
            />
          </div>

          <div className="space-y-1 sm:col-span-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted block">Projected ID Range</span>
            <div className="px-3 py-2 rounded-xl bg-recessed/60 border border-line font-mono text-xs font-bold text-brand truncate">
              {getPreviewRange()}
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={generating}
              className="btn-primary w-full py-2 text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <PlusIcon className="w-4 h-4" />
              <span>{generating ? 'Generating…' : 'Generate Slips Batch'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Slips Explorer & Filtering Table */}
      <div className="card">
        {/* Table Filters Header */}
        <div className="p-4 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Tabs */}
            {[
              ['', 'All Slips'],
              ['unused', 'Unused Only'],
              ['used', 'Used (Voted)'],
            ].map(([val, lbl]) => (
              <button
                key={val}
                type="button"
                onClick={() => { setStatusFilter(val); setPage(1); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  statusFilter === val
                    ? 'bg-brand text-white shadow-2xs'
                    : 'bg-surface text-muted border border-line hover:bg-recessed hover:text-fg'
                }`}
              >
                {lbl}
              </button>
            ))}

            {/* Booth Select Filter */}
            <select
              value={boothFilter}
              onChange={(e) => { setBoothFilter(e.target.value); setPage(1); }}
              className="px-3 py-1.5 rounded-xl border border-line bg-surface text-fg text-xs shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand/20"
            >
              <option value="">All Booths</option>
              {(metrics?.booths || []).map((b) => (
                <option key={b.booth_number} value={b.booth_number}>
                  {b.booth_id}
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
                    onClick={() => setGenerateModalOpen(true)}
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
                  <th>Booth Number</th>
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
                      Booth {s.booth_number} (BOOTH-{String(s.booth_number).padStart(2, '0')})
                    </td>
                    <td>
                      {s.booth_id ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-ok-soft text-ok">
                          <CheckCircleIcon className="w-3.5 h-3.5" />
                          <span>Allotted to Machine</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-recessed text-muted border border-line">
                          <span>Pending Setup</span>
                        </span>
                      )}
                    </td>
                    <td className="text-muted font-mono text-xs">#{s.sequence_number}</td>
                    <td>
                      {s.is_used ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-ok-soft text-ok">
                          <CheckCircleIcon className="w-3.5 h-3.5" />
                          <span>Used</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-brand-soft text-brand-fg">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span>Unused (Active)</span>
                        </span>
                      )}
                    </td>
                    <td className="text-muted text-xs font-mono">
                      {s.used_at ? new Date(s.used_at).toLocaleTimeString() : '—'}
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => handleDownloadBoothPdf(s.booth_number)}
                        className="btn-ghost btn-sm text-brand"
                        title={`Download printable PDF for Booth ${s.booth_number}`}
                      >
                        <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                        <span>Booth PDF</span>
                      </button>
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

      {/* Modal for Slips Generation */}
      <Modal
        isOpen={generateModalOpen}
        onClose={() => setGenerateModalOpen(false)}
        title={targetBooth === 'all' ? 'Generate Slips for All Booths' : `Generate Slips for Booth ${targetBooth}`}
      >
        <form onSubmit={handleGenerate} className="space-y-4">
          <p className="text-xs text-muted">
            Pre-generates sequential voting IDs with cryptographically secure 4-digit PINs. Each slip is 1:1 linked with a voting ID and persists across all server restarts.
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-fg">Target Booth</label>
            <select
              value={targetBooth}
              onChange={(e) => setTargetBooth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl border border-line bg-surface text-fg text-sm shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand/25"
            >
              <option value="all">All Booths (Distribute equally)</option>
              {(metrics?.booths || []).map((b) => (
                <option key={b.booth_number} value={b.booth_number}>
                  {b.booth_id} (Currently at {b.current_voting_id})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-fg">Number of Slips to Generate</label>
            <input
              type="number"
              min={1}
              max={1000}
              value={slipCount}
              onChange={(e) => setSlipCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full px-3 py-2 rounded-xl border border-line bg-surface text-fg text-sm shadow-2xs focus:outline-none focus:ring-2 focus:ring-brand/25"
              required
            />
            <p className="text-[11px] text-muted">{getPreviewRange()}</p>
          </div>

          <div className="p-3 rounded-xl bg-recessed/60 border border-line text-xs text-muted space-y-1">
            <p className="font-bold text-fg">Secret Ballot Architecture:</p>
            <p>• IDs will be generated sequentially (e.g. 1001, 1002...).</p>
            <p>• PINs are 4 digits and verified via salted hash.</p>
            <p>• Plaintext PINs are only used to render downloadable A4 PDFs.</p>
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
              {generating ? 'Generating…' : 'Generate Slips Batch'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default VoterSlipsManager;
