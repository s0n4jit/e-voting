import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../../api/authApi';
import { useAuth } from '../../context/AuthContext';
import Modal from './Modal';

const IDLE_MS = 15 * 60 * 1000; // signed out after this long without activity
const WARN_MS = 60 * 1000; // warning shown this long before that
const RENEW_BEFORE_MS = 5 * 60 * 1000; // renew the access token when it has less than this left
const ACTIVE_WINDOW_MS = 2 * 60 * 1000; // ...but only for someone who was active in the last 2 minutes
const STORE = 'last_activity'; // shared by all tabs of this browser

const expiryOf = (jwt) => {
  try {
    return JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000;
  } catch {
    return 0;
  }
};

/**
 * Staff sessions: 15 minutes idle sign-out with a one-minute warning, silent renewal of the short-lived
 * access token while the person is working, and a hard cap set by the refresh token (12 hours).
 */
export default function SessionGuard() {
  const { isAuthenticated, role, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [left, setLeft] = useState(null); // seconds until sign-out while the warning is showing
  const renewing = useRef(false);
  const staff = isAuthenticated && (role === 'admin' || role === 'polling_officer');
  const presenting = pathname.includes('/present'); // the projector reveal is driven by key presses; never time it out

  useEffect(() => {
    if (!staff) return undefined;
    const last = Number(localStorage.getItem(STORE) || 0);
    if (last && Date.now() - last > IDLE_MS) {
      signOut();
      return undefined;
    }
    touch();
    let lastWrite = 0;
    const onActivity = () => {
      if (Date.now() - lastWrite > 3000) {
        lastWrite = Date.now();
        touch();
      }
    };
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'mousemove'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const timer = setInterval(tick, 5000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff, presenting]);

  const touch = () => {
    localStorage.setItem(STORE, String(Date.now()));
    setLeft(null);
  };

  async function signOut() {
    await logout();
    localStorage.removeItem(STORE);
    setLeft(null);
    navigate('/login', { replace: true, state: { reason: 'idle' } });
  }

  async function renew() {
    const refresh = localStorage.getItem('refresh_token');
    if (!refresh || renewing.current) return;
    renewing.current = true;
    try {
      const res = await authApi.refreshToken(refresh);
      if (res?.access_token) localStorage.setItem('access_token', res.access_token);
    } catch {
      /* a 401 here clears the session through the request interceptor */
    } finally {
      renewing.current = false;
    }
  }

  function tick() {
    if (presenting) localStorage.setItem(STORE, String(Date.now()));
    const idle = Date.now() - Number(localStorage.getItem(STORE) || Date.now());
    if (idle >= IDLE_MS) return signOut();
    setLeft(idle >= IDLE_MS - WARN_MS ? Math.ceil((IDLE_MS - idle) / 1000) : null);
    const exp = expiryOf(localStorage.getItem('access_token') || '');
    if (exp && exp - Date.now() < RENEW_BEFORE_MS && idle < ACTIVE_WINDOW_MS) renew();
    return undefined;
  }

  if (!staff) return null;
  return (
    <Modal isOpen={left !== null} onClose={touch} title="Still there?" showCloseButton={false}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          You will be signed out in <b>{left}</b> seconds because there has been no activity. Unsaved changes would be lost.
        </p>
        <div className="flex justify-end">
          <button className="btn-primary" onClick={() => { touch(); renew(); }}>Stay signed in</button>
        </div>
      </div>
    </Modal>
  );
}
