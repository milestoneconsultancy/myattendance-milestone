import React from 'react'
import { useAuth } from '../../hooks/useAuth'
import { Shield, Building2, Users, FileSpreadsheet, MapPin } from 'lucide-react'

export const AdminDashboardPage: React.FC = () => {
  const { profile, user } = useAuth()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-950 p-6 sm:p-8 text-white shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">
              <Shield className="h-3 w-3" /> Admin Console
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Admin Overview • Milestone Consultancy
            </h1>
            <p className="text-sm text-slate-300">
              Signed in as {profile?.full_name || user?.email}
            </p>
          </div>
        </div>
      </div>

      {/* Metric Cards (Foundation) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Projects / Sites</span>
            <div className="rounded-lg bg-sky-50 p-2 text-sky-600">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">0</p>
          <span className="text-xs text-slate-400">Configured projects</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Total Employees</span>
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">0</p>
          <span className="text-xs text-slate-400">Registered staff</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Geofences</span>
            <div className="rounded-lg bg-purple-50 p-2 text-purple-600">
              <MapPin className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">0</p>
          <span className="text-xs text-slate-400">Active boundaries</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Today's Attendance</span>
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">0</p>
          <span className="text-xs text-slate-400">Present today</span>
        </div>
      </div>
    </div>
  )
}

