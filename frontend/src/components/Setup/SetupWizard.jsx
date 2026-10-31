import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { CheckIcon, ArrowLeftIcon, ArrowRightIcon, XMarkIcon, PhotoIcon } from '@heroicons/react/24/outline';
import { setupApi } from '../../api/deskApi';
import { setFavicon, useBrand } from '../../context/BrandContext';
import { ThemeToggle, Field, errorMessage } from '../ui';
import { fileToAvatarDataUrl } from '../ui/image';
import { TwoStep } from '../Profile/ProfilePage';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../common/LoadingSpinner';
import ProgrammePlanner from './ProgrammePlanner';

const STEPS = ['Welcome', 'System', 'Officer account', 'Election', 'Review'];
const LANGUAGES = { en: 'English', hi: 'Hindi', bn: 'Bengali', as: 'Assamese' };
const SUGGESTED_POSITIONS = [
  'Vice President',
  'General Secretary',
  'Cultural Secretary',
  'Magazine Secretary',
  'Assistant General Secretary',
  'Major Games Secretary',
  'Minor Games Secretary',
  'Boys’ Common Room Secretary',
  'Girls’ Common Room Secretary',
];
const MAX_LOGO_BYTES = 250 * 1024;

const timezones = () => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['UTC', 'Asia/Kolkata', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney'];
  }
};

const today = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);

