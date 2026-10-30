import { useState } from 'react';
import { deskApi } from '../api/deskApi';
import { usePolling } from './usePolling';

/** False once the Election Officer has closed voting: no more registrations or PINs. */
export function useDeskOpen() {
  const [open, setOpen] = useState(true);
  usePolling(() => deskApi.state().then((d) => setOpen(d.open)).catch(() => {}), 4000);
  return open;
}
