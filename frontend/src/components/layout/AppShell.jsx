import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../api/authApi';
import TwoFactorSetupModal from '../Auth/TwoFactorSetupModal';
import {
  ShieldCheckIcon,
  ChartBarIcon,
  TicketIcon,
  UserGroupIcon,
  DocumentTextIcon,
  ComputerDesktopIcon,
  IdentificationIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  BuildingLibraryIcon,
  SparklesIcon,
  KeyIcon,
  CheckBadgeIcon,
  ArrowTopRightOnSquareIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

export const AppShell = ({ children }) => {
  const { user, role, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeElection, setActiveElection] = useState(null);
  const [totpModalOpen, setTotpModalOpen] = useState(false);
  const [totpActive, setTotpActive] = useState(Boolean(user?.otp_enabled));
  const [currentTime, setCurrentTime] = useState('');

  // Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Active Election discovery
  useEffect(() => {
    authApi
      .getActiveElection()
      .then((data) => {
        if (data?.election) setActiveElection(data.election);
        else if (data?.elections?.[0]) setActiveElection(data.elections[0]);
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Role Navigation Items
  const adminNav = [
    { label: 'Executive Dashboard', path: '/admin/dashboard', icon: ChartBarIcon },
    { label: 'Polling Desk Verification', path: '/desk', icon: TicketIcon, highlight: true },
    { label: 'Election Audit Ledger', path: '/admin/audit-logs', icon: DocumentTextIcon },
    { label: 'Voter Registry & Import', path: '/admin/voters', icon: UserGroupIcon },
    { label: 'Portfolios & Candidates', path: '/admin/candidates', icon: BuildingLibraryIcon },
    { label: 'Election Slate Control', path: '/admin/elections', icon: SparklesIcon },
    { label: 'Kiosk Booth Devices', path: '/admin/kiosks', icon: ComputerDesktopIcon },
    { label: 'Polling Staff Accounts', path: '/admin/officers', icon: IdentificationIcon },
    {
      label: 'Live Tally & Results',
      path: activeElection ? `/voter/results/${activeElection.id}` : '/voter/results/2',
      icon: CheckBadgeIcon,
    },
  ];

  const deskNav = [
    { label: 'Voter Verification & Slips', path: '/desk', icon: TicketIcon, highlight: true },
    {
      label: 'Live Election Tally',
      path: activeElection ? `/voter/results/${activeElection.id}` : '/voter/results/2',
      icon: CheckBadgeIcon,
    },
  ];

  const voterNav = [
    { label: 'Voter Overview', path: '/voter/dashboard', icon: ChartBarIcon },
    {
      label: 'Election Results',
      path: activeElection ? `/voter/results/${activeElection.id}` : '/voter/results/2',
      icon: CheckBadgeIcon,
    },
  ];

  const navItems = role === 'admin' ? adminNav : role === 'polling_officer' ? deskNav : voterNav;

  // Resolve current page breadcrumb
  const currentNav = navItems.find((item) => location.pathname === item.path) || {
    label: role === 'polling_officer' ? 'Polling Desk' : 'Campus Portal',
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col md:flex-row antialiased font-sans">
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Modern Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col justify-between transform transition-transform duration-200 ease-in-out md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:static md:w-68 lg:w-72 shrink-0`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-primary-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
                <ShieldCheckIcon className="w-6 h-6" />
              </div>
              <div>
                <h1 className="font-black text-sm tracking-tight text-white flex items-center gap-1.5">
                  Campus E-Voting
                </h1>
                <p className="text-[11px] font-mono text-slate-400">Institutional Portal</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white md:hidden"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          {/* Active Election Badge */}
          {activeElection && (
            <div className="mt-4 p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 mt-1 shrink-0 animate-pulse" />
              <div className="overflow-hidden">
                <p className="text-[10px] uppercase font-bold tracking-wider text-emerald-400">
                  Active Ballot Slate
                </p>
                <p className="text-xs font-semibold text-white truncate" title={activeElection.title}>
                  {activeElection.title}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="px-3 pb-2 text-[10px] uppercase font-bold tracking-wider text-slate-400">
            {role === 'admin' ? 'Electoral Administration' : 'Polling Station'}
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-bold'
                    : item.highlight
                    ? 'bg-slate-800/60 text-indigo-300 hover:bg-slate-800 hover:text-white border border-indigo-500/20'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-white' : item.highlight ? 'text-indigo-400' : 'text-slate-500'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer: User Profile, 2FA Pill, and Logout */}
        <div className="p-4 border-t border-slate-800 space-y-3 bg-slate-950/40">
          {/* User ID & Role */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold font-mono text-indigo-300 shrink-0">
                {(user?.student_id || 'ID').slice(0, 3)}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-white truncate">{user?.name || user?.student_id}</p>
                <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  {role === 'admin'
                    ? 'Chief Officer'
                    : role === 'polling_officer'
                    ? 'Desk Staff'
                    : 'Voter'}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
              title="Sign Out"
            >
              <ArrowRightOnRectangleIcon className="w-4 h-4" />
            </button>
          </div>

          {/* 2FA Security Button */}
          <button
            onClick={() => setTotpModalOpen(true)}
            className="w-full py-1.5 px-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-[11px] font-medium flex items-center justify-between transition-colors text-slate-300"
          >
            <span className="flex items-center gap-1.5">
              <KeyIcon className="w-3.5 h-3.5 text-indigo-400" />
              <span>2FA Security</span>
            </span>
            <span
              className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                totpActive
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              {totpActive ? 'TOTP Active' : 'Configure'}
            </span>
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top App Header Bar */}
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 md:hidden"
            >
              <Bars3Icon className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 hidden sm:inline">Campus System</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <span className="font-bold text-slate-800">{currentNav.label}</span>
            </div>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-3 text-xs">
            {/* Live Clock */}
            <div className="hidden lg:flex items-center gap-1.5 font-mono text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
              <ClockIcon className="w-3.5 h-3.5 text-indigo-500" />
              <span>{currentTime}</span>
            </div>

            {/* Launch Kiosk Terminal Shortcut */}
            <Link
              to="/kiosk"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
              title="Open Voting Booth in new window"
            >
              <span>Voting Booth</span>
              <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 text-slate-400" />
            </Link>
          </div>
        </header>

        {/* Page Content Viewport */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>

      {/* 2FA Setup & Security Modal */}
      <TwoFactorSetupModal
        isOpen={totpModalOpen}
        onClose={() => setTotpModalOpen(false)}
        user={user}
        onStatusChange={(active) => setTotpActive(active)}
      />
    </div>
  );
};

export default AppShell;
