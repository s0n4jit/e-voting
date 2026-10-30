import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import {
  CameraIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  EnvelopeIcon,
  EyeIcon,
  EyeSlashIcon,
  IdentificationIcon,
  KeyIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { authApi } from '../../api/authApi';
import { useAuth } from '../../context/AuthContext';
import { AnimatedCheck, Field, UserAvatar, errorMessage } from '../ui';
import { fileToAvatarDataUrl } from '../ui/image';
import StatusBadge from '../common/StatusBadge';

const ROLE_LABEL = { admin: 'Election Officer', polling_officer: 'Desk Officer' };

const PasswordInput = ({ id, value, onChange, autoComplete, error, autoFocus }) => {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={shown ? 'text' : 'password'}
        className={`input pr-11 ${error ? 'input-error' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        required
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted hover:text-fg rounded-md"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? 'Hide password' : 'Show password'}
      >
        {shown ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
      </button>
    </div>
  );
};

const RULES = [
  ['At least 8 characters', (p) => p.length >= 8],
  ['A letter', (p) => /[A-Za-z]/.test(p)],
  ['A number', (p) => /\d/.test(p)],
];

const ChangePassword = () => {
  const { user } = useAuth();
  const [useCode, setUseCode] = useState(false); // forgot the current password: prove identity with an authenticator code
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const passed = RULES.filter(([, test]) => test(form.next)).length;
  const strength = form.next ? passed + (form.next.length >= 12 && /[^A-Za-z0-9]/.test(form.next) ? 1 : 0) : 0;
  const STRENGTH = [['', 'bg-line'], ['Weak', 'bg-bad'], ['Fair', 'bg-warn'], ['Good', 'bg-brand'], ['Strong', 'bg-ok']][strength];
  const mismatch = form.confirm && form.confirm !== form.next;
  const set = (key) => (value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors({});
  };

  const submit = async (e) => {
    e.preventDefault();
    if (form.next !== form.confirm) return setErrors({ confirm: 'The two passwords do not match.' });
    setBusy(true);
    try {
      await authApi.changePassword(form.current, form.next, useCode ? form.current : '');
      setForm({ current: '', next: '', confirm: '' });
      setDone(true);
      setTimeout(() => setDone(false), 3500);
    } catch (err) {
      const field = err?.response?.data?.field;
      setErrors({ [field === 'new_password' ? 'next' : field === 'current_password' || field === 'code' ? 'current' : 'form']: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card card-body relative overflow-hidden animate-slide-up" style={{ animationDelay: '80ms' }}>
      <div className="flex items-center gap-3 mb-5">
        <span className="w-10 h-10 rounded-xl bg-brand-soft text-brand-fg flex items-center justify-center"><KeyIcon className="w-5 h-5" /></span>
        <div>
          <h2 className="font-semibold">Change password</h2>
          <p className="text-sm text-muted">Use a password you don't use anywhere else.</p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {useCode ? (
          <Field label="Code from your authenticator app" htmlFor="pw-current" error={errors.current}>
            <input id="pw-current" className={`input tracking-[0.35em] text-center tabular-nums max-w-[11rem] ${errors.current ? 'input-error' : ''}`} inputMode="numeric" maxLength={6} value={form.current} onChange={(e) => set('current')(e.target.value.replace(/\D/g, ''))} autoComplete="one-time-code" autoFocus />
          </Field>
        ) : (
          <Field label="Current password" htmlFor="pw-current" error={errors.current}>
            <PasswordInput id="pw-current" value={form.current} onChange={set('current')} autoComplete="current-password" error={errors.current} />
          </Field>
        )}
        {user?.otp_enabled ? (
          <button type="button" className="text-sm text-brand-fg hover:underline -mt-1" onClick={() => { setUseCode(!useCode); setForm((f) => ({ ...f, current: '' })); setErrors({}); }}>
            {useCode ? 'Use my current password instead' : 'Forgot the current password? Use an authenticator code'}
          </button>
        ) : (
          <p className="text-xs text-muted -mt-1">Forgot your password in future? Turn on two-step verification below to be able to reset it with an authenticator code.</p>
        )}
        <Field label="New password" htmlFor="pw-new" error={errors.next}>
          <PasswordInput id="pw-new" value={form.next} onChange={set('next')} autoComplete="new-password" error={errors.next} />
        </Field>

        {form.next && (
          <div className="animate-fade-in space-y-2" aria-live="polite">
            <div className="flex gap-1.5" aria-hidden="true">
              {[1, 2, 3, 4].map((i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i <= strength ? STRENGTH[1] : 'bg-line'}`} />
              ))}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {RULES.map(([label, test]) => (
                <li key={label} className={`flex items-center gap-1 transition-colors ${test(form.next) ? 'text-ok' : 'text-muted'}`}>
                  <CheckCircleIcon className="w-4 h-4" /> {label}
                </li>
              ))}
              {STRENGTH[0] && <li className="ml-auto font-medium text-fg">{STRENGTH[0]}</li>}
            </ul>
          </div>
        )}

        <Field label="Confirm new password" htmlFor="pw-confirm" error={errors.confirm || (mismatch ? 'The two passwords do not match.' : '')}>
          <PasswordInput id="pw-confirm" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" error={mismatch || errors.confirm} />
        </Field>

        {errors.form && <p className="error-text" role="alert">{errors.form}</p>}
        <button className="btn-primary w-full sm:w-auto" disabled={busy || !form.current || (useCode && form.current.length !== 6) || passed < 3 || form.next !== form.confirm}>
          {busy ? 'Saving…' : 'Update password'}
        </button>
      </form>

      {done && (
        <div className="absolute inset-0 bg-surface/95 flex flex-col items-center justify-center gap-3 animate-fade-in" role="status">
          <AnimatedCheck size={72} />
          <p className="font-semibold">Password updated</p>
        </div>
      )}
    </section>
  );
};

