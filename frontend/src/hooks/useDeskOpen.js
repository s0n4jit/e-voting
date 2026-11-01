import { useState } from 'react';
import { deskApi } from '../api/deskApi';
import { usePolling } from './usePolling';

/** State of the desk: `open` is false once voting is closed (no registrations or PINs); `paused` while the officer has paused voting (no PINs). */
export function useDeskState() {
  const [state, setState] = useState({ open: true, paused: false });
  usePolling(() => deskApi.state().then((d) => setState({ open: d.open, paused: Boolean(d.paused) })).catch(() => {}), 4000);
  return state;
}

export function useDeskOpen() {
  return useDeskState().open;
}
