import React from 'react'
import { useAuth } from '../../hooks/useAuth'
import { Clock, MapPin, CheckCircle2, User } from 'lucide-react'

export const EmployeeDashboardPage: React.FC = () => {
  const { profile, user } = useAuth()

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-sky-950 p-6 sm:p-8 text-white shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/20 px-3 py-1 text-xs font-semibold text-sky-300">
              <Clock className="h-3 w-3" /> Production Foundation Ready
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Welcome, {profile?.full_name || user?.email || 'Employee'}
            </h1>
            <p className="text-sm text-slate-300">
              Milestone Consultancy • Attendance Portal
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-sky-300 bg-white/10 backdrop-blur-xs px-3.5 py-2 rounded-xl border border-white/10 w-fit">
            <User className="h-4 w-4" />
            Role: <span className="font-semibold text-white uppercase">{profile?.role || 'Employee'}</span>
          </div>
        </div>
      </div>

      {/* Overview Cards (Foundation layout) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-sky-50 p-2.5 text-sky-600">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Assigned Site</p>
              <p className="text-base font-bold text-slate-900">Configured via Supabase</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Geofence Status</p>
              <p className="text-base font-bold text-slate-900">Awaiting Location</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Today's Duration</p>
              <p className="text-base font-bold text-slate-900">0 hrs 00 mins</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

