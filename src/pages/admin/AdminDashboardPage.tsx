import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import type { Project, Geofence } from '../../types/database.types'
import { StatusBadge } from '../../components/common/StatusBadge'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import {
  Building2,
  Users,
  MapPin,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  RefreshCw,
  Plus,
  ShieldAlert
} from 'lucide-react'

interface ProjectStats {
  project: Project
  geofence: Geofence | null
  totalAssignedEmployees: number
  presentCount: number
  absentCount: number
}

export const AdminDashboardPage: React.FC = () => {
  const { profile, user } = useAuth()

  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Overall metric counts
  const [totalProjects, setTotalProjects] = useState(0)
  const [totalActiveEmployees, setTotalActiveEmployees] = useState(0)
  const [totalGeofences, setTotalGeofences] = useState(0)
  const [todayPresent, setTodayPresent] = useState(0)
  const [todayAbsent, setTodayAbsent] = useState(0)
  const [currentlySignedIn, setCurrentlySignedIn] = useState(0)

  // Site-wise breakdown
  const [projectStats, setProjectStats] = useState<ProjectStats[]>([])

  // Current Indian Date (YYYY-MM-DD)
  const getTodayDateString = () => {
    const now = new Date()
    // Convert to Indian Standard Time (Asia/Kolkata)
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
    return formatter.format(now) // Returns YYYY-MM-DD
  }

  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true)
    setErrorMsg(null)

    const todayDate = getTodayDateString()

    try {
      // 1. Fetch Projects
      const { data: projectsData, error: projErr } = await supabase
        .from('projects')
        .select('*')
        .order('name', { ascending: true })

      if (projErr) throw projErr
      const allProjects = projectsData || []

      // 2. Fetch Active Employees count
      const { count: employeeCount, error: empErr } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'employee')
        .eq('is_active', true)

      if (empErr) throw empErr

      // 3. Fetch Geofences
      const { data: geofencesData, error: geoErr } = await supabase
        .from('geofences')
        .select('*')

      if (geoErr) throw geoErr
      const allGeofences = geofencesData || []

      // 4. Fetch Today's Daily Attendance records
      const { data: attendanceData, error: attErr } = await supabase
        .from('daily_attendance')
        .select('*')
        .eq('attendance_date', todayDate)

      if (attErr) throw attErr
      const allAttendance = attendanceData || []

      // 5. Fetch Assignments for project breakdown
      const { data: assignmentsData, error: assignErr } = await supabase
        .from('employee_project_assignments')
        .select('*')

      if (assignErr) throw assignErr
      const allAssignments = assignmentsData || []

      const present = allAttendance.filter((a) => a.status === 'present').length
      const absent = allAttendance.filter((a) => a.status === 'absent').length
      const signedIn = allAttendance.filter((a) => a.sign_in_at && !a.sign_out_at).length

      setTotalProjects(allProjects.length)
      setTotalActiveEmployees(employeeCount || 0)
      setTotalGeofences(allGeofences.filter((g) => g.is_active).length)
      setTodayPresent(present)
      setTodayAbsent(absent)
      setCurrentlySignedIn(signedIn)

      // Build Project-wise Breakdown
      const breakdown: ProjectStats[] = allProjects.map((proj) => {
        const projGeofence = allGeofences.find((g) => g.project_id === proj.id) || null
        const assignedEmployees = allAssignments.filter((a) => a.project_id === proj.id)
        const projAttendance = allAttendance.filter((a) => a.project_id === proj.id)

        const pCount = projAttendance.filter((a) => a.status === 'present').length
        const aCount = projAttendance.filter((a) => a.status === 'absent').length

        return {
          project: proj,
          geofence: projGeofence,
          totalAssignedEmployees: assignedEmployees.length,
          presentCount: pCount,
          absentCount: aCount
        }
      })

      setProjectStats(breakdown)
    } catch (err) {
      console.error('[AdminDashboard] Database query error:', err)
      setErrorMsg((err as Error).message || 'Failed to fetch dashboard metrics from database.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  const todayFormatted = new Date().toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-sky-950 p-6 sm:p-8 text-white shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 border border-emerald-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Attendance Console
              </span>
              <span className="text-xs font-medium text-slate-300">
                • {todayFormatted}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Welcome, {profile?.full_name || user?.email || 'Administrator'}
            </h1>
            <p className="text-xs text-slate-300">
              Milestone Consultancy • Operations & Site Geofence Overview
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchDashboardData}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-xs border border-white/10 hover:bg-white/20 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Data</span>
            </button>
            <Link
              to="/admin/projects"
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-600 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Site</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Database Error Banner with Retry */}
      {errorMsg && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-6 shadow-xs space-y-3">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-rose-100 p-2 text-rose-600">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-rose-900">
                Database Authorization / Query Error
              </h3>
              <p className="text-xs text-rose-700 leading-relaxed font-mono">
                {errorMsg}
              </p>
              <p className="text-xs text-rose-600 pt-1">
                If this is a PostgreSQL permission error (e.g. 42501), ensure the latest RLS migration script is executed in the Supabase SQL editor.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-rose-200/60">
            <button
              onClick={fetchDashboardData}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Retry Query</span>
            </button>
          </div>
        </div>
      )}

      {/* Top Metric Cards */}
      {isLoading ? (
        <LoadingSpinner message="Calculating live attendance and project metrics from database..." />
      ) : errorMsg ? null : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            {/* Total Projects */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Total Sites
                </span>
                <div className="rounded-lg bg-sky-50 p-2 text-sky-600">
                  <Building2 className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-black text-slate-900">{totalProjects}</p>
              <span className="text-[10px] text-slate-400">Configured sites</span>
            </div>

            {/* Total Active Employees */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Active Staff
                </span>
                <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
                  <Users className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-black text-slate-900">{totalActiveEmployees}</p>
              <span className="text-[10px] text-slate-400">Registered employees</span>
            </div>

            {/* Active Geofences */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Geofences
                </span>
                <div className="rounded-lg bg-purple-50 p-2 text-purple-600">
                  <MapPin className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-black text-slate-900">{totalGeofences}</p>
              <span className="text-[10px] text-slate-400">Active boundaries</span>
            </div>

            {/* Today's Present */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                  Present Today
                </span>
                <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-black text-emerald-600">{todayPresent}</p>
              <span className="text-[10px] text-emerald-600/80 font-medium">Marked present</span>
            </div>

            {/* Today's Absent */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Absent Today
                </span>
                <div className="rounded-lg bg-slate-100 p-2 text-slate-500">
                  <XCircle className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-black text-slate-700">{todayAbsent}</p>
              <span className="text-[10px] text-slate-400">Marked absent</span>
            </div>

            {/* Currently Signed In */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-sky-700">
                  On Duty Now
                </span>
                <div className="rounded-lg bg-sky-50 p-2 text-sky-600">
                  <Clock className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-black text-sky-600">{currentlySignedIn}</p>
              <span className="text-[10px] text-sky-600/80 font-medium">Currently active</span>
            </div>
          </div>

          {/* Project-Wise Breakdown */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Project / Site Status</h2>
                <p className="text-xs text-slate-500">
                  Real-time breakdown of staffing, attendance, and geofence status across all locations.
                </p>
              </div>
              <Link
                to="/admin/projects"
                className="inline-flex items-center gap-1 text-xs font-bold text-sky-600 hover:text-sky-700"
              >
                <span>View All Sites</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {projectStats.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
                <Building2 className="h-8 w-8 text-slate-400 mb-2" />
                <h3 className="text-sm font-bold text-slate-800">No Projects Configured</h3>
                <p className="mt-1 text-xs text-slate-500 max-w-sm">
                  Add project locations and sites to track attendance across Milestone Consultancy.
                </p>
                <Link
                  to="/admin/projects"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-700"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Project</span>
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projectStats.map(({ project, geofence, totalAssignedEmployees, presentCount, absentCount }) => (
                  <div
                    key={project.id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-slate-300 transition-all"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">{project.name}</h3>
                          {project.code && (
                            <span className="font-mono text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {project.code}
                            </span>
                          )}
                        </div>
                        <StatusBadge status={project.is_active} size="sm" />
                      </div>

                      <p className="text-xs text-slate-500 line-clamp-2 mb-4">
                        {project.description || 'No description provided.'}
                      </p>

                      {/* Key Indicators */}
                      <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center border border-slate-100 mb-4">
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase">Assigned</p>
                          <p className="text-sm font-bold text-slate-800">{totalAssignedEmployees}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-emerald-600 uppercase">Present</p>
                          <p className="text-sm font-bold text-emerald-600">{presentCount}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-slate-500 uppercase">Absent</p>
                          <p className="text-sm font-bold text-slate-700">{absentCount}</p>
                        </div>
                      </div>

                      {/* Geofence Status */}
                      <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-3 text-slate-600">
                        <span className="flex items-center gap-1.5 text-slate-500">
                          <MapPin className="h-3.5 w-3.5 text-sky-600" />
                          Geofence:
                        </span>
                        {geofence ? (
                          <span className="font-semibold text-slate-800">
                            {geofence.radius}m ({geofence.is_active ? 'Active' : 'Inactive'})
                          </span>
                        ) : (
                          <span className="text-amber-600 font-medium text-[11px]">
                            Not Configured
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <Link
                        to="/admin/geofences"
                        className="text-xs font-semibold text-sky-600 hover:text-sky-700"
                      >
                        {geofence ? 'Edit Geofence' : '+ Add Geofence'}
                      </Link>
                      <Link
                        to="/admin/projects"
                        className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
                      >
                        <span>Manage Site</span>
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
