import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelectedElection } from '../../hooks/useSelectedElection';
import { toast } from 'react-hot-toast';
import { ClipboardDocumentIcon, EyeIcon, EyeSlashIcon, LinkIcon, LockClosedIcon, PresentationChartBarIcon, PrinterIcon, TrashIcon } from '@heroicons/react/24/outline';
import { resultsApi } from '../../api/resultsApi';
import { ElectionPicker, EmptyState, errorMessage } from '../ui';
import { usePolling } from '../../hooks/usePolling';
import LoadingSpinner from '../common/LoadingSpinner';
import Modal from '../common/Modal';
import PrintPortal from '../common/PrintPortal';
import PrintableResults from './PrintableResults';
import ResultsView from './ResultsView';
import { safeFileName, triggerPrintWithTitle } from '../../api/deskApi';

/** Results inside the officer workspace: live counts, and the public link once published. */
export const ResultsPage = () => {
  const { elections, electionId, select } = useSelectedElection();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [confirmShow, setConfirmShow] = useState(false);

  const load = useCallback(() => {
    if (!electionId) return;
    resultsApi.adminResults(electionId).then((d) => { setData(d); setError(''); }).catch((e) => setError(errorMessage(e)));
  }, [electionId]);

  useEffect(() => {
    setData(null);
    setShowAll(false);
    load();
  }, [load]);
  usePolling(load, 2000);

  if (elections && elections.length === 0) {
    return <div className="card"><EmptyState title="No elections yet">Results appear here once an election has run.</EmptyState></div>;
  }
  if (error && !data) return <p className="text-bad">{error}</p>;
  if (!data) return <LoadingSpinner size="lg" />;

  const createLink = async () => {
    setBusy(true);
    try {
      await resultsApi.createPublicLink(electionId);
      toast.success('Public link created');
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const removeLink = async () => {
    try {
      await resultsApi.deletePublicLink(electionId);
      toast.success('Public link deleted');
      setConfirmDelete(false);
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const link = data.public_path ? `${window.location.origin}${data.public_path}` : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copied');
    } catch {
      toast.error('Copy failed. Select the link and copy it manually.');
    }
  };

  const activeMock = (elections || []).find((e) => e.is_mock && e.status !== 'archived');

  const state = data.mock
    ? (data.locked ? 'Mock Voting' : 'Mock Results')
    : data.published
    ? 'Published'
    : data.status_label || (data.status ? data.status.replace('_', ' ').toUpperCase() : (data.locked ? 'Locked' : 'Ready'));

  return (
    <div className="space-y-6">
      {data.mock && (
        <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase bg-amber-200 text-amber-900 border border-amber-300 dark:bg-amber-500/25 dark:text-amber-300 dark:border-amber-500/40">
              {data.locked ? 'Mock Election Dry Run' : 'Mock Election Results'}
            </span>
            <span className="text-xs sm:text-sm font-semibold">
              {data.locked
                ? 'Mock dry run is live. Test vote counts remain sealed during voting and will be revealed when results are published.'
                : 'Dry run complete. Below is the test turnout, winner calculations, and test vote counts.'}
            </span>
          </div>
        </div>
      )}

      {activeMock && !data.mock && (
        <div className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/40 flex items-center justify-between gap-3 text-xs sm:text-sm shadow-xs">
          <div className="flex items-center gap-2 text-amber-950 dark:text-amber-200">
            <span className="font-bold">Active Mock Run:</span>
            <span>A mock dry run is in progress. View simulated ballots and live tallies.</span>
          </div>
          <button
            type="button"
            onClick={() => select(activeMock.id)}
            className="btn-secondary btn-sm shrink-0 font-semibold bg-white text-amber-950 border-amber-300 hover:bg-amber-100 dark:bg-amber-500/20 dark:text-white"
          >
            Switch to Mock Results
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ElectionPicker elections={elections} value={electionId} onChange={select} />
          <span className="badge badge-brand">{state}</span>
        </div>
        {data.locked ? (
          <button className="btn-secondary" disabled title="Available after the results are published">
            <PresentationChartBarIcon className="w-4 h-4" /> Present on projector
          </button>
        ) : (
          <Link to={`/admin/results/${electionId}/present`} className="btn-secondary" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>
            <PresentationChartBarIcon className="w-4 h-4" /> Present on projector
          </Link>
        )}
      </div>

      {data.locked ? (
        <section className="card card-body space-y-4">
          <div className="flex items-center gap-3">
            <LockClosedIcon className="w-6 h-6 text-muted" />
            <h2 className="font-semibold text-lg">
              {['setup', 'registration', 'ready'].includes(data.status)
                ? 'Voting Has Not Started'
                : data.voting_over
                ? (data.mock ? 'Mock Voting Closed' : 'Voting Closed')
                : (data.mock ? 'Mock Voting Active' : 'Official Voting Active')}
            </h2>
          </div>
          <p className="text-sm text-muted">
            {['setup', 'registration', 'ready'].includes(data.status)
              ? `This election is currently in the ${data.status_label || 'Setup'} stage. Voting has not opened yet. Results, candidate vote counts, and winner determinations will become available once voting is conducted and closed.`
              : data.voting_over
              ? (data.mock
                  ? 'Mock voting has closed. Publish mock results on the Elections page to reveal winner declarations, present on the projector, and print the test result sheet.'
                  : 'Voting has closed. Turnout has been finalized. Publish the results on the Elections page to reveal winner declarations, present on the projector, and print the result sheet.')
              : (data.mock
                  ? 'Mock voting is currently live at the booth terminals. Candidate vote counts and winner tallies remain securely sealed until mock voting is closed and results are published.'
                  : 'Official voting is currently live at the booth terminals. Candidate vote counts and winner tallies remain securely sealed until voting is closed and results are published.')}
          </p>
          <p className="text-sm font-medium">
            <strong>{data.turnout.ballots_cast}</strong> of {data.turnout.total_registered} voter slips cast
            {data.turnout.total_registered > 0 ? ` (${data.turnout.turnout_percentage}% turnout)` : ''}.
          </p>
          <ol className="grid sm:grid-cols-2 gap-x-8 gap-y-1 text-sm list-decimal pl-5 text-muted">
            {data.by_position.map((p) => <li key={p.position}>{p.position}</li>)}
          </ol>
        </section>
      ) : (
        <>
          <section className="card card-body flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <h2 className="font-semibold">{data.mock ? 'Live results of the mock election' : 'The result sheet is ready'}</h2>
              <p className="text-sm text-muted mt-1">
                Print it on the college letterhead (with the logo), or open it on this screen. Counts are shown as numbers of votes, with NOTA in every position.
              </p>
              <p className="text-sm mt-2"><strong>{data.turnout.ballots_cast}</strong> of {data.turnout.total_registered} voter slips cast{data.turnout.total_registered > 0 ? ` (${data.turnout.turnout_percentage}% turnout)` : ''}.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!showAll && (
                <button
                  className="btn-primary btn-lg"
                  onClick={() =>
                    triggerPrintWithTitle(
                      `election-results-${safeFileName(data.election?.title || 'election')}-${new Date().toISOString().slice(0, 10)}`
                    )
                  }
                >
                  <PrinterIcon className="w-5 h-5" /> Print result sheet
                </button>
              )}
              {!showAll ? (
                <button className="btn-secondary btn-lg" onClick={() => setConfirmShow(true)}>
                  <EyeIcon className="w-5 h-5" /> Show on this screen
                </button>
              ) : (
                <button className="btn-secondary btn-lg" onClick={() => setShowAll(false)}>
                  <EyeSlashIcon className="w-5 h-5" /> Hide
                </button>
              )}
            </div>
          </section>
          {showAll && <ResultsView data={data} portal={false} />}
          <PrintPortal><PrintableResults data={data} /></PrintPortal>
        </>
      )}

      <section className="card card-body">
        <p className="font-medium">Public link</p>
        {link ? (
          <>
            <p className="text-sm text-muted mt-1">Anyone with this link can view the results, without signing in. Delete it to make the results private again.</p>
            <div className="flex flex-col sm:flex-row gap-2 mt-3">
              <input className="input font-mono text-xs" readOnly value={link} aria-label="Public results link" onFocus={(e) => e.target.select()} />
              <button className="btn-secondary shrink-0" onClick={copy}><ClipboardDocumentIcon className="w-4 h-4" /> Copy</button>
              <a className="btn-secondary shrink-0" href={link} target="_blank" rel="noopener noreferrer">Open</a>
              <button className="btn-danger shrink-0" onClick={() => setConfirmDelete(true)}><TrashIcon className="w-4 h-4" /> Delete link</button>
            </div>
          </>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-1">
            <p className="text-sm text-muted">
              {data.published
                ? 'The results are visible only to you. After the projector reveal, create a link to share them publicly.'
                : 'A public link can be created after the results are published.'}
            </p>
            <button className="btn-primary shrink-0" onClick={createLink} disabled={!data.published || busy}>
              <LinkIcon className="w-4 h-4" /> Create public link
            </button>
          </div>
        )}
      </section>

      <Modal isOpen={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete the public link?">
        <p className="text-sm text-muted">The link stops working immediately. You can create a new one later; it will be a different address.</p>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
          <button className="btn-danger" onClick={removeLink}>Delete link</button>
        </div>
      </Modal>

      <Modal isOpen={confirmShow} onClose={() => setConfirmShow(false)} title="Show the full results?">
        <p className="text-sm text-muted">Anyone who can see this screen will see every winner and vote count.</p>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-ghost" onClick={() => setConfirmShow(false)}>Cancel</button>
          <button className="btn-primary" onClick={() => { setShowAll(true); setConfirmShow(false); }}>Show results</button>
        </div>
      </Modal>
    </div>
  );
};

export default ResultsPage;
