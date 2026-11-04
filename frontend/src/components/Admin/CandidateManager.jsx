import React, { useCallback, useEffect, useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { Link } from 'react-router-dom';
import { useSelectedElection } from '../../hooks/useSelectedElection';
import { toast } from 'react-hot-toast';
import { PlusIcon, TrashIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { adminApi } from '../../api/adminApi';
import { ElectionPicker, EmptyState, Field, PageHeader, TableSkeleton, errorMessage, photoSrc } from '../ui';
import Modal from '../common/Modal';
import ImageCropperModal from '../common/ImageCropperModal';
import StatusBadge from '../common/StatusBadge';

const LOCKED = ['voting_active', 'voting_closed', 'results_published', 'archived'];
const blank = (position = '') => ({ name: '', position, department: '', semester: '', bio: '', photo: null });
const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_PHOTO = 2 * 1024 * 1024;

export const CandidateManager = () => {
  const { elections, electionId, select } = useSelectedElection();
  const [election, setElection] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [photoError, setPhotoError] = useState('');
  const [preview, setPreview] = useState('');
  const [cropperOpen, setCropperOpen] = useState(false);
  const [rawPhotoSrc, setRawPhotoSrc] = useState('');

  const load = useCallback(async () => {
    if (!electionId) return;
    try {
      setElection(await adminApi.getElection(electionId));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, [electionId]);

  useEffect(() => {
    setElection(null);
    load();
    // Programmes removed
    setDepartments([]);
  }, [load]);
  usePolling(() => (electionId ? adminApi.getElection(electionId).then(setElection).catch(() => {}) : null), 4000);

  const locked = election && LOCKED.includes(election.status);
  const positions = election?.positions || [];
  const candidates = election?.candidates || [];

  const save = async (e) => {
    e.preventDefault();
    if (!form.photo) {
      setPhotoError('Upload a photo of the candidate.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await adminApi.addCandidate(electionId, form);
      toast.success('Candidate added');
      setForm(null);
      load();
    } catch (err) {
      setError(errorMessage(err));
      set('photo', null); // the server keeps nothing from a failed save; choose the photo again
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      await adminApi.deleteCandidate(removing.id, electionId);
      toast.success('Candidate removed');
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRemoving(null);
    }
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const pickPhoto = (file) => {
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type) || file.size > MAX_PHOTO) {
      setPhotoError('Use a PNG, JPEG or WebP image up to 2 MB.');
      return;
    }
    setPhotoError('');
    if (rawPhotoSrc) URL.revokeObjectURL(rawPhotoSrc);
    setRawPhotoSrc(URL.createObjectURL(file));
    setCropperOpen(true);
  };

  const handleCropComplete = (croppedFile, previewUrl) => {
    set('photo', croppedFile);
    setPreview(previewUrl);
    setCropperOpen(false);
    if (rawPhotoSrc) URL.revokeObjectURL(rawPhotoSrc);
    setRawPhotoSrc('');
  };

  useEffect(() => {
    if (!form?.photo) return setPreview('');
    const url = URL.createObjectURL(form.photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [form?.photo]);

  return (
    <div>
      <PageHeader
        title="Candidates"
        subtitle={election?.title}
        actions={
          election && (
            <>
              <ElectionPicker elections={elections} value={electionId} onChange={select} />
              <StatusBadge label={election.status_label} />
              <button className="btn-primary" disabled={locked || positions.length === 0} onClick={() => { setError(''); setPhotoError(''); setForm(blank(positions[0])); }}>
                <PlusIcon className="w-4 h-4" /> Add candidate
              </button>
            </>
          )
        }
      />
      {locked && <p className="text-sm text-muted mb-4">Candidates are locked because voting has opened.</p>}

      {elections && elections.length === 0 ? (
        <div className="card"><EmptyState title="No elections yet" action={<Link to="/admin/elections" className="btn-primary">Create an election</Link>}>Create an election first, then add its candidates here.</EmptyState></div>
      ) : !election ? (
        <div className="card"><TableSkeleton rows={4} cols={4} /></div>
      ) : positions.length === 0 ? (
        <div className="card">
          <EmptyState title="No positions yet" action={<Link to="/admin/elections" className="btn-primary">Add positions</Link>}>
            Add the positions voters will choose between, then add candidates to each.
          </EmptyState>
        </div>
      ) : (
        <div className="space-y-4">
          {positions.map((pos) => {
            const list = candidates.filter((c) => c.position === pos);
            return (
              <section key={pos} className="card">
                <div className="px-5 py-3 border-b border-line flex items-center justify-between">
                  <h2 className="font-medium">{pos}</h2>
                  <span className="text-xs text-muted">{list.length} {list.length === 1 ? 'candidate' : 'candidates'}</span>
                </div>
                {list.length === 0 ? (
                  <EmptyState icon={UserGroupIcon} title="No candidates">
                    Voting cannot open until this position has at least one candidate.
                  </EmptyState>
                ) : (
                  <ul className="divide-y divide-line">
                    {list.map((c) => (
                      <li key={c.id} className="flex items-center gap-4 px-5 py-3">
                        {c.photo_url ? (
                          <img src={photoSrc(c.photo_url)} alt="" className="w-10 h-10 rounded-lg object-cover bg-recessed" />
                        ) : (
                          <span className="w-10 h-10 rounded-lg bg-brand-soft text-brand-fg font-semibold flex items-center justify-center">{c.name.charAt(0)}</span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{c.name}</p>
                          <p className="text-xs text-muted truncate">{c.department}</p>
                        </div>
                        <button className="btn-ghost btn-sm text-bad" onClick={() => setRemoving(c)} disabled={locked} aria-label={`Remove ${c.name}`}>
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <Modal isOpen={Boolean(form)} onClose={() => setForm(null)} title="Add candidate" maxWidth="max-w-xl">
        {form && (
          <form onSubmit={save} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Full name" htmlFor="c-name">
                <input id="c-name" className="input" required value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
              </Field>
              <Field label="Position" htmlFor="c-pos">
                <select id="c-pos" className="input" value={form.position} onChange={(e) => set('position', e.target.value)}>
                  {positions.map((p) => <option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Department / Stream" htmlFor="c-dept" hint="Optional department or stream (e.g. Political Science, Arts, Science)">
                <input id="c-dept" className="input" placeholder="e.g. Political Science (optional)" value={form.department} onChange={(e) => set('department', e.target.value)} maxLength={100} />
              </Field>
              <Field label="Semester / year" htmlFor="c-sem" hint="Shown on the voting card, e.g. Semester 3.">
                <input id="c-sem" className="input" value={form.semester} onChange={(e) => set('semester', e.target.value)} maxLength={30} />
              </Field>
            </div>
            <Field label="Photo" htmlFor="c-photo" error={photoError} hint="PNG, JPEG or WebP, up to 2 MB.">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-recessed border border-line overflow-hidden flex items-center justify-center shrink-0">
                  {preview ? <img src={preview} alt="Selected photo" className="w-full h-full object-cover" /> : <span className="text-xs text-muted">None</span>}
                </div>
                <label className="btn-secondary btn-sm cursor-pointer">
                  {form.photo ? 'Change photo' : 'Upload photo'}
                  <input id="c-photo" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => pickPhoto(e.target.files?.[0])} />
                </label>
              </div>
            </Field>
            <Field label="Profile (optional)" htmlFor="c-bio">
              <textarea id="c-bio" className="input min-h-[88px]" value={form.bio} onChange={(e) => set('bio', e.target.value)} />
            </Field>
            {error && <p className="error-text" role="alert">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn-primary" disabled={busy}>Add candidate</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={Boolean(removing)} onClose={() => setRemoving(null)} title="Remove candidate">
        <p className="text-sm text-muted">Remove {removing?.name} from this election?</p>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-ghost" onClick={() => setRemoving(null)}>Cancel</button>
          <button className="btn-danger" onClick={remove}>Remove</button>
        </div>
      </Modal>

      <ImageCropperModal
        isOpen={cropperOpen}
        imageSrc={rawPhotoSrc}
        onClose={() => {
          setCropperOpen(false);
          if (rawPhotoSrc) URL.revokeObjectURL(rawPhotoSrc);
          setRawPhotoSrc('');
        }}
        onCropComplete={handleCropComplete}
      />
    </div>
  );
};

export default CandidateManager;
