import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { adminApi } from '../../api/adminApi';
import { useBrand } from '../../context/BrandContext';
import { Field, PageHeader, errorMessage } from '../ui';
import LoadingSpinner from '../common/LoadingSpinner';

const LANGUAGES = { en: 'English', hi: 'Hindi', bn: 'Bengali', as: 'Assamese' };

export default function SettingsPage() {
  const { refresh } = useBrand();
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const zones = (() => {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return ['UTC'];
    }
  })();

  useEffect(() => {
    adminApi.getSettings().then(setForm).catch((e) => toast.error(errorMessage(e)));
  }, []);

  if (!form) return <LoadingSpinner size="lg" />;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onLogo = (file) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 250 * 1024) {
      setErrors({ logo: 'Use a PNG, JPEG or WebP image under 250 KB.' });
      return;
    }
    const r = new FileReader();
    r.onload = () => set('logo', r.result);
    r.readAsDataURL(file);
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await adminApi.saveSettings(form);
      await refresh();
      toast.success('Settings saved');
    } catch (err) {
      setErrors(err?.response?.data?.errors?.system || { form: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" subtitle="Branding and regional settings for this portal." />
      <form onSubmit={save} className="card card-body space-y-5">
        <Field label="Institution name" htmlFor="s-inst" error={errors.institution_name}>
          <input id="s-inst" className="input" value={form.institution_name} onChange={(e) => set('institution_name', e.target.value)} required />
        </Field>
        <Field label="Election system name" htmlFor="s-name" error={errors.system_name}>
          <input id="s-name" className="input" value={form.system_name} onChange={(e) => set('system_name', e.target.value)} required />
        </Field>
        <Field label="Voter slip ID letters" htmlFor="s-slip" error={errors.slip_code} hint="Used for elections created from now on. Slip IDs read e.g. SUE26-E1-483920.">
          <input id="s-slip" className="input font-mono uppercase max-w-[10rem]" maxLength={6} value={form.slip_code || 'SUE'} onChange={(e) => set('slip_code', e.target.value)} />
        </Field>
        <Field label="Logo" error={errors.logo} hint="PNG, JPEG or WebP, up to 250 KB.">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-lg border border-line bg-recessed overflow-hidden flex items-center justify-center">
              {form.logo ? <img src={form.logo} alt="Logo preview" className="w-full h-full object-contain" /> : <span className="text-xs text-muted">None</span>}
            </div>
            <label className="btn-secondary btn-sm cursor-pointer">
              Choose image
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => onLogo(e.target.files?.[0])} />
            </label>
            {form.logo && <button type="button" className="btn-ghost btn-sm" onClick={() => set('logo', '')}>Remove</button>}
          </div>
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Timezone" htmlFor="s-tz" error={errors.timezone}>
            <select id="s-tz" className="input" value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>
              {zones.map((z) => <option key={z}>{z}</option>)}
            </select>
          </Field>
          <Field label="Default language" htmlFor="s-lang" error={errors.language}>
            <select id="s-lang" className="input" value={form.language} onChange={(e) => set('language', e.target.value)}>
              {Object.entries(LANGUAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        {errors.form && <p className="error-text" role="alert">{errors.form}</p>}
        <div><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button></div>
      </form>
    </div>
  );
}
