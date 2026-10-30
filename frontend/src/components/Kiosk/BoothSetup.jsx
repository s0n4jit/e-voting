import React, { useState } from 'react';
import { boothApi } from '../../api/boothApi';
import { BrandMark, Field, ThemeToggle, errorMessage } from '../ui';

/** Shown on a computer that is not (or no longer) a voting booth. */
export default function BoothSetup({ onActivated }) {
  const [token, setToken] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await boothApi.activate(token.trim(), code.trim());
      setDone(res);
      setTimeout(() => onActivated(res.booth_token, res.booth_id), 1800); // let the new Booth ID be seen
    } catch (err) {
      setError(errorMessage(err, 'The booth could not be set up.'));
      setCode('');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <BrandMark />
        <ThemeToggle />
      </header>
      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md animate-page-in">
          {done ? (
            <div className="text-center animate-pop-in" role="status">
              <p className="text-muted">This computer is now booth</p>
              <p className="text-5xl font-semibold tracking-tight font-mono mt-2">{done.booth_id}</p>
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-semibold tracking-tight text-center">Set up this voting booth</h1>
              <p className="text-muted text-center mt-2 mb-8">
                Enter the booth token from the officer panel and the current code from the Election Officer's authenticator app. The Booth ID is assigned automatically.
              </p>
              <form onSubmit={submit} className="card card-body space-y-5">
                <Field label="Booth token" htmlFor="booth-token" hint="Created in the officer panel under Voting booths.">
                  <input id="booth-token" className="input font-mono uppercase text-center text-xl tracking-widest py-3" value={token} onChange={(e) => setToken(e.target.value)} placeholder="XXXX-XXXX" maxLength={12} autoComplete="off" autoFocus required />
                </Field>
                <Field label="Election Officer's authenticator code" htmlFor="booth-code">
                  <input id="booth-code" className="input text-center text-2xl tracking-[0.5em] py-3 tabular-nums" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="••••••" autoComplete="off" required />
                </Field>
                {error && <p className="text-sm text-bad bg-bad-soft rounded-lg px-3 py-2 animate-pop-in" role="alert">{error}</p>}
                <button className="btn-primary btn-lg w-full" disabled={busy || token.replace(/[^A-Za-z0-9]/g, '').length < 8 || code.length !== 6}>
                  {busy ? 'Setting up…' : 'Set up booth'}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
