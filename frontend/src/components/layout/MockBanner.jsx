import React, { useState } from 'react';
import { deskApi } from '../../api/deskApi';
import { usePolling } from '../../hooks/usePolling';

/** Shown on every officer/desk page while a mock (practice) election is running. */
export default function MockBanner() {
  const [mock, setMock] = useState(false);
  usePolling(() => deskApi.state().then((d) => setMock(Boolean(d.mock))).catch(() => {}), 5000);
  if (!mock) return null;
  return (
    <div className="bg-warn-soft text-warn text-sm font-medium text-center px-4 py-2 no-print" role="status">
      MOCK ELECTION: this is a practice run. Everything recorded is deleted when the mock ends (Settings).
    </div>
  );
}