export const TwoStep = () => {
  const { user, loadCurrentUser } = useAuth();
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [turningOff, setTurningOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const enabled = Boolean(user?.otp_enabled);
  const required = user?.role === 'admin'; // mandatory for Election Officers

  const run = async (fn, message) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      toast.success(message);
      setSetup(null);
      setCode('');
      setPassword('');
      setTurningOff(false);
      await loadCurrentUser();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      setSetup(await authApi.setupTotp());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card card-body animate-slide-up" style={{ animationDelay: '160ms' }}>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-brand-soft text-brand-fg flex items-center justify-center"><ShieldCheckIcon className="w-5 h-5" /></span>
          <div>
            <h2 className="font-semibold">Two-step verification</h2>
            <p className="text-sm text-muted">Ask for a code from an authenticator app when signing in.</p>
          </div>
        </div>
        <StatusBadge label={enabled ? 'On' : 'Off'} variant={enabled ? 'ok' : 'neutral'} />
      </div>

      {!enabled && !setup && (
        <button className="btn-primary w-fit" onClick={start} disabled={busy}>{busy ? 'Preparing…' : 'Turn on'}</button>
      )}

      {!enabled && setup && (
        <form
          className="grid sm:grid-cols-[auto_1fr] gap-6 animate-fade-in"
          onSubmit={(e) => { e.preventDefault(); run(() => authApi.enableTotp(code.trim()), 'Two-step verification is on'); }}
        >
          <img src={setup.qr_code} alt="QR code to scan with an authenticator app" className="w-44 h-44 rounded-xl border border-line bg-white p-2" />
          <div className="space-y-4 min-w-0">
            <ol className="text-sm text-muted list-decimal pl-5 space-y-1">
              <li>Open an authenticator app such as Google or Microsoft Authenticator.</li>
              <li>Scan the code, or type the key below.</li>
              <li>Enter the 6-digit code the app shows.</li>
            </ol>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-recessed rounded-lg px-3 py-2 break-all select-all">{setup.secret}</code>
              <button type="button" className="btn-ghost btn-sm" onClick={() => { navigator.clipboard?.writeText(setup.secret); toast.success('Key copied'); }} aria-label="Copy key">
                <ClipboardDocumentIcon className="w-4 h-4" />
              </button>
            </div>
            <Field label="Code from the app" htmlFor="tf-code" error={error}>
              <input id="tf-code" className="input tracking-[0.35em] text-center tabular-nums max-w-[11rem]" inputMode="numeric" maxLength={6} value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setError(''); }} autoComplete="one-time-code" />
            </Field>
            <div className="flex gap-2">
              <button className="btn-primary" disabled={busy || code.length !== 6}>Verify and turn on</button>
              <button type="button" className="btn-ghost" onClick={() => { setSetup(null); setError(''); }}>Cancel</button>
            </div>
          </div>
        </form>
      )}

      {enabled && required && <p className="text-sm text-muted">Required for Election Officers.</p>}
      {enabled && !required && !turningOff && (
        <button className="btn-secondary w-fit" onClick={() => setTurningOff(true)}>Turn off</button>
      )}
      {enabled && !required && turningOff && (
        <form className="space-y-4 max-w-sm animate-fade-in" onSubmit={(e) => { e.preventDefault(); run(() => authApi.disableTotp(password), 'Two-step verification is off'); }}>
          <Field label="Confirm with your password" htmlFor="tf-pass" error={error}>
            <PasswordInput id="tf-pass" value={password} onChange={(v) => { setPassword(v); setError(''); }} autoComplete="current-password" autoFocus />
          </Field>
          <div className="flex gap-2">
            <button className="btn-danger" disabled={busy || !password}>Turn off</button>
            <button type="button" className="btn-ghost" onClick={() => { setTurningOff(false); setError(''); }}>Cancel</button>
          </div>
        </form>
      )}
      {error && !setup && !turningOff && <p className="error-text mt-3" role="alert">{error}</p>}
    </section>
  );
};

