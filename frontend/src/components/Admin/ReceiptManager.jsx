import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckBadgeIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  PrinterIcon,
  TrashIcon,
  XMarkIcon,
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

  // Modal preview state
  const [previewSlip, setPreviewSlip] = useState(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  // Bulk action states
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [clearingMock, setClearingMock] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const fetchReceipts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminApi.getReceipts({
        is_mock: tab === 'mock',
        search: search.trim() || undefined,
        page,
        per_page: 20,
      });
      setReceipts(data.items || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
      setLiveCount(data.live_count || 0);
      setMockCount(data.mock_count || 0);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load receipts from the server.');
    } finally {
      setLoading(false);
    }
  }, [tab, search, page]);

  useEffect(() => {
    fetchReceipts();
  }, [fetchReceipts]);

  const handleTabChange = (nextTab) => {
    if (nextTab === tab) return;
    setTab(nextTab);
    setPage(1);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchReceipts();
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
      setPreviewHtml('<p style="padding: 20px; color: red;">Failed to load receipt preview.</p>');
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
      a.download = `${slipId}.pdf`;
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
      a.download = tab === 'mock' ? 'mock_election_receipts.zip' : 'official_election_receipts.zip';
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
      await fetchReceipts();
    } catch {
      alert('Failed to clear mock receipts.');
    } finally {
      setClearingMock(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <CheckBadgeIcon className="w-7 h-7 text-indigo-400" />
            Vote Receipts & Audit
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Centralized server archive of voter slips. View individual receipts, download vector PDFs, or export bulk ZIPs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchReceipts}
            className="p-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300"
            title="Refresh list"
          >
            <ArrowPathIcon className="w-5 h-5" />
          </button>
          <button
            type="button"
            disabled={downloadingZip || total === 0}
            onClick={downloadZip}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-sm transition-colors shadow-sm"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            {downloadingZip ? 'Building ZIP...' : `Download ${tab === 'mock' ? 'Mock' : 'Live'} ZIP (${total})`}
          </button>
          {tab === 'mock' && mockCount > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClearOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-medium text-sm transition-colors"
            >
              <TrashIcon className="w-4 h-4" />
              Clear Mock
            </button>
          )}
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleTabChange('live')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
              tab === 'live'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Official Live Receipts
            <span className="px-2 py-0.5 rounded-full text-xs bg-black/20">{liveCount}</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('mock')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
              tab === 'mock'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Mock Election Receipts
            <span className="px-2 py-0.5 rounded-full text-xs bg-black/20">{mockCount}</span>
          </button>
        </div>

        <form onSubmit={handleSearchSubmit} className="relative sm:w-72">
          <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Slip ID or Booth..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
          />
        </form>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-900/30 border border-red-700/50 text-red-200 text-sm">
          {error}
        </div>
      )}

      {/* Receipts Table */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <LoadingSpinner size="lg" />
          </div>
        ) : receipts.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <p className="text-base font-medium">No {tab === 'mock' ? 'mock' : 'official'} receipts stored on the server yet.</p>
            <p className="text-sm mt-1 text-slate-500">
              When voters cast ballots at the booth, their receipts are archived directly to the central server.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-800/80 text-xs uppercase font-semibold text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3">Voter Slip ID</th>
                  <th className="px-5 py-3">Terminal / Booth</th>
                  <th className="px-5 py-3">Cast Time (UTC)</th>
                  <th className="px-5 py-3">Contested Choices</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {receipts.map((r) => (
                  <tr key={r.id || r.slip_id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-white font-bold bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                        {r.slip_id}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-300">{r.booth_name || 'Booth'}</td>
                    <td className="px-5 py-3.5 text-slate-400 text-xs">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-slate-300">
                        {r.choices?.length || 0} position(s) voted
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openPreview(r.slip_id)}
                          className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                          title="View receipt"
                        >
                          <EyeIcon className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadPdf(r.slip_id)}
                          className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                          title="Download PDF"
                        >
                          <ArrowDownTrayIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="px-5 py-3.5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 bg-slate-900/80">
            <span>
              Showing page {page} of {pages} ({total} total receipts)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewSlip && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full flex flex-col max-h-[92vh] overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white text-base">Receipt Preview</h3>
                <p className="font-mono text-xs text-slate-400">{previewSlip}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadPdf(previewSlip)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                >
                  <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                  PDF
                </button>
                <button
                  type="button"
                  onClick={closePreview}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-slate-950 flex justify-center">
              {previewLoading ? (
                <div className="p-12">
                  <LoadingSpinner size="md" />
                </div>
              ) : (
                <iframe
                  title="Receipt Preview"
                  srcDoc={previewHtml}
                  className="w-full min-h-[520px] bg-white rounded-lg shadow"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Clear Mock Modal */}
      {confirmClearOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-600/40 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <TrashIcon className="w-5 h-5 text-amber-500" />
              Clear Mock Election Receipts?
            </h3>
            <p className="text-sm text-slate-300 mt-2">
              This will permanently delete all {mockCount} mock election receipt files and records stored on the server.
              Official live election receipts will NOT be affected.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmClearOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 text-sm font-medium hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={clearingMock}
                onClick={clearMockData}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition-colors"
              >
                {clearingMock ? 'Clearing...' : 'Yes, Delete Mock Receipts'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceiptManager;
