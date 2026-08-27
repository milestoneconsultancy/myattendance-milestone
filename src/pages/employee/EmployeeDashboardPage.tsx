import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { calculateHaversineDistance, isWithinGeofence } from '../../lib/geoUtils'
import { logAuditEvent } from '../../lib/auditService'
import type { Project, Geofence, DailyAttendance } from '../../types/database.types'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { GeofenceMap } from '../../components/map/GeofenceMap'
import {
  Clock,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Building2,
  Navigation,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Radio,
  Calendar
} from 'lucide-react'

export const EmployeeDashboardPage: React.FC = () => {
  const { profile, user } = useAuth()

  // Assignment & Geofences state
  const [assignedProject, setAssignedProject] = useState<Project | null>(null)
  const [activeGeofences, setActiveGeofences] = useState<Geofence[]>([])
  const [todayAttendance, setTodayAttendance] = useState<DailyAttendance | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null)

  // Geolocation state
  const [currentPosition, setCurrentPosition] = useState<{
    latitude: number
    longitude: number
    accuracy: number
  } | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [isLocating, setIsLocating] = useState(true)

  // Action submitting state
  const [isClockingIn, setIsClockingIn] = useState(false)
  const [isClockingOut, setIsClockingOut] = useState(false)

  // Today's date string (YYYY-MM-DD)
  const todayDateStr = new Date().toISOString().split('T')[0]

  // Fetch Employee Assignment, Geofences, and Attendance
  const loadEmployeeData = useCallback(async () => {
    if (!user?.id) return
    setIsLoading(true)
    setErrorMsg(null)

    try {
      // 1. Fetch active assignments
      const { data: assignmentsData, error: assignErr } = await supabase
        .from('employee_project_assignments')
        .select('*, project:projects(*)')
        .eq('employee_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (assignErr) throw assignErr

      // Filter assignment valid for today
      const validAssignment = assignmentsData?.find((a) => {
        const fromOk = !a.assigned_from || a.assigned_from <= todayDateStr
        const toOk = !a.assigned_to || a.assigned_to >= todayDateStr
        const projectActive = (a.project as unknown as Project)?.is_active ?? true
        return fromOk && toOk && projectActive
      })

      if (validAssignment?.project) {
        const proj = validAssignment.project as unknown as Project
        setAssignedProject(proj)

        // 2. Fetch active geofences for this project
        const { data: geoData, error: geoErr } = await supabase
          .from('geofences')
          .select('*')
          .eq('project_id', proj.id)
          .eq('is_active', true)
          .order('name', { ascending: true })

        if (geoErr) throw geoErr
        setActiveGeofences(geoData || [])
      } else {
        setAssignedProject(null)
        setActiveGeofences([])
      }

      // 3. Fetch today's daily attendance record
      const { data: attendData, error: attendErr } = await supabase
        .from('daily_attendance')
        .select('*')
        .eq('employee_id', user.id)
        .eq('attendance_date', todayDateStr)
        .maybeSingle()

      if (attendErr) throw attendErr
      setTodayAttendance(attendData)
    } catch (err) {
      console.error('[EmployeeDashboard] Error loading data:', err)
      setErrorMsg((err as Error).message || 'Failed to load assignment data.')
    } finally {
      setIsLoading(false)
    }
  }, [user?.id, todayDateStr])

  useEffect(() => {
    loadEmployeeData()
  }, [loadEmployeeData])

  // Watch GPS Geolocation
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError('GPS Geolocation is not supported by your browser.')
      setIsLocating(false)
      return
    }

    setIsLocating(true)
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentPosition({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy)
        })
        setGeoError(null)
        setIsLocating(false)
      },
      (err) => {
        console.warn('[Geolocation] Error:', err.message)
        setGeoError(
          err.code === 1
            ? 'Location permission was denied. Please allow location access in your browser settings to record attendance.'
            : 'Unable to acquire GPS fix. Please ensure location services are enabled.'
        )
        setIsLocating(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000
      }
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  // Geofence calculations
  let isInsideAnyGeofence = false
  let closestGeofence: { geofence: Geofence; distanceMeters: number } | null = null

  if (currentPosition && activeGeofences.length > 0) {
    let minDistance = Infinity

    for (const geo of activeGeofences) {
      const dist = Math.round(
        calculateHaversineDistance(
          currentPosition.latitude,
          currentPosition.longitude,
          geo.latitude,
          geo.longitude
        )
      )

      if (dist < minDistance) {
        minDistance = dist
        closestGeofence = { geofence: geo, distanceMeters: dist }
      }

      if (isWithinGeofence(currentPosition.latitude, currentPosition.longitude, geo.latitude, geo.longitude, geo.radius_meters)) {
        isInsideAnyGeofence = true
      }
    }
  }

  // Handle Clock In (Sign In)
  const handleClockIn = async () => {
    if (!user?.id || !assignedProject || !currentPosition) return
    if (profile?.is_active === false) {
      setErrorMsg('Attendance blocked: Your employee account is currently deactivated.')
      return
    }
    if (!isInsideAnyGeofence) {
      setErrorMsg('Attendance blocked: You must be inside your designated site geofence to clock in.')
      return
    }

    setIsClockingIn(true)
    setErrorMsg(null)
    setActionSuccessMsg(null)

    try {
      const nowIso = new Date().toISOString()

      // 1. Record event in attendance_events (using canonical columns)
      const { error: eventErr } = await supabase.from('attendance_events').insert({
        employee_id: user.id,
        project_id: assignedProject.id,
        geofence_id: closestGeofence?.geofence.id || null,
        event_type: 'SIGN_IN',
        event_time: nowIso,
        latitude: currentPosition.latitude,
        longitude: currentPosition.longitude,
        distance_meters: closestGeofence?.distanceMeters ?? null
      })

      if (eventErr) throw eventErr

      // 2. Insert or update daily_attendance
      if (todayAttendance) {
        const { error: updateErr } = await supabase
          .from('daily_attendance')
          .update({
            project_id: assignedProject.id,
            sign_in_at: nowIso,
            status: 'present',
            attendance_source: 'geofence',
            updated_at: nowIso
          })
          .eq('id', todayAttendance.id)

        if (updateErr) throw updateErr
      } else {
        const { error: insertErr } = await supabase.from('daily_attendance').insert({
          employee_id: user.id,
          project_id: assignedProject.id,
          attendance_date: todayDateStr,
          status: 'present',
          sign_in_at: nowIso,
          attendance_source: 'geofence'
        })

        if (insertErr) throw insertErr
      }

      await logAuditEvent({
        actorId: user.id,
        action: 'ATTENDANCE_CLOCK_IN',
        entityType: 'daily_attendance',
        entityId: user.id,
        newData: {
          project_id: assignedProject.id,
          project_name: assignedProject.name,
          latitude: currentPosition.latitude,
          longitude: currentPosition.longitude,
          closest_site: closestGeofence?.geofence.name,
          distance_meters: closestGeofence?.distanceMeters
        },
        remark: `Clock In verified inside ${closestGeofence?.geofence.name || 'geofence'}`
      })

      setActionSuccessMsg(`Successfully clocked in at ${closestGeofence?.geofence.name || assignedProject.name}!`)
      await loadEmployeeData()
    } catch (err) {
      console.error('[ClockIn] Error:', err)
      setErrorMsg((err as Error).message || 'Failed to record clock in.')
    } finally {
      setIsClockingIn(false)
    }
  }

  // Handle Clock Out (Sign Out)
  const handleClockOut = async () => {
    if (!user?.id || !assignedProject || !todayAttendance?.sign_in_at || !currentPosition) return
    if (profile?.is_active === false) {
      setErrorMsg('Attendance blocked: Your employee account is currently deactivated.')
      return
    }
    if (!isInsideAnyGeofence) {
      setErrorMsg('Attendance blocked: You must be inside your designated site geofence to clock out.')
      return
    }

    setIsClockingOut(true)
    setErrorMsg(null)
    setActionSuccessMsg(null)

    try {
      const nowIso = new Date().toISOString()
      const signInTime = new Date(todayAttendance.sign_in_at).getTime()
      const signOutTime = new Date(nowIso).getTime()
      const workingMinutes = Math.max(0, Math.round((signOutTime - signInTime) / (1000 * 60)))

      // 1. Record event in attendance_events (using canonical columns)
      const { error: eventErr } = await supabase.from('attendance_events').insert({
        employee_id: user.id,
        project_id: assignedProject.id,
        geofence_id: closestGeofence?.geofence.id || null,
        event_type: 'SIGN_OUT',
        event_time: nowIso,
        latitude: currentPosition.latitude,
        longitude: currentPosition.longitude,
        distance_meters: closestGeofence?.distanceMeters ?? null
      })

      if (eventErr) throw eventErr

      // 2. Update daily_attendance
      const { error: updateErr } = await supabase
        .from('daily_attendance')
        .update({
          sign_out_at: nowIso,
          working_minutes: workingMinutes,
          updated_at: nowIso
        })
        .eq('id', todayAttendance.id)

      if (updateErr) throw updateErr

      await logAuditEvent({
        actorId: user.id,
        action: 'ATTENDANCE_CLOCK_OUT',
        entityType: 'daily_attendance',
        entityId: todayAttendance.id,
        newData: {
          project_id: assignedProject.id,
          project_name: assignedProject.name,
          working_minutes: workingMinutes,
          latitude: currentPosition.latitude,
          longitude: currentPosition.longitude
        },
        remark: `Clock Out recorded with duration ${workingMinutes} mins`
      })

      const hrs = Math.floor(workingMinutes / 60)
      const mins = workingMinutes % 60
      setActionSuccessMsg(`Successfully clocked out! Total working time: ${hrs}h ${mins}m.`)
      await loadEmployeeData()
    } catch (err) {
      console.error('[ClockOut] Error:', err)
      setErrorMsg((err as Error).message || 'Failed to record clock out.')
    } finally {
      setIsClockingOut(false)
    }
  }

  // Calculate working hours if signed in
  let durationDisplay = '0 hrs 00 mins'
  if (todayAttendance?.sign_in_at) {
    if (todayAttendance.sign_out_at && todayAttendance.working_minutes) {
      const h = Math.floor(todayAttendance.working_minutes / 60)
      const m = todayAttendance.working_minutes % 60
      durationDisplay = `${h} hrs ${m.toString().padStart(2, '0')} mins`
    } else {
      const start = new Date(todayAttendance.sign_in_at).getTime()
      const now = Date.now()
      const diffMins = Math.max(0, Math.floor((now - start) / (1000 * 60)))
      const h = Math.floor(diffMins / 60)
      const m = diffMins % 60
      durationDisplay = `${h} hrs ${m.toString().padStart(2, '0')} mins (Active)`
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Welcome Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 p-6 sm:p-8 text-white shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/20 px-3 py-1 text-xs font-semibold text-sky-300">
              <ShieldCheck className="h-3.5 w-3.5" /> GPS Geofenced Attendance
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Welcome, {profile?.full_name || user?.email}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300">
              Milestone Consultancy • Attendance Portal
            </p>
          </div>

          <div className="flex flex-col sm:items-end gap-1.5 text-xs text-slate-300">
            <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-xl backdrop-blur-xs w-fit">
              <Calendar className="h-4 w-4 text-sky-300" />
              <span>
                {new Date().toLocaleDateString('en-IN', {
                  weekday: 'short',
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
                })}
              </span>
            </div>
            {profile?.employee_code && (
              <span className="font-mono text-[11px] text-sky-200">
                Staff ID: {profile.employee_code}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action Notifications */}
      {actionSuccessMsg && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 border border-emerald-200 shadow-2xs">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-4 text-xs font-semibold text-rose-800 border border-rose-200 shadow-2xs">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {geoError && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-4 text-xs font-medium text-amber-800 border border-amber-200">
          <Radio className="h-4 w-4 shrink-0 text-amber-600 animate-pulse" />
          <span>{geoError}</span>
        </div>
      )}

      {/* Main Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Assigned Site */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Assigned Project & Site</p>
              {assignedProject ? (
                <div>
                  <p className="text-base font-bold text-slate-900">{assignedProject.name}</p>
                  <p className="text-xs text-slate-500 font-mono">
                    {assignedProject.code ? `Code: ${assignedProject.code}` : ''}
                  </p>
                </div>
              ) : (
                <p className="text-sm font-semibold text-amber-600">No Project Assigned</p>
              )}
            </div>
            <div className="rounded-xl bg-sky-50 p-2.5 text-sky-600">
              <Building2 className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-xs">
            {activeGeofences.length > 0 ? (
              <span className="text-slate-600 font-medium">
                {activeGeofences.length} authorized site {activeGeofences.length === 1 ? 'perimeter' : 'perimeters'}
              </span>
            ) : (
              <span className="text-slate-400">No active perimeters</span>
            )}
          </div>
        </div>

        {/* Card 2: Geofence Status */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Geofence Proximity</p>
              {isLocating ? (
                <div className="flex items-center gap-1.5 text-amber-600 text-sm font-semibold">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Acquiring GPS Fix...</span>
                </div>
              ) : isInsideAnyGeofence ? (
                <div className="flex items-center gap-1.5 text-emerald-600 text-sm font-bold">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Inside Site Perimeter</span>
                </div>
              ) : closestGeofence ? (
                <div>
                  <p className="text-sm font-bold text-rose-600">Outside Geofence</p>
                  <p className="text-xs text-slate-500">
                    {closestGeofence.distanceMeters}m from {closestGeofence.geofence.name} (Max: {closestGeofence.geofence.radius_meters}m)
                  </p>
                </div>
              ) : (
                <p className="text-sm font-medium text-slate-400">GPS Inactive</p>
              )}
            </div>
            <div className={`rounded-xl p-2.5 ${isInsideAnyGeofence ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
              <Navigation className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] font-mono text-slate-500 flex justify-between">
            <span>Accuracy: {currentPosition ? `±${currentPosition.accuracy}m` : '—'}</span>
            <span>{isInsideAnyGeofence ? '✅ Verified' : '❌ Out of range'}</span>
          </div>
        </div>

        {/* Card 3: Today's Status & Duration */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Today's Attendance</p>
              <p className="text-base font-bold text-slate-900">{durationDisplay}</p>
              <p className="text-xs text-slate-500">
                {todayAttendance?.sign_in_at ? (
                  <>
                    In: {new Date(todayAttendance.sign_in_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    {todayAttendance.sign_out_at ? ` • Out: ${new Date(todayAttendance.sign_out_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ' (Signed In)'}
                  </>
                ) : (
                  'Not clocked in today'
                )}
              </p>
            </div>
            <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600">
              <Clock className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-xs flex items-center justify-between">
            <span className="text-slate-500">Status:</span>
            <span className={`font-semibold ${todayAttendance?.sign_in_at ? 'text-emerald-600' : 'text-slate-400'}`}>
              {todayAttendance?.sign_out_at ? 'Completed' : todayAttendance?.sign_in_at ? 'Present / Active' : 'Pending Sign In'}
            </span>
          </div>
        </div>
      </div>

      {/* CLOCK IN / CLOCK OUT ACTION PANEL */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs">
        <h2 className="text-base font-bold text-slate-900 mb-2">Punch Attendance</h2>
        <p className="text-xs text-slate-500 mb-6">
          Attendance can only be recorded when your mobile/browser device GPS coordinates fall inside your assigned project site perimeter.
        </p>

        {isLoading ? (
          <LoadingSpinner message="Checking project assignment..." />
        ) : !assignedProject ? (
          <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-6 text-center">
            <ShieldAlert className="h-8 w-8 text-amber-500 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-amber-900">No Project / Site Assigned</h3>
            <p className="text-xs text-amber-700 mt-1 max-w-md mx-auto">
              You are currently not assigned to any operational project site. Please contact your Milestone Consultancy system administrator.
            </p>
          </div>
        ) : activeGeofences.length === 0 ? (
          <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-6 text-center">
            <MapPin className="h-8 w-8 text-amber-500 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-amber-900">No Site Geofence Configured</h3>
            <p className="text-xs text-amber-700 mt-1 max-w-md mx-auto">
              Your assigned project "{assignedProject.name}" does not have an active geofence boundary. Please ask your administrator to configure site coordinates.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* CLOCK IN BUTTON */}
            <button
              onClick={handleClockIn}
              disabled={
                isClockingIn ||
                Boolean(todayAttendance?.sign_in_at) ||
                !isInsideAnyGeofence ||
                isLocating
              }
              className={`flex flex-col items-center justify-center gap-2 rounded-2xl p-6 transition-all border shadow-sm ${
                todayAttendance?.sign_in_at
                  ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                  : isInsideAnyGeofence
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 cursor-pointer shadow-md'
                  : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <LogIn className="h-8 w-8" />
              <div className="text-center">
                <span className="block text-base font-bold">
                  {todayAttendance?.sign_in_at ? 'Clocked In' : isClockingIn ? 'Clocking In...' : 'Clock In (Sign In)'}
                </span>
                <span className="text-[11px] opacity-80 block mt-0.5">
                  {todayAttendance?.sign_in_at
                    ? `Recorded at ${new Date(todayAttendance.sign_in_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                    : isInsideAnyGeofence
                    ? 'GPS Verified Inside Geofence'
                    : 'Requires GPS inside site perimeter'}
                </span>
              </div>
            </button>

            {/* CLOCK OUT BUTTON */}
            <button
              onClick={handleClockOut}
              disabled={
                isClockingOut ||
                !todayAttendance?.sign_in_at ||
                Boolean(todayAttendance?.sign_out_at) ||
                !isInsideAnyGeofence ||
                isLocating
              }
              className={`flex flex-col items-center justify-center gap-2 rounded-2xl p-6 transition-all border shadow-sm ${
                todayAttendance?.sign_out_at
                  ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                  : todayAttendance?.sign_in_at && isInsideAnyGeofence
                  ? 'bg-sky-600 hover:bg-sky-700 text-white border-sky-700 cursor-pointer shadow-md'
                  : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <LogOut className="h-8 w-8" />
              <div className="text-center">
                <span className="block text-base font-bold">
                  {todayAttendance?.sign_out_at
                    ? 'Clocked Out'
                    : isClockingOut
                    ? 'Clocking Out...'
                    : 'Clock Out (Sign Out)'}
                </span>
                <span className="text-[11px] opacity-80 block mt-0.5">
                  {todayAttendance?.sign_out_at
                    ? `Recorded at ${new Date(todayAttendance.sign_out_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                    : !todayAttendance?.sign_in_at
                    ? 'Must Clock In first'
                    : isInsideAnyGeofence
                    ? 'GPS Verified Inside Geofence'
                    : 'Requires GPS inside site perimeter'}
                </span>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* MAP / SITE PERIMETER OVERVIEW */}
      {closestGeofence && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-sky-600" />
              Site Perimeter Map: {closestGeofence.geofence.name}
            </span>
            <span className="font-mono text-xs text-slate-500">
              Radius: <b className="text-slate-800">{closestGeofence.geofence.radius_meters}m</b>
            </span>
          </div>

          <GeofenceMap
            latitude={closestGeofence.geofence.latitude}
            longitude={closestGeofence.geofence.longitude}
            radius_meters={closestGeofence.geofence.radius_meters}
            siteName={closestGeofence.geofence.name}
            height="260px"
          />

          <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border border-slate-200">
            <div>
              <span className="text-slate-500">Site Coordinates: </span>
              <span className="font-mono font-medium text-slate-800">
                {closestGeofence.geofence.latitude.toFixed(5)}, {closestGeofence.geofence.longitude.toFixed(5)}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Your GPS: </span>
              <span className="font-mono font-medium text-slate-800">
                {currentPosition ? `${currentPosition.latitude.toFixed(5)}, ${currentPosition.longitude.toFixed(5)}` : 'Acquiring...'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