export default function ProfilePage() {
  const { user, role, loadCurrentUser } = useAuth();
  const [photoBusy, setPhotoBusy] = useState(false);
  const [lastLogin, setLastLogin] = useState(null);
  useEffect(() => {
    authApi.getLastLogin().then(setLastLogin).catch(() => {});
  }, []);
  const details = [
    [IdentificationIcon, 'Username', user?.student_id],
    [EnvelopeIcon, 'Email', user?.email],
  ];

  const changePhoto = async (file) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      await authApi.setPhoto(await fileToAvatarDataUrl(file));
      await loadCurrentUser();
      toast.success('Photo updated');
    } catch (err) {
      toast.error(err?.response ? errorMessage(err) : err.message);
    } finally {
      setPhotoBusy(false);
    }
  };
  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      await authApi.setPhoto('');
      await loadCurrentUser();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      <section className="card overflow-hidden animate-slide-up">
        <div className="h-28 bg-gradient-to-r from-primary-900 via-primary-700 to-primary-500" />
        <div className="px-6 pb-6 flex flex-col sm:flex-row sm:items-start gap-5">
          <div className="-mt-12 shrink-0 w-fit">
            <div className="relative group animate-pop-in">
              <UserAvatar user={user} className="w-24 h-24 text-4xl ring-4 ring-surface rounded-2xl" />
              <label
                className={`absolute inset-0 rounded-2xl bg-black/55 text-white text-xs font-medium flex flex-col items-center justify-center gap-1 cursor-pointer transition-opacity ${photoBusy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}
              >
                <CameraIcon className="w-6 h-6" />
                {photoBusy ? 'Saving…' : 'Change'}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={photoBusy} onChange={(e) => changePhoto(e.target.files?.[0])} />
              </label>
            </div>
            {user?.photo && (
              <button className="text-xs text-muted hover:text-bad mt-2 block mx-auto" onClick={removePhoto} disabled={photoBusy}>Remove photo</button>
            )}
          </div>
          <div className="min-w-0 flex-1 sm:pt-4">
            <h1 className="text-2xl font-semibold tracking-tight truncate">{user?.name}</h1>
            <p className="text-sm text-muted mt-0.5">{ROLE_LABEL[role]}{lastLogin?.at ? ` · Last login ${format(new Date(lastLogin.at), 'd MMM yyyy, h:mm a')}${lastLogin.ip ? ` from ${lastLogin.ip}` : ''}` : ''}</p>
            <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm mt-4">
              {details.map(([Icon, label, value]) => (
                <div key={label} className="flex items-center gap-2 min-w-0">
                  <Icon className="w-4 h-4 text-muted shrink-0" />
                  <dt className="sr-only">{label}</dt>
                  <dd className="truncate">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <ChangePassword />
        <TwoStep />
      </div>
    </div>
  );
}