export default function SetupWizard() {
  const { ready, installed, requiresToken } = useBrand();
  const { loadCurrentUser, user: signedIn } = useAuth();
  const [secure, setSecure] = useState(false); // after installing: offer two-step verification
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [token, setToken] = useState('');
  const [positionDraft, setPositionDraft] = useState('');
  const zones = useMemo(timezones, []);

  const [data, setData] = useState({
    system: {
      institution_name: '',
      system_name: 'Campus Election Portal',
      logo: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      language: 'en',
      slip_code: 'SUE',
    },
    officer: { name: '', email: '', username: '', password: '', confirm_password: '', photo: '' },
    election: {
      title: '',
      description: '',
      date: today(),
      start_time: '09:00',
      end_time: '17:00',
      positions: [],
      programmes_csv: '',
    },
  });

  useEffect(() => {
    setFavicon(data.system.logo); // the chosen logo becomes the browser tab icon right away
  }, [data.system.logo]);

  if (secure) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl space-y-6 animate-page-in">
          <div className="text-center">
            <p className="text-xs font-medium text-brand-fg uppercase tracking-wide">Last step</p>
            <h1 className="text-2xl font-semibold tracking-tight">Turn on two-step verification</h1>
            <p className="text-muted mt-2">The portal is installed, but the Election Officer account cannot be used until two-step verification is on. It is required: it approves new voting booths, protects resets and backups, and lets you recover a forgotten password. Scan the code with an authenticator app (Google Authenticator, Microsoft Authenticator, Aegis…) and enter the 6-digit code.</p>
          </div>
          <TwoStep />
          <div className="text-center">
            <button className="btn-primary btn-lg" disabled={!signedIn?.otp_enabled} onClick={() => window.location.replace('/admin/dashboard')}>Go to the dashboard</button>
            {!signedIn?.otp_enabled && <p className="text-xs text-muted mt-2">Turn on two-step verification above to continue.</p>}
          </div>
        </div>
      </div>
    );
  }

  if (!ready) return <LoadingSpinner size="lg" />;
  if (installed) return <Navigate to="/login" replace />;

  const set = (section, key, value) => {
    setData((d) => ({ ...d, [section]: { ...d[section], [key]: value } }));
    setErrors((e) => ({ ...e, [key]: undefined, schedule: key.includes('time') || key === 'date' ? undefined : e.schedule }));
  };

  const sectionOf = (i) => ['', 'system', 'officer', 'election'][i];

  const next = async () => {
    setFormError('');
    const section = sectionOf(step);
    if (!section) return setStep(step + 1);
    setBusy(true);
    try {
      const res = await setupApi.validate(section, data, token);
      const found = res.errors?.[section] || {};
      setErrors(found);
      if (Object.keys(found).length === 0) setStep(step + 1);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const install = async () => {
    setBusy(true);
    setFormError('');
    try {
      const res = await setupApi.complete(data, token);
      localStorage.setItem('access_token', res.access_token);
      localStorage.setItem('refresh_token', res.refresh_token);
      localStorage.setItem('user', JSON.stringify(res.user));
      await loadCurrentUser();
      setSecure(true);
      setBusy(false);
    } catch (err) {
      const found = err?.response?.data?.errors;
      if (found) {
        const first = ['system', 'officer', 'election'].findIndex((s) => found[s]);
        setErrors(found[['system', 'officer', 'election'][first]] || {});
        setStep(first + 1);
      }
      setFormError(errorMessage(err, 'Installation failed. Please review your details and try again.'));
      setBusy(false);
    }
  };

  const onLogo = (file) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > MAX_LOGO_BYTES) {
      setErrors((e) => ({ ...e, logo: 'Use a PNG, JPEG or WebP image under 250 KB.' }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set('system', 'logo', reader.result);
    reader.readAsDataURL(file);
  };

  const addPosition = (name) => {
    const value = name.trim().replace(/\s+/g, ' ');
    const list = data.election.positions;
    if (value && !list.some((p) => p.toLowerCase() === value.toLowerCase())) set('election', 'positions', [...list, value]);
    setPositionDraft('');
  };

  const { system, officer, election } = data;
  const input = (section, key, props = {}) => (
    <input
      id={`${section}-${key}`}
      className={`input ${errors[key] ? 'input-error' : ''}`}
      value={data[section][key]}
      onChange={(e) => set(section, key, e.target.value)}
      aria-invalid={Boolean(errors[key])}
      {...props}
    />
  );

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="text-sm font-semibold">Installation</span>
        <ThemeToggle />
      </header>

      <main className="flex-1 flex items-start sm:items-center justify-center px-4 pb-12">
        <div className="w-full max-w-2xl">
          <ol className="flex items-center justify-between mb-8" aria-label="Setup progress">
            {STEPS.map((label, i) => (
              <li key={label} className="flex-1 flex items-center">
                <div className="flex flex-col items-center gap-1.5 min-w-0">
                  <span
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors duration-300 ${
                      i < step ? 'bg-brand text-white' : i === step ? 'bg-brand-soft text-brand-fg ring-2 ring-brand' : 'bg-recessed text-muted'
                    }`}
                    aria-current={i === step ? 'step' : undefined}
                  >
                    {i < step ? <CheckIcon className="w-4 h-4" /> : i + 1}
                  </span>
                  <span className={`text-xs hidden sm:block ${i === step ? 'text-fg font-medium' : 'text-muted'}`}>{label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <span className={`flex-1 h-px mx-2 transition-colors duration-300 ${i < step ? 'bg-brand' : 'bg-line'}`} />
                )}
              </li>
            ))}
          </ol>

          <div className="card card-body sm:p-8" key={step}>
            <div className="animate-slide-up space-y-6">
              {step === 0 && (
                <>
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Welcome</h1>
                    <p className="text-muted mt-2">
                      This short setup creates your election portal: your institution details, the first Election
                      Officer account and your first election. It takes about two minutes and can only be run once.
                    </p>
                  </div>
                  <ul className="space-y-2 text-sm text-muted">
                    {['Name your institution and portal', 'Create the Election Officer account', 'Configure your first election and positions'].map((t) => (
                      <li key={t} className="flex gap-2">
                        <CheckIcon className="w-4 h-4 mt-0.5 text-ok shrink-0" />
                        {t}
                      </li>
                    ))}
                  </ul>
                  {requiresToken && (
                    <Field label="Setup token" htmlFor="setup-token" hint="Provided by whoever deployed this server.">
                      <input id="setup-token" type="password" className="input" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
                    </Field>
                  )}
                </>
              )}

              {step === 1 && (
                <>
                  <h2 className="text-xl font-semibold tracking-tight">System configuration</h2>
                  <Field label="Institution name" htmlFor="system-institution_name" error={errors.institution_name}>
                    {input('system', 'institution_name', { placeholder: 'e.g. Pandit Deendayal Upadhyaya Adarsha Mahavidyalaya', autoFocus: true })}
                  </Field>
                  <Field label="Election system name" htmlFor="system-system_name" error={errors.system_name}>
                    {input('system', 'system_name')}
                  </Field>
                  <Field
                    label="Voter slip ID letters"
                    htmlFor="system-slip_code"
                    error={errors.slip_code}
                    hint={`Slip IDs read ${(system.slip_code || 'SUE').toUpperCase()}26-E1-483920: letters, election year, election number, slip number. Keep SUE or choose 2 to 6 letters.`}
                  >
                    {input('system', 'slip_code', { maxLength: 6, className: `input font-mono uppercase max-w-[10rem] ${errors.slip_code ? 'input-error' : ''}` })}
                  </Field>
                  <Field label="Institution logo (optional)" error={errors.logo} hint="PNG, JPEG or WebP, up to 250 KB.">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-lg border border-line bg-recessed flex items-center justify-center overflow-hidden">
                        {system.logo ? <img src={system.logo} alt="Logo preview" className="w-full h-full object-contain" /> : <PhotoIcon className="w-6 h-6 text-muted" />}
                      </div>
                      <label className="btn-secondary btn-sm cursor-pointer">
                        Choose image
                        <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => onLogo(e.target.files?.[0])} />
                      </label>
                      {system.logo && (
                        <button type="button" className="btn-ghost btn-sm" onClick={() => set('system', 'logo', '')}>
                          Remove
                        </button>
                      )}
                    </div>
                  </Field>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Timezone" htmlFor="system-timezone" error={errors.timezone}>
                      <select id="system-timezone" className="input" value={system.timezone} onChange={(e) => set('system', 'timezone', e.target.value)}>
                        {zones.map((z) => (
                          <option key={z} value={z}>{z}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Default language" htmlFor="system-language" error={errors.language}>
                      <select id="system-language" className="input" value={system.language} onChange={(e) => set('system', 'language', e.target.value)}>
                        {Object.entries(LANGUAGES).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">Election Officer account</h2>
                    <p className="text-sm text-muted mt-1">This account has full control of the portal. After installing you will set up <b>two-step verification</b> with an authenticator app. It is required, so have your phone ready.</p>
                  </div>
                  <Field label="Photo (optional)" error={errors.photo} hint="Shown next to your name at the top of every page. You can change it later.">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full border border-line bg-recessed overflow-hidden flex items-center justify-center">
                        {officer.photo ? <img src={officer.photo} alt="Photo preview" className="w-full h-full object-cover" /> : <PhotoIcon className="w-6 h-6 text-muted" />}
                      </div>
                      <label className="btn-secondary btn-sm cursor-pointer">
                        {officer.photo ? 'Change photo' : 'Choose photo'}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="sr-only"
                          onChange={(e) => e.target.files?.[0] && fileToAvatarDataUrl(e.target.files[0]).then((url) => set('officer', 'photo', url)).catch((err) => setErrors((x) => ({ ...x, photo: err.message })))}
                        />
                      </label>
                      {officer.photo && <button type="button" className="btn-ghost btn-sm" onClick={() => set('officer', 'photo', '')}>Remove</button>}
                    </div>
                  </Field>
                  <Field label="Full name" htmlFor="officer-name" error={errors.name}>
                    {input('officer', 'name', { autoComplete: 'name', autoFocus: true })}
                  </Field>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Email address" htmlFor="officer-email" error={errors.email}>
                      {input('officer', 'email', { type: 'email', autoComplete: 'email' })}
                    </Field>
                    <Field label="Username" htmlFor="officer-username" error={errors.username}>
                      {input('officer', 'username', { autoComplete: 'username' })}
                    </Field>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="Password" htmlFor="officer-password" error={errors.password} hint="At least 8 characters with a letter and a digit.">
                      {input('officer', 'password', { type: 'password', autoComplete: 'new-password' })}
                    </Field>
                    <Field label="Confirm password" htmlFor="officer-confirm_password" error={errors.confirm_password}>
                      {input('officer', 'confirm_password', { type: 'password', autoComplete: 'new-password' })}
                    </Field>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <h2 className="text-xl font-semibold tracking-tight">Election configuration</h2>
                  <Field label="Election title" htmlFor="election-title" error={errors.title}>
                    {input('election', 'title', { placeholder: 'e.g. General Election of the Student Union 2026-27', autoFocus: true })}
                  </Field>
                  <Field label="Description (optional)" htmlFor="election-description">
                    <textarea id="election-description" className="input min-h-[72px]" value={election.description} onChange={(e) => set('election', 'description', e.target.value)} />
                  </Field>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <Field label="Election date" htmlFor="election-date">
                      {input('election', 'date', { type: 'date' })}
                    </Field>
                    <Field label="Scheduled start (for information)" htmlFor="election-start_time">
                      {input('election', 'start_time', { type: 'time' })}
                    </Field>
                    <Field label="Scheduled end (for information)" htmlFor="election-end_time">
                      {input('election', 'end_time', { type: 'time' })}
                    </Field>
                  </div>
                  {errors.schedule && <p className="error-text -mt-3" role="alert">{errors.schedule}</p>}

                  <Field label="Available positions" error={errors.positions}>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {election.positions.map((p) => (
                        <span key={p} className="badge-brand gap-1.5 pr-1.5">
                          {p}
                          <button
                            type="button"
                            className="rounded-full hover:bg-brand/20 p-0.5"
                            onClick={() => set('election', 'positions', election.positions.filter((x) => x !== p))}
                            aria-label={`Remove ${p}`}
                          >
                            <XMarkIcon className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        className="input"
                        value={positionDraft}
                        placeholder="Type a position and press Enter"
                        onChange={(e) => setPositionDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addPosition(positionDraft);
                          }
                        }}
                      />
                      <button type="button" className="btn-secondary" onClick={() => addPosition(positionDraft)}>
                        Add
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {SUGGESTED_POSITIONS.filter((s) => !election.positions.includes(s)).map((s) => (
                        <button key={s} type="button" className="badge-neutral hover:bg-line transition-colors" onClick={() => addPosition(s)}>
                          + {s}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <div>
                    <ProgrammePlanner onChange={(csv) => set('election', 'programmes_csv', csv)} />
                    {errors.programmes_csv && <p className="error-text mt-2" role="alert">{errors.programmes_csv}</p>}
                  </div>
                </>
              )}

              {step === 4 && (
                <>
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">Review and complete</h2>
                    <p className="text-sm text-muted mt-1">Check everything below, then install.</p>
                  </div>
                  <dl className="divide-y divide-line text-sm">
                    {[
                      ['Institution', system.institution_name],
                      ['System name', system.system_name],
                      ['Timezone', system.timezone],
                      ['Language', LANGUAGES[system.language]],
                      ['Slip ID letters', (system.slip_code || 'SUE').toUpperCase()],
                      ['Election Officer', `${officer.name} (${officer.username})`],
                      ['Email', officer.email],
                      ['Election', election.title],
                      ['Voting', `${election.date}, ${election.start_time}–${election.end_time}`],
                      ['Positions', election.positions.join(', ')],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-6 py-2.5">
                        <dt className="text-muted">{k}</dt>
                        <dd className="text-right font-medium break-words min-w-0">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}

              {formError && (
                <p className="text-sm text-bad bg-bad-soft rounded-lg px-3 py-2" role="alert">
                  {formError}
                </p>
              )}

              <div className="flex items-center justify-between pt-2">
                <button type="button" className="btn-ghost" onClick={() => { setErrors({}); setFormError(''); setStep(step - 1); }} disabled={step === 0 || busy}>
                  <ArrowLeftIcon className="w-4 h-4" /> Back
                </button>
                {step < 4 ? (
                  <button type="button" className="btn-primary" onClick={next} disabled={busy}>
                    {step === 0 ? 'Get started' : 'Continue'} {busy ? <LoadingSpinner size="sm" /> : <ArrowRightIcon className="w-4 h-4" />}
                  </button>
                ) : (
                  <button type="button" className="btn-primary" onClick={install} disabled={busy}>
                    {busy ? 'Installing…' : 'Install and set up two-step verification'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
