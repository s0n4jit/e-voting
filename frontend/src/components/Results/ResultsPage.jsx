import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelectedElection } from '../../hooks/useSelectedElection';
import { toast } from 'react-hot-toast';
import { ClipboardDocumentIcon, EyeIcon, EyeSlashIcon, LinkIcon, PresentationChartBarIcon, TrashIcon } from '@heroicons/react/24/outline';
import { resultsApi } from '../../api/resultsApi';
import { ElectionPicker, EmptyState, errorMessage } from '../ui';
import { usePolling } from '../../hooks/usePolling';
import LoadingSpinner from '../common/LoadingSpinner';
import Modal from '../common/Modal';
import ResultsView from './ResultsView';

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
  usePolling(load, 5000);

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

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <ElectionPicker elections={elections} value={electionId} onChange={select} />
        <span />
        {data.locked ? (
          <button className="btn-primary" disabled title="Available after the results are published">
            <PresentationChartBarIcon className="w-4 h-4" /> Present on projector
          </button>
        ) : (
          <Link to={`/admin/results/${electionId}/present`} className="btn-primary" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>
            <PresentationChartBarIcon className="w-4 h-4" /> Present on projector
          </Link>
        )}
      </div>

      <div className="card card-body mb-8">
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
      </div>

      <Modal isOpen={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete the public link?">
        <p className="text-sm text-muted">The link stops working immediately. You can create a new one later; it will be a different address.</p>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
          <button className="btn-danger" onClick={removeLink}>Delete link</button>
        </div>
      </Modal>

      <div className="card card-body mb-8">
        <p className="font-medium">{data.locked ? 'Results are locked' : 'Results are hidden here'}</p>
        <p className="text-sm text-muted mt-1">
          {data.locked ? (
            data.voting_over
              ? 'Voting has closed. Publish the results on the Elections page to unlock the projector reveal, the report and the public link.'
              : 'Voting is still in progress. Results stay hidden, for everyone, until voting has closed and you publish them.'
          ) : (
            <>So the surprise is kept for the announcement, only the turnout is shown. Use <strong>Present on projector</strong> to reveal the {data.by_position.length} positions one at a time.</>
          )}
        </p>
        <p className="text-sm mt-3">{data.turnout.ballots_cast} of {data.turnout.total_registered} registered voters have voted ({data.turnout.turnout_percentage}% turnout).</p>
        <ol className="mt-4 grid sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm list-decimal pl-5">
          {data.by_position.map((p) => <li key={p.position}>{p.position}</li>)}
        </ol>
        {data.locked ? null : !showAll ? (
          <button className="btn-ghost btn-sm mt-4 w-fit" onClick={() => setConfirmShow(true)}>
            <EyeIcon className="w-4 h-4" /> Show full results on this screen
          </button>
        ) : (
          <button className="btn-ghost btn-sm mt-4 w-fit" onClick={() => setShowAll(false)}>
            <EyeSlashIcon className="w-4 h-4" /> Hide results
          </button>
        )}
      </div>

      <Modal isOpen={confirmShow} onClose={() => setConfirmShow(false)} title="Show the full results?">
        <p className="text-sm text-muted">Anyone who can see this screen will see every winner and vote count.</p>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-ghost" onClick={() => setConfirmShow(false)}>Cancel</button>
          <button className="btn-primary" onClick={() => { setShowAll(true); setConfirmShow(false); }}>Show results</button>
        </div>
      </Modal>

      {showAll && !data.locked && <ResultsView data={data} />}
    </div>
  );
};

export default ResultsPage;
