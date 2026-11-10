import { useCallback, useEffect, useState } from 'react';
import { boothApi } from '../api/boothApi';
import { usePolling } from './usePolling';

const CLEAR = ['kiosk_token', 'kiosk_name', 'access_token', 'refresh_token', 'user'];

/**
 * The booth this browser is set up as. Re-checks with the server every 3 seconds, so a booth that
 * was deleted (or whose election is closed) reacts at once and goes back to the set-up screen.
 * state: 'checking' | 'setup' | 'ready'
 */
export function useBooth() {
  const [state, setState] = useState(localStorage.getItem('kiosk_token') ? 'checking' : 'setup');
  const [info, setInfo] = useState(null);

  const check = useCallback(async () => {
    if (!localStorage.getItem('kiosk_token')) {
      setState('setup');
      return;
    }
    try {
      const data = await boothApi.status();
      if (data.valid) {
        setInfo(data);
        setState('ready');
        window.dispatchEvent(new CustomEvent('app:network-online'));
      } else {
        CLEAR.forEach((k) => localStorage.removeItem(k)); // revoked: forget the token and any voter session
        setInfo(null);
        setState('setup');
      }
    } catch {
      /* network trouble: keep what we know; signal offline overlay */
      window.dispatchEvent(new CustomEvent('app:network-offline'));
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);
  usePolling(check, 3000);

  const activated = (token, boothId) => {
    localStorage.setItem('kiosk_token', token);
    localStorage.setItem('kiosk_name', boothId);
    setState('checking');
    check();
  };

  return { state, info, activated };
}
