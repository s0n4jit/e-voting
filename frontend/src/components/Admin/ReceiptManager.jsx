import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckBadgeIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  XMarkIcon,
  TicketIcon,
  DocumentTextIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import adminApi from '../../api/adminApi';
import LoadingSpinner from '../common/LoadingSpinner';

const ReceiptManager = () => {
  const [tab, setTab] = useState('live'); // 'live' | 'mock'
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [receipts, setReceipts] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [liveCount, setLiveCount] = useState(0);
  const [mockCount, setMockCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastSyncTime, setLastSyncTime] = useState(new Date());

  // Modal preview state
  const [previewSlip, setPreviewSlip] = useState(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  // Bulk action states
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [clearingMock, setClearingMock] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const fetchReceipts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const data = await adminApi.getReceipts({
        is_mock: tab === 'mock',
        search: search.trim() || undefined,
        page,
        per_page: 25,
      });
      setReceipts(data.items || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
      setLiveCount(data.live_count || 0);
      setMockCount(data.mock_count || 0);
      setLastSyncTime(new Date());
    } catch (err) {
      if (!silent) {
        setError(err?.response?.data?.message || 'Could not load receipts from the server.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [tab, search, page]);

  // Initial load
  useEffect(() => {
    fetchReceipts(false);
  }, [fetchReceipts]);

  // Real-time polling: automatically sync receipts every 3 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !previewSlip && !confirmClearOpen) {
        fetchReceipts(true);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [fetchReceipts, previewSlip, confirmClearOpen]);

  const handleTabChange = (nextTab) => {
    if (nextTab === tab) return;
    setTab(nextTab);
    setPage(1);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchReceipts(false);
  };

  const openPreview = async (slipId) => {
    setPreviewSlip(slipId);
    setPreviewLoading(true);
    setPreviewHtml('');
    try {
      const res = await fetch(`/api/officer/receipts/${encodeURIComponent(slipId)}/html`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('access_token') || ''}`,
        },
      });
      if (!res.ok) throw new Error('Receipt preview unavailable');
      const html = await res.text();
      setPreviewHtml(html);
    } catch {
      setPreviewHtml('<div style="padding: 30px; text-align: center; color: #ef4444; font-family: sans-serif;">Failed to load receipt preview from server.</div>');
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewSlip(null);
    setPreviewHtml('');
  };

  const downloadPdf = async (slipId) => {
    try {
      const blob = await adminApi.downloadReceiptPdf(slipId);
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `voter-receipt-${slipId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      alert('Could not download PDF from the server.');
    }
  };

  const downloadZip = async () => {
    setDownloadingZip(true);
    try {
      const blob = await adminApi.downloadReceiptsZip({ is_mock: tab === 'mock' });
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `voter-receipts-${tab === 'mock' ? 'mock' : 'official'}-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      alert('Failed to generate ZIP archive of receipts.');
    } finally {
      setDownloadingZip(false);
    }
  };

  const clearMockData = async () => {
    setClearingMock(true);
    try {
      await adminApi.clearMockReceipts();
      setConfirmClearOpen(false);
      setPage(1);
      await fetchReceipts(false);
    } catch {
      alert('Failed to clear mock receipts.');
    } finally {
      setClearingMock(false);
    }
  };

  return (
    <div className="space-y-6 text-fg">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-line">
        <div>
          <h2 className="text-2xl font-black text-fg tracking-tight flex items-center gap-2">
            <CheckBadgeIcon className="w-7 h-7 text-brand" />
            Vote Receipts & Audit
          </h2>
          <p className="text-xs text-muted mt-1">
            Centrally stored voter receipts received in real-time from all voting booth terminals.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => fetchReceipts(false)}
            className="p-2.5 rounded-xl border border-line bg-surface hover:bg-recessed text-fg transition-colors shadow-2xs"
            title="Refresh receipts now"
          >
            <ArrowPathIcon className="w-4 h-4" />
          </button>

          <button
            type="button"
            disabled={downloadingZip || total === 0}
            onClick={downloadZip}
            className="px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-40 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            <span>{downloadingZip ? 'Building ZIP...' : `Download ${tab === 'mock' ? 'Mock' : 'Live'} ZIP (${total})`}</span>
          </button>

          {tab === 'mock' && mockCount > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClearOpen(true)}
              className="px-3.5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs"
            >
              <TrashIcon className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Clear Mock Receipts</span>
            </button>
          )}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="p-4 rounded-2xl bg-surface border border-line shadow-card flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Total Stored Receipts</p>
            <p className="text-2xl font-black text-fg mt-1">{liveCount + mockCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-recessed text-muted flex items-center justify-center">
            <DocumentTextIcon className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface border border-line shadow-card flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand">Official Live Receipts</p>
            <p className="text-2xl font-black text-brand mt-1">{liveCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand-fg flex items-center justify-center">
            <CheckBadgeIcon className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface border border-line shadow-card flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-warn">Mock Election Receipts</p>
            <p className="text-2xl font-black text-warn mt-1">{mockCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-warn-soft text-warn flex items-center justify-center">
            <TicketIcon className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Tabs & Search Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleTabChange('live')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              tab === 'live'
                ? 'bg-brand text-white shadow-sm'
                : 'bg-surface text-muted border border-line hover:bg-recessed hover:text-fg'
            }`}
          >
            <span>Official Live Receipts</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${tab === 'live' ? 'bg-white/20 text-white' : 'bg-recessed text-muted'}`}>
              {liveCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('mock')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              tab === 'mock'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-surface text-muted border border-line hover:bg-recessed hover:text-fg'
            }`}
          >
            <span>Mock Election Receipts</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${tab === 'mock' ? 'bg-white/20 text-white' : 'bg-recessed text-muted'}`}>
              {mockCount}
            </span>
          </button>
        </div>

        <form onSubmit={handleSearchSubmit} className="relative sm:w-72">
          <MagnifyingGlassIcon className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Slip ID or Booth..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-line bg-surface text-fg text-xs shadow-2xs placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
          />
        </form>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-bad-soft border border-bad/30 text-bad text-xs font-medium">
          {error}
        </div>
      )}

      {/* Receipts Table */}
      <div className="bg-surface border border-line rounded-2xl shadow-card overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <LoadingSpinner size="lg" />
          </div>
        ) : receipts.length === 0 ? (
          <div className="p-14 text-center text-muted">
            <CheckBadgeIcon className="w-10 h-10 mx-auto text-muted/50 mb-2" />
            <p className="text-sm font-bold text-fg">No {tab === 'mock' ? 'mock' : 'official'} receipts stored on the server yet.</p>
            <p className="text-xs text-muted mt-1 max-w-md mx-auto">
              When voters cast ballots at the booth terminals, their exact receipts and vector PDFs are automatically transmitted to this central server in real-time.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-fg">
              <thead className="bg-recessed/60 border-b border-line text-[11px] font-bold uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-5 py-3.5">Voter Slip ID</th>
                  <th className="px-5 py-3.5">Voting Terminal / Booth</th>
                  <th className="px-5 py-3.5">Timestamp (UTC)</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line font-medium">
                {receipts.map((r) => (
                  <tr key={r.id || r.slip_id} className="hover:bg-recessed/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="font-mono font-bold text-xs bg-recessed text-fg px-2.5 py-1 rounded-md border border-line shadow-2xs">
                        {r.slip_id}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-fg font-semibold">{r.booth_name || 'Booth'}</td>
                    <td className="px-5 py-3.5 text-muted text-xs font-mono">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openPreview(r.slip_id)}
                          className="px-2.5 py-1.5 rounded-xl border border-line bg-surface hover:bg-recessed text-fg text-xs font-bold shadow-2xs flex items-center gap-1 transition-colors"
                          title="View receipt slip"
                        >
                          <EyeIcon className="w-3.5 h-3.5 text-muted" />
                          <span>View</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadPdf(r.slip_id)}
                          className="px-2.5 py-1.5 rounded-xl border border-line bg-surface hover:bg-recessed text-fg text-xs font-bold shadow-2xs flex items-center gap-1 transition-colors"
                          title="Download vector PDF"
                        >
                          <ArrowDownTrayIcon className="w-3.5 h-3.5 text-muted" />
                          <span>PDF</span>
                        </button>
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
              Showing page <strong>{page}</strong> of <strong>{pages}</strong> ({total} total receipts)
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

      {/* Receipt Preview Modal */}
      {previewSlip && createPortal(
        <div className="no-flip fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full flex flex-col max-h-[94vh] overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/90">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-900/50">
                  <TicketIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm">Voter Receipt Slip</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-200/60 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                      {previewSlip}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadPdf(previewSlip)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-bold shadow-sm transition-all"
                >
                  <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
                <button
                  type="button"
                  onClick={closePreview}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-slate-100/90 dark:bg-slate-950 flex justify-center items-start">
              {previewLoading ? (
                <div className="p-16 flex flex-col items-center justify-center">
                  <LoadingSpinner size="md" />
                  <p className="text-xs text-slate-500 font-medium mt-3">Rendering vector receipt...</p>
                </div>
              ) : (
                <iframe
                  title="Receipt Preview"
                  srcDoc={previewHtml}
                  className="w-[130mm] max-w-full h-[610px] border-0 bg-transparent"
                />
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirm Clear Mock Modal */}
      {confirmClearOpen && createPortal(
        <div className="no-flip fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface border border-amber-300 dark:border-amber-800/80 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-warn-soft text-warn flex items-center justify-center mb-3 border border-amber-200 dark:border-amber-800/50">
              <TrashIcon className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-fg">
              Clear Mock Election Receipts?
            </h3>
            <p className="text-xs text-muted mt-2 leading-relaxed">
              This will permanently delete all <strong>{mockCount}</strong> mock slips and PDF files stored on the server.
              Official live election receipts will NOT be touched.
            </p>
            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmClearOpen(false)}
                className="px-4 py-2 rounded-xl border border-line bg-surface text-fg text-xs font-bold hover:bg-recessed shadow-2xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={clearingMock}
                onClick={clearMockData}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors shadow-sm"
              >
                {clearingMock ? 'Clearing...' : 'Yes, Delete Mock Receipts'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ReceiptManager;
