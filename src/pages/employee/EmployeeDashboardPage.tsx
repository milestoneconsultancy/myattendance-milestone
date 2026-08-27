import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { isWithinGeofence } from '../../lib/geoUtils'
import {
  validateEmployeeDevice,
  bindCurrentDevice,
  type DeviceValidationResult
} from '../../lib/deviceService'
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
  Calendar,
  Smartphone
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

  // Device Binding state
  const [deviceValidation, setDeviceValidation] = useState<DeviceValidationResult | null>(null)
  const [isBindingDevice, setIsBindingDevice] = useState(false)

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

  // Helper: Local date string in YYYY-MM-DD format (avoids UTC offset shifts)
  const getLocalDateString = useCallback((date: Date = new Date()): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }, [])

  // Fetch Employee Assignment, Geofences, and Attendance
  const loadEmployeeData = useCallback(async () => {
    if (!user?.id) return
    setIsLoading(true)
    setErrorMsg(null)

    const todayStr = getLocalDateString()

    try {
      // 1. Fetch active assignments for the authenticated employee
      const { data: assignmentsData, error: assignErr } = await supabase
        .from('employee_project_assignments')
        .select('*')
        .eq('employee_id', user.id)
        .eq('is_active', true)

      if (assignErr) {
        console.error('[EmployeeDashboard] Failed to fetch employee_project_assignments:', assignErr)
        throw assignErr
      }

      let resolvedProject: Project | null = null

      if (assignmentsData && assignmentsData.length > 0) {
        // Safe sort by creation or assignment date in memory
        const sortedAssignments = [...assignmentsData].sort((a, b) => {
          const dateA = a.created_at || a.assigned_from || ''
          const dateB = b.created_at || b.assigned_from || ''
          return dateB.localeCompare(dateA)
        })

        // Fetch project master data for all assigned project IDs
        const projectIds = Array.from(new Set(sortedAssignments.map((a) => a.project_id)))
        const { data: projectsData, error: projErr } = await supabase
          .from('projects')
          .select('*')
          .in('id', projectIds)
          .eq('is_active', true)

        if (projErr) {
          console.error('[EmployeeDashboard] Failed to fetch projects:', projErr)
          throw projErr
        }

        if (projectsData && projectsData.length > 0) {
          // Find assignment valid for today
          for (const assign of sortedAssignments) {
            const proj = projectsData.find((p) => p.id === assign.project_id)
            if (!proj) continue

            const fromOk = !assign.assigned_from || assign.assigned_from <= todayStr
            const toOk = !assign.assigned_to || assign.assigned_to >= todayStr

            if (fromOk && toOk) {
              resolvedProject = proj
              break
            }
          }

          // Fallback to the latest active assigned project
          if (!resolvedProject) {
            resolvedProject = projectsData[0]
          }
        }
      }

      setAssignedProject(resolvedProject)

      // 2. Fetch specific active geofences assigned to this employee (EXPLICIT ONLY, NO FALLBACK)
      let assignedGeos: Geofence[] = []

      if (resolvedProject) {
        try {
          const { data: empGeoAssigns, error: empGeoAssignErr } = await supabase
            .from('employee_geofence_assignments')
            .select('geofence_id')
            .eq('employee_id', user.id)
            .eq('is_active', true)

          if (!empGeoAssignErr && empGeoAssigns && empGeoAssigns.length > 0) {
            const geoIds = empGeoAssigns.map((g) => g.geofence_id)
            const { data: specificGeos, error: specGeoErr } = await supabase
              .from('geofences')
              .select('*')
              .in('id', geoIds)
              .eq('project_id', resolvedProject.id)
              .eq('is_active', true)
              .order('name', { ascending: true })

            if (!specGeoErr && specificGeos && specificGeos.length > 0) {
              assignedGeos = specificGeos
            }
          }
        } catch (geoErr) {
          console.warn('[EmployeeDashboard] Geofence assignment lookup notice:', geoErr)
        }
      }

      setActiveGeofences(assignedGeos)

      // 3. Fetch today's daily attendance record
      const { data: attendData, error: attendErr } = await supabase
        .from('daily_attendance')
        .select('*')
        .eq('employee_id', user.id)
        .eq('attendance_date', todayStr)
        .maybeSingle()

      if (attendErr) {
        console.error('[EmployeeDashboard] Failed to fetch daily_attendance:', attendErr)
      }
      setTodayAttendance(attendData || null)

      // 4. Validate device binding
      const devResult = await validateEmployeeDevice(user.id)
      setDeviceValidation(devResult)
    } catch (err) {
      console.error('[EmployeeDashboard] Error loading data:', err)
      setErrorMsg((err as Error).message || 'Failed to load assignment data.')
    } finally {
      setIsLoading(false)
    }
  }, [user?.id, getLocalDateString])

  useEffect(() => {
    loadEmployeeData()
  }, [loadEmployeeData])

  // Handle employee binding their current device
  const handleBindDevice = async () => {
    if (!user?.id) return
    setIsBindingDevice(true)
    setErrorMsg(null)
    setActionSuccessMsg(null)

    try {
      const res = await bindCurrentDevice(user.id)
      if (!res.success || !res.device) {
        throw new Error(res.error || 'Failed to link device.')
      }

      setActionSuccessMsg(`Device (${res.device.device_name}) successfully linked to your account!`)
      await loadEmployeeData()
    } catch (err) {
      console.error('[DeviceBinding] Error:', err)
      setErrorMsg((err as Error).message || 'Failed to link device.')
    } finally {
      setIsBindingDevice(false)
    }
  }

  // Watch GPS Geolocation with immediate acquisition and continuous watch
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError('GPS Geolocation is not supported by your browser.')
      setIsLocating(false)
      return
    }

    setIsLocating(true)

    // 1. Trigger fast initial fix immediately
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCurrentPosition({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy)
        })
        setIsLocating(false)
        setGeoError(null)
      },
      (err) => {
        console.warn('[Geolocation] Initial GPS fix notice:', err.message)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    )

    // 2. Maintain continuous live GPS watch
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentPosition({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy)
        })
        setIsLocating(false)
        setGeoError(null)
      },
      (err) => {
        setIsLocating(false)
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setGeoError('Location permission denied. Please allow GPS access in your browser settings to record attendance.')
            break
          case err.POSITION_UNAVAILABLE:
            setGeoError('GPS position unavailable. Please ensure your device location is turned on.')
            break
          case err.TIMEOUT:
            setGeoError('GPS acquisition timed out. Waiting for stronger signal...')
            break
          default:
            setGeoError('Unable to retrieve GPS coordinates.')
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000
      }
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  // Geofence proximity calculation
  let isInsideAnyGeofence = false
  let closestGeofence: { geofence: Geofence; distanceMeters: number } | null = null
  let minDistance = Infinity

  if (currentPosition && activeGeofences.length > 0) {
    for (const geo of activeGeofences) {
      const radiusMeters = Number(geo.radius_meters || 150)
      const { isInside, distanceMeters } = isWithinGeofence(
        currentPosition.latitude,
        currentPosition.longitude,
        geo.latitude,
        geo.longitude,
        radiusMeters
      )

      if (distanceMeters < minDistance) {
        minDistance = distanceMeters
        closestGeofence = { geofence: geo, distanceMeters }
      }

      if (isInside) {
        isInsideAnyGeofence = true
      }
    }
  }

  // Handle Clock In (Sign In) via Trusted Server API
  const handleClockIn = async () => {
    if (!user?.id || !assignedProject || !currentPosition) return

    if (profile?.is_active === false) {
      setErrorMsg('Attendance blocked: Your employee account is currently deactivated.')
      return
    }

    if (deviceValidation?.status !== 'MATCH') {
      if (deviceValidation?.status === 'NO_DEVICE') {
        setErrorMsg('Attendance blocked: You must link this device to your employee account before clocking in.')
      } else if (deviceValidation?.status === 'MISMATCH') {
        setErrorMsg(`Attendance blocked: Unauthorized device. Your account is locked to "${deviceValidation.boundDevice?.device_name || 'another device'}".`)
      } else {
        setErrorMsg('Attendance blocked: Device authorization could not be verified.')
      }
      return
    }

    if (currentPosition.accuracy > 80) {
      setErrorMsg(`Attendance blocked: GPS accuracy is too low (±${currentPosition.accuracy}m). High precision location required (within ±80m). Please move to an open area and try again.`)
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
      let token: string | null = null
      const { data: sessionData } = await supabase.auth.getSession()
      if (sessionData?.session?.access_token) {
        token = sessionData.session.access_token
      } else {
        const { data: refreshData } = await supabase.auth.refreshSession()
        token = refreshData?.session?.access_token || null
      }

      if (!token) {
        throw new Error('Your session has expired. Please log in again.')
      }

      const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'CLOCK_IN',
          latitude: currentPosition.latitude,
          longitude: currentPosition.longitude,
          accuracy: currentPosition.accuracy,
          device_id: deviceValidation.currentDeviceId
        })
      })

      const resData = await response.json().catch(() => null)

      if (!response.ok || !resData?.success) {
        throw new Error(resData?.error || 'Failed to record clock in.')
      }

      setActionSuccessMsg(resData.message || `Successfully clocked in at ${resData.site || assignedProject.name}!`)
      await loadEmployeeData()
    } catch (err) {
      console.error('[ClockIn] Error:', err)
      setErrorMsg((err as Error).message || 'Failed to record clock in.')
    } finally {
      setIsClockingIn(false)
    }
  }

  // Handle Clock Out (Sign Out) via Trusted Server API
  const handleClockOut = async () => {
    if (!user?.id || !assignedProject || !todayAttendance?.sign_in_at || !currentPosition) return

    if (profile?.is_active === false) {
      setErrorMsg('Attendance blocked: Your employee account is currently deactivated.')
      return
    }

    if (deviceValidation?.status !== 'MATCH') {
      if (deviceValidation?.status === 'NO_DEVICE') {
        setErrorMsg('Attendance blocked: No authorized device is linked to your account.')
      } else if (deviceValidation?.status === 'MISMATCH') {
        setErrorMsg(`Attendance blocked: Unauthorized device. Your account is locked to "${deviceValidation.boundDevice?.device_name || 'another device'}".`)
      } else {
        setErrorMsg('Attendance blocked: Device authorization could not be verified.')
      }
      return
    }

    if (currentPosition.accuracy > 80) {
      setErrorMsg(`Attendance blocked: GPS accuracy is too low (±${currentPosition.accuracy}m). High precision location required (within ±80m). Please move to an open area and try again.`)
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
      let token: string | null = null
      const { data: sessionData } = await supabase.auth.getSession()
      if (sessionData?.session?.access_token) {
        token = sessionData.session.access_token
      } else {
        const { data: refreshData } = await supabase.auth.refreshSession()
        token = refreshData?.session?.access_token || null
      }

      if (!token) {
        throw new Error('Your session has expired. Please log in again.')
      }

      const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'CLOCK_OUT',
          latitude: currentPosition.latitude,
          longitude: currentPosition.longitude,
          accuracy: currentPosition.accuracy,
          device_id: deviceValidation.currentDeviceId
        })
      })

      const resData = await response.json().catch(() => null)

      if (!response.ok || !resData?.success) {
        throw new Error(resData?.error || 'Failed to record clock out.')
      }

      setActionSuccessMsg(resData.message || 'Successfully clocked out!')
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
            <div className="flex flex-wrap items-center gap-2">
              {profile?.employee_code && (
                <span className="font-mono text-[11px] text-sky-200">
                  Staff ID: {profile.employee_code}
                </span>
              )}
              {deviceValidation && (
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-mono px-2.5 py-0.5 rounded-full border ${
                    deviceValidation.status === 'MATCH'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : deviceValidation.status === 'MISMATCH'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  }`}
                >
                  <Smartphone className="h-3 w-3" />
                  {deviceValidation.status === 'MATCH'
                    ? 'Device Linked'
                    : deviceValidation.status === 'MISMATCH'
                    ? 'Unauthorized Device'
                    : 'No Device Linked'}
                </span>
              )}
            </div>
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

      {/* DEVICE BINDING ACTION BANNER (IF UNLINKED) */}
      {deviceValidation?.status === 'NO_DEVICE' && (
        <div className="rounded-2xl border border-sky-300 bg-sky-50/90 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="rounded-xl bg-sky-100 p-3 text-sky-700 shrink-0">
              <Smartphone className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900">Device Registration Required</h3>
              <p className="text-xs text-slate-600 max-w-xl">
                Your employee account is not yet linked to a device. For security and attendance integrity, please register this device (<span className="font-semibold text-slate-800">{deviceValidation.currentDeviceName}</span>) as your primary device.
              </p>
            </div>
          </div>
          <button
            onClick={handleBindDevice}
            disabled={isBindingDevice}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500/50 disabled:opacity-60 transition-all cursor-pointer shrink-0"
          >
            <ShieldCheck className="h-4 w-4" />
            {isBindingDevice ? 'Linking Device...' : 'Link This Device'}
          </button>
        </div>
      )}

      {/* DEVICE MISMATCH ALERT (IF BOUND TO ANOTHER DEVICE) */}
      {deviceValidation?.status === 'MISMATCH' && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50/90 p-5 sm:p-6 shadow-xs flex items-start gap-3.5">
          <div className="rounded-xl bg-rose-100 p-3 text-rose-700 shrink-0">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-rose-900">Device Lock Mismatch</h3>
            <p className="text-xs text-rose-700 max-w-2xl">
              Your attendance account is bound to "<span className="font-semibold">{deviceValidation.boundDevice?.device_name || 'another device'}</span>". Attendance cannot be recorded from this device (<span className="font-semibold">{deviceValidation.currentDeviceName}</span>). If you changed your phone or computer, please contact your Milestone system administrator to unbind your previous device.
            </p>
          </div>
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
              {!currentPosition && isLocating ? (
                <div className="flex items-center gap-1.5 text-amber-600 text-sm font-semibold">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Acquiring GPS Signal...</span>
                </div>
              ) : !currentPosition ? (
                <div>
                  <p className="text-sm font-bold text-rose-600">GPS Inactive</p>
                  <p className="text-xs text-slate-500">{geoError || 'Location signal unavailable'}</p>
                </div>
              ) : activeGeofences.length === 0 ? (
                <div>
                  <p className="text-sm font-bold text-amber-600">No Sites Assigned</p>
                  <p className="text-xs text-slate-500">GPS Active (±{currentPosition.accuracy}m)</p>
                </div>
              ) : currentPosition.accuracy > 80 ? (
                <div>
                  <p className="text-sm font-bold text-amber-600">Low GPS Precision</p>
                  <p className="text-xs text-slate-500">
                    Accuracy ±{currentPosition.accuracy}m (Needs ±80m or better)
                  </p>
                </div>
              ) : isInsideAnyGeofence ? (
                <div>
                  <p className="text-sm font-bold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>Inside Site Perimeter</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    Verified at {closestGeofence?.geofence.name || assignedProject?.name}
                  </p>
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
            <div className={`rounded-xl p-2.5 ${isInsideAnyGeofence && (currentPosition?.accuracy || 999) <= 80 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
              <Navigation className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] font-mono text-slate-500 flex justify-between items-center">
            <span>Accuracy: {currentPosition ? `±${currentPosition.accuracy}m` : '—'}</span>
            <span className={`font-semibold ${
              !currentPosition
                ? 'text-slate-400'
                : currentPosition.accuracy > 80
                ? 'text-amber-600'
                : isInsideAnyGeofence
                ? 'text-emerald-600'
                : 'text-rose-600'
            }`}>
              {!currentPosition
                ? '❌ No Signal'
                : currentPosition.accuracy > 80
                ? '⚠️ Low Precision'
                : isInsideAnyGeofence
                ? '✅ Inside Range'
                : '❌ Out of range'}
            </span>
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
          Attendance can only be recorded when your mobile/browser device GPS coordinates fall inside your assigned project site perimeter and on your authorized device.
        </p>

        {isLoading ? (
          <LoadingSpinner message="Checking project assignment and device..." />
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
                !currentPosition ||
                currentPosition.accuracy > 80 ||
                deviceValidation?.status !== 'MATCH'
              }
              className={`flex flex-col items-center justify-center gap-2 rounded-2xl p-6 transition-all border shadow-sm ${
                todayAttendance?.sign_in_at
                  ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                  : isInsideAnyGeofence && currentPosition && currentPosition.accuracy <= 80 && deviceValidation?.status === 'MATCH'
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
                    : deviceValidation?.status === 'NO_DEVICE'
                    ? 'Requires Device Registration'
                    : deviceValidation?.status === 'MISMATCH'
                    ? 'Locked to another device'
                    : !currentPosition
                    ? isLocating ? 'Acquiring GPS Signal...' : 'Location signal unavailable'
                    : currentPosition.accuracy > 80
                    ? `GPS accuracy too low (±${currentPosition.accuracy}m)`
                    : isInsideAnyGeofence
                    ? 'GPS & Device Verified — Ready'
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
                !currentPosition ||
                currentPosition.accuracy > 80 ||
                deviceValidation?.status !== 'MATCH'
              }
              className={`flex flex-col items-center justify-center gap-2 rounded-2xl p-6 transition-all border shadow-sm ${
                todayAttendance?.sign_out_at
                  ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                  : todayAttendance?.sign_in_at && isInsideAnyGeofence && currentPosition && currentPosition.accuracy <= 80 && deviceValidation?.status === 'MATCH'
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
                    : deviceValidation?.status === 'MISMATCH'
                    ? 'Locked to another device'
                    : !currentPosition
                    ? isLocating ? 'Acquiring GPS Signal...' : 'Location signal unavailable'
                    : currentPosition.accuracy > 80
                    ? `GPS accuracy too low (±${currentPosition.accuracy}m)`
                    : isInsideAnyGeofence
                    ? 'GPS & Device Verified — Ready'
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
