import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { LogOut, User as UserIcon, Shield, Clock, Download } from 'lucide-react'
import { usePWA } from '../../hooks/usePWA'

export const Navbar: React.FC = () => {
  const { user, profile, role, signOut, isAuthenticated } = useAuth()
  const { isInstallable, installPWA } = usePWA()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-700 text-white shadow-md shadow-sky-600/20">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-slate-900">
              Milestone Consultancy
            </span>
            <span className="block text-xs font-medium text-slate-500">
              Attendance System
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          {isInstallable && (
            <button
              onClick={installPWA}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Install App
            </button>
          )}

          {isAuthenticated && (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-sm font-semibold text-slate-800">
                  {profile?.full_name || user?.email}
                </span>
                <span className="inline-flex items-center justify-end gap-1 text-xs font-medium">
                  {role === 'admin' && (
                    <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                      <Shield className="h-3 w-3" /> ADMIN
                    </span>
                  )}
                  {role === 'employee' && (
                    <span className="inline-flex items-center gap-1 text-slate-600 font-semibold">
                      <UserIcon className="h-3 w-3" /> EMPLOYEE
                    </span>
                  )}
                  {!role && (
                    <span className="text-amber-600 font-medium text-[11px]">
                      Verifying...
                    </span>
                  )}
                </span>
              </div>

              <button
                onClick={handleLogout}
                title="Sign out"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-rose-600 transition-colors cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
