import React from 'react'
import { useAuth } from '../../hooks/useAuth'
import { usePWA } from '../../hooks/usePWA'
import {
  Settings,
  Shield,
  User,
  Mail,
  Building2,
  Download,
  Wifi,
  WifiOff,
  CheckCircle2,
  Clock
} from 'lucide-react'

export const AdminSettingsPage: React.FC = () => {
  const { profile, user } = useAuth()
  const { isInstallable, isOnline, installPWA } = usePWA()

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 rounded-2xl bg-white p-6 border border-slate-200 shadow-xs">
        <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700">
          <Settings className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Admin Profile & System Settings</h1>
          <p className="text-xs text-slate-500">
            System configuration, active administrative profile, and application details.
          </p>
        </div>
      </div>

      {/* Admin Profile Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <User className="h-4 w-4 text-sky-600" />
            Administrator Profile
          </h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
            <Shield className="h-3 w-3" /> System Admin
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <span className="block font-bold text-slate-500 uppercase text-[10px] mb-1">Full Name</span>
            <span className="font-semibold text-slate-900 text-sm">{profile?.full_name || 'Admin User'}</span>
          </div>

          <div>
            <span className="block font-bold text-slate-500 uppercase text-[10px] mb-1">Email Address</span>
            <span className="font-mono text-slate-800 text-sm flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-slate-400" />
              {user?.email}
            </span>
          </div>

          <div>
            <span className="block font-bold text-slate-500 uppercase text-[10px] mb-1">Company / Organization</span>
            <span className="font-semibold text-slate-800 flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              Milestone Consultancy
            </span>
          </div>

          <div>
            <span className="block font-bold text-slate-500 uppercase text-[10px] mb-1">Account Status</span>
            <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" /> Active (Verified)
            </span>
          </div>
        </div>
      </div>

      {/* PWA & System Information Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
          Application & PWA Configuration
        </h2>

        <div className="space-y-3 text-xs">
          <div className="flex items-center justify-between py-2 border-b border-slate-50">
            <span className="text-slate-600 font-medium">Network Connection:</span>
            <span className="flex items-center gap-1.5 font-semibold">
              {isOnline ? (
                <span className="inline-flex items-center gap-1 text-emerald-600">
                  <Wifi className="h-4 w-4" /> Online (Connected)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-rose-600">
                  <WifiOff className="h-4 w-4" /> Offline
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-slate-50">
            <span className="text-slate-600 font-medium">System Timezone:</span>
            <span className="font-mono text-slate-800 font-semibold flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              Asia/Kolkata (IST)
            </span>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <span className="block text-slate-800 font-semibold">Progressive Web App (PWA)</span>
              <span className="text-slate-500 text-[11px]">Install as desktop or mobile application</span>
            </div>
            {isInstallable && (
              <button
                onClick={installPWA}
                className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-700 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Install Application</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

