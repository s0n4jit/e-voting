import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  ShieldCheckIcon,
  ArchiveBoxIcon,
  UserGroupIcon,
  DocumentMagnifyingGlassIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  CheckCircleIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';

export const Navbar = () => {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navLinkClass = ({ isActive }) =>
    `inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-primary-50 text-primary-700 font-semibold'
        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
    }`;

  const mobileNavLinkClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-base font-medium transition-colors ${
      isActive
        ? 'bg-primary-50 text-primary-700 font-semibold'
        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
    }`;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-8">
            <Link
              to={role === 'admin' ? '/admin/dashboard' : '/voter/dashboard'}
              className="flex items-center gap-3 group"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary-700 to-primary-500 flex items-center justify-center text-white shadow-md shadow-primary-500/20 group-hover:scale-105 transition-transform">
                <ShieldCheckIcon className="w-6 h-6" />
              </div>
              <div>
                <span className="font-extrabold text-gray-900 tracking-tight text-lg flex items-center gap-1.5">
                  Campus <span className="text-primary-600">eVote</span>
                </span>
                <span className="text-[10px] text-gray-400 font-medium block leading-none tracking-wider uppercase">
                  Secure Ballot System
                </span>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1">
              {role === 'admin' ? (
                <>
                  <NavLink to="/admin/dashboard" className={navLinkClass}>
                    Dashboard
                  </NavLink>
                  <NavLink to="/admin/elections" className={navLinkClass}>
                    <ArchiveBoxIcon className="w-4 h-4" />
                    Elections
                  </NavLink>
                  <NavLink to="/admin/voters" className={navLinkClass}>
                    <UserGroupIcon className="w-4 h-4" />
                    Voters
                  </NavLink>
                  <NavLink to="/admin/audit" className={navLinkClass}>
                    <DocumentMagnifyingGlassIcon className="w-4 h-4" />
                    Audit Log
                  </NavLink>
                </>
              ) : (
                <>
                  <NavLink to="/voter/dashboard" className={navLinkClass}>
                    <CheckCircleIcon className="w-4 h-4" />
                    Elections & Ballot
                  </NavLink>
                </>
              )}
            </nav>
          </div>

          {/* User info & Logout */}
          <div className="hidden md:flex items-center gap-4">
            <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
              <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 font-bold flex items-center justify-center text-sm border border-primary-200">
                {user?.name ? user.name.charAt(0).toUpperCase() : (role === 'admin' ? 'A' : 'V')}
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-900 leading-tight">
                  {user?.name || user?.student_id || 'User'}
                </p>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase tracking-wider ${
                      role === 'admin'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {role || 'Voter'}
                  </span>
                  {user?.student_id && (
                    <span className="text-xs text-gray-400 font-mono">
                      {user.student_id}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="btn btn-ghost btn-sm text-gray-500 hover:text-danger-600 gap-1.5"
              title="Sign out of your account"
            >
              <ArrowRightOnRectangleIcon className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>

          {/* Mobile menu trigger */}
          <div className="flex md:hidden items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <XMarkIcon className="w-6 h-6" />
              ) : (
                <Bars3Icon className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-gray-200 bg-white px-4 pt-2 pb-4 space-y-3">
          <div className="py-2 border-b border-gray-100 flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">{user?.name || user?.student_id}</p>
              <p className="text-xs text-gray-500 capitalize">{role} Account</p>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {role}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            {role === 'admin' ? (
              <>
                <NavLink
                  to="/admin/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className={mobileNavLinkClass}
                >
                  Dashboard
                </NavLink>
                <NavLink
                  to="/admin/elections"
                  onClick={() => setMobileMenuOpen(false)}
                  className={mobileNavLinkClass}
                >
                  <ArchiveBoxIcon className="w-5 h-5" />
                  Elections
                </NavLink>
                <NavLink
                  to="/admin/voters"
                  onClick={() => setMobileMenuOpen(false)}
                  className={mobileNavLinkClass}
                >
                  <UserGroupIcon className="w-5 h-5" />
                  Voters
                </NavLink>
                <NavLink
                  to="/admin/audit"
                  onClick={() => setMobileMenuOpen(false)}
                  className={mobileNavLinkClass}
                >
                  <DocumentMagnifyingGlassIcon className="w-5 h-5" />
                  Audit Log
                </NavLink>
              </>
            ) : (
              <>
                <NavLink
                  to="/voter/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className={mobileNavLinkClass}
                >
                  <CheckCircleIcon className="w-5 h-5" />
                  Active Elections
                </NavLink>
              </>
            )}
          </div>

          <div className="pt-2 border-t border-gray-100">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                handleLogout();
              }}
              className="w-full btn btn-secondary text-danger-600 hover:bg-danger-50 border-danger-200 justify-center gap-2"
            >
              <ArrowRightOnRectangleIcon className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
