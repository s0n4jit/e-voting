import React, { useState, useEffect } from 'react';
import { authApi } from '../../api/authApi';
import LoadingSpinner from '../common/LoadingSpinner';
import { toast } from 'react-hot-toast';
import {
  ShieldCheckIcon,
  XMarkIcon,
  QrCodeIcon,
  KeyIcon,
  ClipboardDocumentIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  DevicePhoneMobileIcon,
} from '@heroicons/react/24/outline';

export const TwoFactorSetupModal = ({ isOpen, onClose, user, onStatusChange }) => {
  const [loading, setLoading] = useState(false);
  const [setupData, setSetupData] = useState(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disabling, setDisabling] = useState(false);
  const [showDisableForm, setShowDisableForm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSetupData();
      setShowDisableForm(false);
      setVerifyCode('');
      setDisablePassword('');
    }
  }, [isOpen]);

  const loadSetupData = async () => {
    try {
      setLoading(true);
      const res = await authApi.setupTotp();
      setSetupData(res);
    } catch (err) {
      console.error('Failed to load TOTP setup:', err);
      toast.error(err.response?.data?.message || 'Failed to initialize 2FA setup.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopySecret = () => {
    if (setupData?.secret) {
      navigator.clipboard.writeText(setupData.secret);
      setCopied(true);
      toast.success('Secret key copied to clipboard.');
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleVerifyAndEnable = async (e) => {
    e.preventDefault();
    const clean = verifyCode.trim();
    if (clean.length !== 6) {
      toast.error('Please enter the 6-digit rolling code from your Authenticator app.');
      return;
    }

    setVerifying(true);
    try {
      const res = await authApi.enableTotp(clean);
      toast.success(res.message || 'Two-Factor Authentication is now active!');
      if (onStatusChange) onStatusChange(true);
      onClose();
    } catch (err) {
      console.error('TOTP enable error:', err);
      toast.error(err.response?.data?.message || 'Invalid verification code. Please check your phone time.');
    } finally {
      setVerifying(false);
    }
  };

  const handleDisable = async (e) => {
    e.preventDefault();
    if (!disablePassword) {
      toast.error('Please enter your account password to confirm.');
      return;
    }

    setDisabling(true);
    try {
      const res = await authApi.disableTotp(disablePassword);
      toast.success(res.message || '2FA deactivated.');
      if (onStatusChange) onStatusChange(false);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to disable 2FA.');
    } finally {
      setDisabling(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <ShieldCheckIcon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base tracking-tight text-white flex items-center gap-2">
                Two-Factor Authentication (2FA)
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                  RFC 6238
                </span>
              </h3>
              <p className="text-xs text-indigo-200/80 mt-0.5">
                Google Authenticator • Microsoft Authenticator • Authy
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {loading ? (
            <div className="py-12 text-center">
              <LoadingSpinner size="lg" text="Generating cryptographic 2FA key..." />
            </div>
          ) : setupData?.otp_enabled && !showDisableForm ? (
            /* Already Active State */
            <div className="space-y-5 text-center py-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircleIcon className="w-10 h-10" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-slate-900">2FA Protection is Active</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
                  Your account is secured with time-based one-time passwords (TOTP). Future sign-ins will require a 6-digit rolling code.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left text-xs space-y-1.5">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Assigned Account:</span>
                  <span className="font-mono font-bold text-slate-800">{user?.student_id || setupData?.student_id}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Security Standard:</span>
                  <span className="font-mono font-bold text-emerald-600">RFC 6238 (30s Rolling)</span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowDisableForm(true)}
                  className="px-4 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors border border-rose-200"
                >
                  Deactivate 2FA
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          ) : showDisableForm ? (
            /* Disable Form */
            <form onSubmit={handleDisable} className="space-y-4">
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                <p className="font-bold flex items-center gap-1.5">
                  <ExclamationTriangleIcon className="w-4 h-4 text-rose-600" />
                  Deactivating 2FA
                </p>
                <p className="mt-1 text-rose-700/90 leading-relaxed">
                  Removing 2FA reduces your account security. Please verify your current account password to proceed.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Confirm Account Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="Enter your current password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDisableForm(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={disabling || !disablePassword}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition-all disabled:opacity-50"
                >
                  {disabling ? 'Deactivating...' : 'Confirm Deactivation'}
                </button>
              </div>
            </form>
          ) : (
            /* First Time Setup View */
            <div className="space-y-6">
              {/* Step 1: Scan QR */}
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600 mb-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[11px]">
                    1
                  </span>
                  Scan with Authenticator App
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  Open Google Authenticator, Microsoft Authenticator, or Authy on your mobile phone and scan this QR code:
                </p>

                {setupData?.qr_code && (
                  <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-200 shrink-0">
                      <img
                        src={setupData.qr_code}
                        alt="2FA QR Code"
                        className="w-36 h-36 object-contain"
                      />
                    </div>
                    <div className="text-xs space-y-2 text-slate-600">
                      <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                        <DevicePhoneMobileIcon className="w-4 h-4 text-indigo-600" />
                        Supported Apps:
                      </p>
                      <ul className="list-disc pl-4 space-y-1 text-slate-500 text-[11px]">
                        <li>Google Authenticator (Android/iOS)</li>
                        <li>Microsoft Authenticator</li>
                        <li>Authy / 2FAS / 1Password</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              {/* Step 2: Manual Key Fallback */}
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600 mb-1.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[11px]">
                    2
                  </span>
                  Or Enter Secret Key Manually
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 tracking-wider truncate">
                    {setupData?.secret}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopySecret}
                    className="px-3 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
                    title="Copy Secret"
                  >
                    <ClipboardDocumentIcon className="w-4 h-4" />
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Step 3: Verify Code */}
              <form onSubmit={handleVerifyAndEnable} className="space-y-4 pt-2 border-t border-slate-200">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[11px]">
                    3
                  </span>
                  Confirm Setup with 6-Digit Code
                </div>
                <p className="text-xs text-slate-500">
                  Enter the live 6-digit rolling code displayed in your authenticator app to finalize binding:
                </p>

                <div className="relative">
                  <KeyIcon className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="e.g. 481920"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full bg-slate-50 border-2 border-slate-300 rounded-xl pl-11 pr-4 py-3 text-center font-mono font-bold text-xl tracking-widest text-slate-900 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20"
                    required
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={verifying || verifyCode.length !== 6}
                    className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 flex items-center gap-2 transition-all disabled:opacity-50"
                  >
                    {verifying ? (
                      <>
                        <LoadingSpinner size="sm" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircleIcon className="w-4 h-4" />
                        <span>Activate 2FA</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TwoFactorSetupModal;
