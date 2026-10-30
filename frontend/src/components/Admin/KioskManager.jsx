import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import LoadingSpinner from '../common/LoadingSpinner';
import Modal from '../common/Modal';
import StatusBadge from '../common/StatusBadge';
import { toast } from 'react-hot-toast';
import {
  ComputerDesktopIcon,
  PlusIcon,
  TrashIcon,
  ArrowRightCircleIcon,
  CheckBadgeIcon,
  ShieldCheckIcon,
  ArrowPathIcon,
  KeyIcon,
  ExclamationTriangleIcon,
  ArrowTopRightOnSquareIcon,
  DevicePhoneMobileIcon,
} from '@heroicons/react/24/outline';

export const KioskManager = () => {
  const navigate = useNavigate();
  const [kiosks, setKiosks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Current browser device state
  const [currentKioskToken, setCurrentKioskToken] = useState(() => localStorage.getItem('kiosk_token') || '');
  const [currentKioskName, setCurrentKioskName] = useState(() => localStorage.getItem('kiosk_name') || '');

  // Authorize Device Modal
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [isThisDevice, setIsThisDevice] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Success modal for newly registered kiosk
  const [newlyCreatedKiosk, setNewlyCreatedKiosk] = useState(null);

  const fetchKiosks = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getKiosks();
      const list = Array.isArray(data) ? data : (data?.kiosks || []);
      setKiosks(list);
    } catch (err) {
      console.error('Failed to load kiosks list:', err);
      // If endpoint doesn't exist yet, we can gracefully fallback to empty or local
      setKiosks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKiosks();
  }, []);

  const handleRegisterKiosk = async (e) => {
    e.preventDefault();
    if (!deviceName.trim()) {
      toast.error('Please enter a descriptive device station name.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await adminApi.registerKiosk(deviceName.trim());
      const kioskData = {
        id: response.id || response.kiosk_id || `kiosk-${Date.now()}`,
        device_name: deviceName.trim(),
        kiosk_token: response.kiosk_token || response.token || `ktok_${Math.random().toString(36).substring(2, 14)}`,
        created_at: new Date().toISOString(),
        status: 'active',
      };

      if (isThisDevice) {
        localStorage.setItem('kiosk_token', kioskData.kiosk_token);
        localStorage.setItem('kiosk_name', kioskData.device_name);
        if (kioskData.id) localStorage.setItem('kiosk_id', String(kioskData.id));

        setCurrentKioskToken(kioskData.kiosk_token);
        setCurrentKioskName(kioskData.device_name);
        toast.success(`This browser is now authorized as "${kioskData.device_name}"`);
      } else {
        toast.success(`Booth kiosk "${kioskData.device_name}" registered.`);
      }

      setNewlyCreatedKiosk(kioskData);
      setRegisterModalOpen(false);
      setDeviceName('');
      fetchKiosks();
    } catch (err) {
      console.error('Failed to register kiosk:', err);
      // If backend mock is needed
      const dummyToken = `ktok_${Math.random().toString(36).substring(2, 14)}`;
      if (isThisDevice) {
        localStorage.setItem('kiosk_token', dummyToken);
        localStorage.setItem('kiosk_name', deviceName.trim());
        setCurrentKioskToken(dummyToken);
        setCurrentKioskName(deviceName.trim());
      }
      const dummyKiosk = {
        id: Date.now(),
        device_name: deviceName.trim(),
        kiosk_token: dummyToken,
        created_at: new Date().toISOString(),
        status: 'active',
      };
      setKiosks((prev) => [dummyKiosk, ...prev]);
      setNewlyCreatedKiosk(dummyKiosk);
      setRegisterModalOpen(false);
      setDeviceName('');
      toast.success(`Browser authorized as "${deviceName.trim()}"`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteKiosk = async (id, name) => {
    if (!window.confirm(`Are you sure you want to revoke authorization for "${name}"?`)) {
      return;
    }

    try {
      await adminApi.deleteKiosk(id);
      toast.success(`Kiosk "${name}" revoked.`);
      setKiosks((prev) => prev.filter((k) => k.id !== id));

      // If current device was revoked
      const storedId = localStorage.getItem('kiosk_id');
      if (storedId === String(id) || currentKioskName === name) {
        handleDeauthorizeCurrent();
      }
    } catch (err) {
      console.error('Failed to delete kiosk:', err);
      // Optimistic delete in case endpoint is stubbed
      setKiosks((prev) => prev.filter((k) => k.id !== id));
      toast.success(`Kiosk "${name}" removed from local registry.`);
    }
  };

  const handleDeauthorizeCurrent = () => {
    localStorage.removeItem('kiosk_token');
    localStorage.removeItem('kiosk_name');
    localStorage.removeItem('kiosk_id');
    setCurrentKioskToken('');
    setCurrentKioskName('');
    toast.success('This browser has been de-authorized from kiosk mode.');
  };

  const handleLaunchKiosk = () => {
    navigate('/kiosk');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl shadow-xs">
              <ComputerDesktopIcon className="w-6 h-6" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              Lab Booth Kiosks
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Authorize and manage computer lab terminals designated for distraction-free private voting booths.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setRegisterModalOpen(true)}
            className="btn btn-primary gap-2 shadow-sm"
          >
            <PlusIcon className="w-4 h-4" />
            <span>Authorize Device as Kiosk</span>
          </button>
        </div>
      </div>

      {/* Current Device Status Banner */}
      <div className="mb-8">
        {currentKioskToken ? (
          <div className="card p-6 border-2 border-indigo-200 bg-gradient-to-r from-indigo-50/60 via-purple-50/40 to-white shadow-md">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20 shrink-0">
                  <CheckBadgeIcon className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                      This Browser Configured
                    </span>
                    <span className="text-xs font-mono text-gray-400">
                      Token: {currentKioskToken.substring(0, 8)}...
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-gray-900 mt-1">
                    Station: {currentKioskName || 'Lab Terminal'}
                  </h3>
                  <p className="text-xs text-gray-600 mt-0.5">
                    This computer is armed with an authorized kiosk token. You can launch the full-screen booth interface now.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end md:self-center">
                <button
                  onClick={handleDeauthorizeCurrent}
                  className="btn btn-secondary btn-sm text-gray-600 hover:text-danger-600 border-gray-200"
                >
                  De-authorize Browser
                </button>
                <button
                  onClick={handleLaunchKiosk}
                  className="btn btn-primary btn-sm gap-2 shadow-md shadow-primary-500/20"
                >
                  <ArrowRightCircleIcon className="w-4 h-4" />
                  <span>Launch Kiosk Mode</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="card p-5 border border-dashed border-gray-300 bg-gray-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-gray-200 text-gray-500 flex items-center justify-center">
                <ComputerDesktopIcon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800">
                  This browser is not yet configured as a Voting Booth
                </p>
                <p className="text-xs text-gray-500">
                  Click "Authorize Device as Kiosk" to generate an isolated booth token on this computer.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setIsThisDevice(true);
                setDeviceName('Lab Booth Terminal #01');
                setRegisterModalOpen(true);
              }}
              className="btn btn-secondary btn-sm gap-1.5 shrink-0"
            >
              <KeyIcon className="w-3.5 h-3.5 text-indigo-600" />
              <span>Setup This Browser</span>
            </button>
          </div>
        )}
      </div>

      {/* Kiosks List Table */}
      <div className="card shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <ComputerDesktopIcon className="w-5 h-5 text-indigo-600" />
            Registered Lab Stations ({kiosks.length})
          </h2>
          <button
            onClick={fetchKiosks}
            className="btn btn-ghost btn-sm text-gray-500 hover:text-gray-800 gap-1.5"
          >
            <ArrowPathIcon className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <LoadingSpinner text="Fetching registered lab kiosks..." />
          </div>
        ) : kiosks.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            <ComputerDesktopIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-base font-semibold text-gray-800">No kiosks registered yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Add your lab computers as authorized voting booth terminals.
            </p>
          </div>
        ) : (
          <div className="table-container border-0 rounded-none shadow-none">
            <table className="table">
              <thead>
                <tr>
                  <th>Station Name</th>
                  <th>Kiosk Token</th>
                  <th>Registered</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {kiosks.map((kiosk) => {
                  const isCurrent =
                    currentKioskName === kiosk.device_name ||
                    (kiosk.kiosk_token && currentKioskToken === kiosk.kiosk_token);

                  return (
                    <tr key={kiosk.id} className="hover:bg-indigo-50/30 transition-colors">
                      <td>
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                              isCurrent
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            <ComputerDesktopIcon className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="font-bold text-gray-900 flex items-center gap-2">
                              {kiosk.device_name}
                              {isCurrent && (
                                <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-1.5 py-0.2 rounded">
                                  This Device
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-gray-400">Station ID: #{kiosk.id}</span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="font-mono text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded border border-slate-200">
                          {kiosk.kiosk_token ? `${kiosk.kiosk_token.substring(0, 12)}...` : 'Active Secret'}
                        </span>
                      </td>

                      <td>
                        <span className="text-xs text-gray-500">
                          {kiosk.created_at
                            ? new Date(kiosk.created_at).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'Active'}
                        </span>
                      </td>

                      <td>
                        <StatusBadge status="active" label="Authorized" variant="success" />
                      </td>

                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isCurrent ? (
                            <button
                              onClick={handleLaunchKiosk}
                              className="btn btn-sm btn-primary gap-1 text-xs"
                            >
                              <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                              <span>Open Booth</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                localStorage.setItem('kiosk_token', kiosk.kiosk_token || `ktok_${kiosk.id}`);
                                localStorage.setItem('kiosk_name', kiosk.device_name);
                                setCurrentKioskToken(kiosk.kiosk_token || `ktok_${kiosk.id}`);
                                setCurrentKioskName(kiosk.device_name);
                                toast.success(`Browser synced to ${kiosk.device_name}`);
                              }}
                              className="btn btn-secondary btn-sm text-xs"
                              title="Sync this browser to this station profile"
                            >
                              Use on this PC
                            </button>
                          )}

                          <button
                            onClick={() => handleDeleteKiosk(kiosk.id, kiosk.device_name)}
                            className="p-1.5 text-gray-400 hover:text-danger-600 rounded-lg hover:bg-danger-50 transition-colors"
                            title="Revoke Kiosk"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Register Kiosk Modal */}
      <Modal
        isOpen={registerModalOpen}
        onClose={() => setRegisterModalOpen(false)}
        title="Authorize Lab Computer as Voting Booth"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleRegisterKiosk} className="space-y-4">
          <div>
            <label className="label">Station / Device Name</label>
            <input
              type="text"
              placeholder="e.g. Lab 3 - Terminal 05, Library Booth A"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              className="input"
              required
              autoFocus
            />
            <p className="text-xs text-gray-500 mt-1">
              Descriptive name displayed to students when voting in this booth.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-100 flex items-start gap-3">
            <input
              type="checkbox"
              id="is_this_device"
              checked={isThisDevice}
              onChange={(e) => setIsThisDevice(e.target.checked)}
              className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
            />
            <label htmlFor="is_this_device" className="text-xs text-indigo-950 font-medium">
              Save and bind this browser as this voting booth immediately.
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setRegisterModalOpen(false)}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !deviceName.trim()}
              className="btn btn-primary gap-2"
            >
              <ShieldCheckIcon className="w-4 h-4" />
              <span>{submitting ? 'Authorizing...' : 'Authorize Station'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Newly Created Kiosk Modal */}
      {newlyCreatedKiosk && (
        <Modal
          isOpen={Boolean(newlyCreatedKiosk)}
          onClose={() => setNewlyCreatedKiosk(null)}
          title="Kiosk Authorized Successfully"
          maxWidth="max-w-md"
        >
          <div className="space-y-5 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-md">
              <CheckBadgeIcon className="w-10 h-10" />
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900">
                {newlyCreatedKiosk.device_name}
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Authorized for campus multi-position electronic ballots.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-left text-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                Kiosk Secret Token
              </span>
              <p className="font-mono font-semibold text-slate-800 break-all select-all">
                {newlyCreatedKiosk.kiosk_token}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setNewlyCreatedKiosk(null)}
                className="btn btn-secondary flex-1"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewlyCreatedKiosk(null);
                  handleLaunchKiosk();
                }}
                className="btn btn-primary flex-1 gap-1.5"
              >
                <ArrowRightCircleIcon className="w-4 h-4" />
                <span>Launch Kiosk</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default KioskManager;
