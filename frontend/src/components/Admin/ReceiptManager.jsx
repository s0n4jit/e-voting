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
  PrinterIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { API_BASE_URL } from '../../api/axiosConfig';
import adminApi from '../../api/adminApi';
import { usePolling } from '../../hooks/usePolling';
import LoadingSpinner from '../common/LoadingSpinner';

const ReceiptManager = () => {
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [page, setPage] = useState(1);
  const [receipts, setReceipts] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [unprintedCount, setUnprintedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastSyncTime, setLastSyncTime] = useState(new Date());
  const reqIdRef = useRef(0);

  // Modal preview state
  const [previewSlip, setPreviewSlip] = useState(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  // Bulk action states
  const [downloadingZip, setDownloadingZip] = useState(false);

  // Debounce search input so typing is smooth and does not trigger rapid network thrashing
  useEffect(() => {
    const timer = setTimeout(() => {
      setActiveSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchReceipts = useCallback(async (silent = false) => {
    const reqId = ++reqIdRef.current;
    if (!silent && receipts.length === 0) setLoading(true);
    setError('');
    try {
      const data = await adminApi.getReceipts({
        search: activeSearch || undefined,
        page,
        per_page: 25,
      });
      if (reqId !== reqIdRef.current) return;
      setReceipts(data.items || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
      setUnprintedCount(data.unprinted_count || 0);
      setLastSyncTime(new Date());
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      if (!silent) {
        setError(err?.response?.data?.message || 'Could not load receipts from the server.');
      }
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [activeSearch, page, receipts.length]);

  // Initial load and refetch on search / page changes
  useEffect(() => {
    fetchReceipts(false);
  }, [fetchReceipts]);

  // Real-time polling: automatically sync receipts every 3 seconds
  usePolling(() => {
    if (!previewSlip) {
      fetchReceipts(true);
    }
  }, 3000);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setActiveSearch(searchInput.trim());
    setPage(1);
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setActiveSearch('');
    setPage(1);
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


  const printRemoteReceipt = async (r) => {
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      iframe.src = `${API_BASE_URL}/officer/receipts/${encodeURIComponent(r.slip_id)}/html`;
      iframe.onload = () => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch (_) {}
        setTimeout(() => {
          if (iframe.parentNode) document.body.removeChild(iframe);
        }, 30000);
      };

      await adminApi.markReceiptPrinted(r.slip_id);
      fetchReceipts(true);
    } catch (e) {
      console.warn('Remote print trigger notice:', e);
    }
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
      const blob = await adminApi.downloadReceiptsZip({});
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `voter-receipts-${new Date().toISOString().slice(0, 10)}.zip`;
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

  return (
    <div className="space-y-6 text-fg">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-line">
        <div>
          <h2 className="text-2xl font-black text-fg tracking-tight flex items-center gap-2">
            <CheckBadgeIcon className="w-7 h-7 text-brand" />
            Vote Receipts
          </h2>
          <p className="text-xs text-muted mt-1">
            Centrally stored anonymous vote receipts archived in real-time from the ballot box.
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
            className="px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-2xs transition-all disabled:cursor-not-allowed bg-brand hover:bg-brand-hover text-white disabled:bg-recessed disabled:text-muted disabled:border disabled:border-line"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            <span>{downloadingZip ? 'Building ZIP...' : `Download Receipts ZIP (${total})`}</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="p-4 rounded-2xl bg-surface border border-line shadow-card flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Total Stored Receipts</p>
            <p className="text-2xl font-black text-fg mt-1">{total}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-recessed text-muted flex items-center justify-center">
            <DocumentTextIcon className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface border border-line shadow-card flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-ok">Printed Receipts</p>
            <p className="text-2xl font-black text-ok mt-1">{Math.max(0, total - unprintedCount)}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-ok-soft text-ok flex items-center justify-center">
            <CheckCircleIcon className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface border border-line shadow-card flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-bad">Missed Physical Prints</p>
            <p className="text-2xl font-black text-bad mt-1">{unprintedCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-bad-soft text-bad flex items-center justify-center">
            <ExclamationTriangleIcon className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="text-xs text-muted font-medium">
          Official VVPAT paper slips and vectors archived for certified recount and auditing.
        </div>

        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 sm:w-80">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by Ballot Ref (e.g. VOTE-A1B2C3)..."
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-line bg-surface text-fg text-xs shadow-2xs placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
            {searchInput && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-muted hover:text-fg rounded-md transition"
                title="Clear search"
              >
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="btn-secondary btn-sm px-3 py-2 text-xs font-semibold shrink-0"
            title="Search receipts"
          >
            Search
          </button>
        </form>
      </div>

      {unprintedCount > 0 && (
        <div className="p-4 rounded-2xl bg-bad-soft border border-bad/30 flex items-center justify-between gap-4 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-bad text-white flex items-center justify-center shrink-0 shadow-2xs">
              <ExclamationTriangleIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-bad">Attention: {unprintedCount} vote receipt(s) missed physical printing.</p>
              <p className="text-[11px] text-muted mt-0.5">Choices are fully archived in the server database. Click &ldquo;Print&rdquo; on any missed receipt below to output it remotely from this desk.</p>
            </div>
          </div>
        </div>
      )}

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
            <p className="text-sm font-bold text-fg">
              {activeSearch
                ? `No receipts match "${activeSearch}"`
                : 'No vote receipts stored on the server yet.'}
            </p>
            <p className="text-xs text-muted mt-1 max-w-md mx-auto">
              {activeSearch
                ? 'Try searching by a different Ballot Ref or candidate choice.'
                : 'When voters cast anonymous ballots, their exact receipts and vector PDFs are archived here for certified recount and auditing.'}
            </p>
            {activeSearch && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="mt-4 px-3.5 py-1.5 rounded-xl border border-line bg-surface hover:bg-recessed text-xs font-bold text-fg transition shadow-2xs"
              >
                Clear Search Filter
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-fg">
              <thead className="bg-recessed/60 border-b border-line text-[11px] font-bold uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-5 py-3.5">Ballot Ref</th>
                  <th className="px-5 py-3.5">Archive Box</th>
                  <th className="px-5 py-3.5">Print Status</th>
                  <th className="px-5 py-3.5">Date</th>
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
                    <td className="px-5 py-3.5 text-fg font-semibold">{r.booth_name || 'Ballot Box'}</td>
                    <td className="px-5 py-3.5">
                      {!r.is_printed ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-bad-soft text-bad border border-bad/30" title={r.print_error || 'Printing failed at booth machine'}>
                          <ExclamationTriangleIcon className="w-3.5 h-3.5 shrink-0" />
                          <span>Missed Print</span>
                        </span>
                      ) : r.reprinted_at ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-brand-soft text-brand-fg border border-brand/20" title={`Reprinted remotely at ${new Date(r.reprinted_at).toLocaleTimeString()}`}>
                          <PrinterIcon className="w-3.5 h-3.5 shrink-0" />
                          <span>Reprinted</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-ok-soft text-ok border border-ok/20">
                          <CheckCircleIcon className="w-3.5 h-3.5 shrink-0" />
                          <span>Printed</span>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-muted text-xs font-mono">
                      {new Date(r.created_at).toLocaleDateString()}
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
                          onClick={() => printRemoteReceipt(r)}
                          className="px-2.5 py-1.5 rounded-xl border border-line bg-surface hover:bg-recessed text-brand-fg hover:text-brand text-xs font-bold shadow-2xs flex items-center gap-1 transition-colors"
                          title="Print this receipt remotely from admin panel"
                        >
                          <PrinterIcon className="w-3.5 h-3.5" />
                          <span>Print</span>
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
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
          <div className="bg-surface border border-line rounded-2xl max-w-lg w-full flex flex-col max-h-[94vh] overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-line flex items-center justify-between bg-recessed/60">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-brand-soft text-brand-fg flex items-center justify-center border border-brand/20">
                  <TicketIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-fg text-sm">Ballot Receipt</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="font-mono text-xs font-bold text-muted bg-recessed px-2 py-0.5 rounded-md border border-line">
                      {previewSlip}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadPdf(previewSlip)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold shadow-sm transition-all"
                >
                  <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
                <button
                  type="button"
                  onClick={closePreview}
                  className="p-1.5 rounded-xl text-muted hover:text-fg hover:bg-recessed transition-colors"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-recessed/30 flex justify-center items-start">
              {previewLoading ? (
                <div className="p-16 flex flex-col items-center justify-center">
                  <LoadingSpinner size="md" />
                  <p className="text-xs text-muted font-medium mt-3">Rendering vector receipt...</p>
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
    </div>
  );
};

export default ReceiptManager;
