import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRightOnRectangleIcon,
  AcademicCapIcon,
  ArchiveBoxArrowDownIcon,
  Bars3Icon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  ComputerDesktopIcon,
  DocumentTextIcon,
  IdentificationIcon,
  KeyIcon,
  PresentationChartBarIcon,
  RectangleStackIcon,
  UserGroupIcon,
  UserPlusIcon,
  XMarkIcon,
  CheckBadgeIcon,
  TicketIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthContext';
import { BrandMark, ThemeToggle, UserAvatar } from '../ui';
import { useBrand } from '../../context/BrandContext';
import StatusBadge from '../common/StatusBadge';
import MockBanner from './MockBanner';

const ROLE_LABEL = { admin: 'Election officer', polling_officer: 'Desk officer' };

const navFor = (role) => {
  if (role === 'admin') {
    return [
      { label: 'Overview', to: '/admin/dashboard', icon: ChartBarIcon },
      { label: 'Elections', to: '/admin/elections', icon: RectangleStackIcon },
      { label: 'Candidates', to: '/admin/candidates', icon: UserGroupIcon },
      { label: 'Registrations', to: '/desk/registrations', icon: ClipboardDocumentListIcon },
      { label: 'Desk officers', to: '/admin/officers', icon: IdentificationIcon },
      { label: 'Programmes', to: '/admin/programmes', icon: AcademicCapIcon },
      { label: 'Voting booths', to: '/admin/kiosks', icon: ComputerDesktopIcon },
      { label: 'Results', to: '/admin/results', icon: PresentationChartBarIcon },
      { label: 'Audit log', to: '/admin/audit', icon: DocumentTextIcon },
      { label: 'Settings', to: '/admin/settings', icon: Cog6ToothIcon },
      { label: 'Backup and reset', to: '/admin/system', icon: ArchiveBoxArrowDownIcon },
    ];
  }
  return [
    { label: 'Register student', to: '/desk', icon: UserPlusIcon, end: true },
    { label: 'Registrations', to: '/desk/registrations', icon: ClipboardDocumentListIcon },
    { label: 'Voter check-in', to: '/desk/check-in', icon: TicketIcon },
  ];
};

export const AppShell = ({ children }) => {
  const { user, role, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { branding } = useBrand();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === '1');
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      localStorage.setItem('sidebar-collapsed', c ? '0' : '1');
      return !c;
    });

  useEffect(() => setOpen(false), [location.pathname]);

  const items = navFor(role);

  const signOut = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-bg text-fg md:flex">
      {open && <div className="fixed inset-0 z-40 bg-black/40 md:hidden animate-fade-in" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-primary-900 text-white flex flex-col shadow-modal transition-[transform,width] duration-300 ease-out overflow-hidden
          md:sticky md:top-4 md:m-4 md:mr-0 md:h-[calc(100vh-2rem)] ${collapsed ? 'md:w-20' : 'md:w-64'} md:rounded-2xl md:translate-x-0 md:self-start shrink-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Primary"
      >
        <div className={`py-5 flex items-center justify-between gap-2 border-b border-white/10 px-5 ${collapsed ? 'md:justify-center md:px-0' : ''}`}>
          <BrandMark size="lg" showName={false} onDark />
          <button className="p-1.5 rounded-lg text-white/70 hover:bg-white/10 md:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {items.map(({ label, to, icon: Icon, end }) => (
            <NavLink key={label} to={to} end={end} title={label} className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 ${collapsed ? 'md:justify-center md:px-0' : ''} rounded-lg text-sm font-medium border-l-4 transition duration-150 ${
                  isActive ? 'bg-white/15 text-white border-amber-400' : 'border-transparent text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }>
              <Icon className="w-5 h-5 shrink-0" />
              <span className={`truncate ${collapsed ? 'md:hidden' : ''}`}>{label}</span>
            </NavLink>
          ))}
        </nav>

        <button
          className={`hidden md:flex items-center gap-3 mx-3 mb-3 px-3 py-2.5 rounded-lg text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors ${collapsed ? 'justify-center px-0' : ''}`}
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronDoubleRightIcon className="w-5 h-5" /> : <><ChevronDoubleLeftIcon className="w-5 h-5" /> <span>Collapse</span></>}
        </button>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-[4.5rem] bg-bg/85 backdrop-blur border-b border-line px-4 sm:px-6 flex items-center justify-between">
          <button className="btn-ghost p-2 md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Bars3Icon className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1 px-3 md:px-0">
            <p className="text-base sm:text-lg font-semibold leading-tight truncate">{branding.system_name}</p>
            {branding.institution_name && <p className="text-xs sm:text-sm text-muted truncate">{branding.institution_name}</p>}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <span className="hidden sm:block w-px h-6 bg-line" aria-hidden="true" />
            <button
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-recessed transition-colors text-left"
              onClick={() => navigate('/profile')}
              title="My profile and password"
            >
              <UserAvatar user={user} />
              <span className="hidden sm:block min-w-0">
                <span className="block text-sm font-medium leading-tight truncate max-w-[11rem]">{user?.name}</span>
                <span className="block text-xs text-muted">{ROLE_LABEL[role]}</span>
              </span>
            </button>
            <button className="btn-secondary btn-sm" onClick={signOut}>
              <ArrowRightOnRectangleIcon className="w-4 h-4" /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        <MockBanner />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {/* key re-triggers the entrance animation on every route change */}
          <div key={location.pathname} className="animate-page-in">
            {children}
          </div>
        </main>
      </div>

    </div>
  );
};

export default AppShell;
