import { createClient } from '@supabase/supabase-js'

/**
 * Server-side Haversine distance formula in meters
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000 // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Helper: Format local date in YYYY-MM-DD format
 */
function getLocalDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Production-grade Server-side Attendance Authorization & Punch Handler.
 * Enforces:
 *  1. JWT Authentication
 *  2. Active Employee Profile Status
 *  3. Authoritative Device Binding (Locked to bound device)
 *  4. Valid Active Project Assignment for Today
 *  5. Explicit Geofence Assignment (NO generic fallback)
 *  6. Strict GPS Accuracy Verification (<= 80m)
 *  7. Server-side Distance Calculation & Geofence Boundary Check
 *  8. Attendance State Machine (no double clock-ins / clock-outs)
 *  9. Authoritative Attendance & Audit Log Recording
 */
export default async function handler(req, res) {
  // CORS & Preflight handling
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  )

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Only POST is supported.' })
  }

  // 1. Extract and validate Bearer token
  const authHeader = req.headers.authorization || req.headers.Authorization
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid Bearer token.' })
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Empty access token provided.' })
  }

  // 2. Initialize privileged Supabase Admin Client
  const supabaseUrl = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  ).trim()

  const serviceRoleKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim()

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[API attendance] Server configuration error: Missing Supabase credentials.')
    return res.status(500).json({ error: 'Server configuration error: Database service credentials missing.' })
  }

  try {
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })

    // 3. Verify caller JWT identity
    const { data: userData, error: userErr } = await adminClient.auth.getUser(token)
    if (userErr || !userData?.user) {
      return res.status(401).json({
        error: `Unauthorized: Invalid or expired session. (${userErr?.message || 'User not found'})`
      })
    }

    const callerUser = userData.user

    // 4. Verify employee profile exists and is active
    const { data: profileData, error: profileErr } = await adminClient
      .from('profiles')
      .select('id, role, full_name, is_active')
      .eq('id', callerUser.id)
      .maybeSingle()

    if (profileErr || !profileData) {
      return res.status(403).json({ error: 'Employee profile not found in system database.' })
    }

    if (profileData.is_active === false) {
      return res.status(403).json({ error: 'Attendance blocked: Your employee account has been deactivated.' })
    }

    // 5. Parse and validate request parameters
    const { action, latitude, longitude, accuracy, device_id } = req.body || {}

    if (action !== 'CLOCK_IN' && action !== 'CLOCK_OUT') {
      return res.status(400).json({ error: 'Invalid action. Must be either "CLOCK_IN" or "CLOCK_OUT".' })
    }

    if (typeof latitude !== 'number' || typeof longitude !== 'number' || isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ error: 'Invalid GPS coordinates provided.' })
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'GPS coordinates out of valid geographical range.' })
    }

    if (typeof accuracy !== 'number' || isNaN(accuracy) || accuracy <= 0) {
      return res.status(400).json({ error: 'GPS accuracy reading is missing or invalid.' })
    }

    // Maximum allowable GPS accuracy threshold (meters) for high-confidence location
    const MAX_ALLOWED_GPS_ACCURACY_METERS = 80
    if (accuracy > MAX_ALLOWED_GPS_ACCURACY_METERS) {
      return res.status(400).json({
        error: `GPS accuracy is too low (±${Math.round(accuracy)}m). High-confidence location required (within ±${MAX_ALLOWED_GPS_ACCURACY_METERS}m). Please enable high precision location, move to an open area, and try again.`
      })
    }

    const cleanDeviceId = String(device_id || '').trim()
    if (!cleanDeviceId) {
      return res.status(400).json({ error: 'Device identifier is required for attendance validation.' })
    }

    // 6. Authoritative Device Binding Verification
    const { data: boundDevices, error: deviceErr } = await adminClient
      .from('devices')
      .select('*')
      .eq('employee_id', callerUser.id)
      .eq('is_active', true)
      .order('bound_at', { ascending: false })

    if (deviceErr) {
      console.error('[API attendance] Device lookup error:', deviceErr)
      return res.status(500).json({ error: `Device verification error: ${deviceErr.message}` })
    }

    if (!boundDevices || boundDevices.length === 0) {
      return res.status(403).json({
        error: 'Attendance blocked: No authorized device is linked to your account. Please link this device first.'
      })
    }

    const activeBoundDevice = boundDevices[0]
    if (activeBoundDevice.device_id !== cleanDeviceId) {
      return res.status(403).json({
        error: `Attendance blocked: Unauthorized device. Your account is locked to "${activeBoundDevice.device_name || 'another device'}".`
      })
    }

    const todayDateStr = getLocalDateString()
    const nowIso = new Date().toISOString()

    // 7. Verify Active Project Assignment for Today
    const { data: projectAssignments, error: projAssignErr } = await adminClient
      .from('employee_project_assignments')
      .select('*')
      .eq('employee_id', callerUser.id)
      .eq('is_active', true)

    if (projAssignErr) {
      console.error('[API attendance] Project assignment lookup error:', projAssignErr)
      return res.status(500).json({ error: `Assignment lookup error: ${projAssignErr.message}` })
    }

    if (!projectAssignments || projectAssignments.length === 0) {
      return res.status(403).json({ error: 'Attendance blocked: You have no active project assigned.' })
    }

    // Safe memory sort by creation or assignment date
    const sortedAssignments = [...projectAssignments].sort((a, b) => {
      const dateA = a.created_at || a.assigned_from || a.assigned_at || ''
      const dateB = b.created_at || b.assigned_from || b.assigned_at || ''
      return String(dateB).localeCompare(String(dateA))
    })

    // Find assignment valid for today
    let activeAssignment = null
    for (const assign of sortedAssignments) {
      const fromOk = !assign.assigned_from || String(assign.assigned_from).slice(0, 10) <= todayDateStr
      const toOk = !assign.assigned_to || String(assign.assigned_to).slice(0, 10) >= todayDateStr
      if (fromOk && toOk) {
        activeAssignment = assign
        break
      }
    }

    // Fallback to first active assignment if dates are open
    if (!activeAssignment) {
      activeAssignment = sortedAssignments[0]
    }

    // Fetch Project record
    const { data: targetProject, error: projErr } = await adminClient
      .from('projects')
      .select('id, name, code, is_active')
      .eq('id', activeAssignment.project_id)
      .maybeSingle()

    if (projErr || !targetProject || !targetProject.is_active) {
      return res.status(403).json({ error: 'Attendance blocked: Your assigned project is inactive or does not exist.' })
    }

    // 8. Explicit Geofence Assignment Verification (NO FALLBACK)
    const { data: empGeoAssigns, error: geoAssignErr } = await adminClient
      .from('employee_geofence_assignments')
      .select('geofence_id, is_active')
      .eq('employee_id', callerUser.id)
      .eq('is_active', true)

    if (geoAssignErr) {
      console.error('[API attendance] Geofence assignment lookup error:', geoAssignErr)
      return res.status(500).json({ error: `Geofence assignment lookup error: ${geoAssignErr.message}` })
    }

    if (!empGeoAssigns || empGeoAssigns.length === 0) {
      return res.status(403).json({
        error: `Attendance blocked: No authorized site perimeters assigned for project "${targetProject.name}". Please ask your administrator to authorize your site location.`
      })
    }

    const assignedGeofenceIds = empGeoAssigns.map((g) => g.geofence_id)
    const { data: authorizedGeofences, error: geoFetchErr } = await adminClient
      .from('geofences')
      .select('*')
      .in('id', assignedGeofenceIds)
      .eq('project_id', targetProject.id)
      .eq('is_active', true)

    if (geoFetchErr) {
      console.error('[API attendance] Geofence details lookup error:', geoFetchErr)
      return res.status(500).json({ error: `Geofence query error: ${geoFetchErr.message}` })
    }

    if (!authorizedGeofences || authorizedGeofences.length === 0) {
      return res.status(403).json({
        error: `Attendance blocked: None of your assigned site perimeters under "${targetProject.name}" are currently active.`
      })
    }

    // 9. Server-Side Distance Calculation & Boundary Validation
    let matchedGeofence = null
    let matchedDistance = Infinity
    let closestGeofence = null
    let closestDistance = Infinity

    for (const geo of authorizedGeofences) {
      const radiusMeters = Number(geo.radius_meters || geo.radius || 150)
      const dist = calculateHaversineDistance(latitude, longitude, geo.latitude, geo.longitude)
      if (dist < closestDistance) {
        closestDistance = dist
        closestGeofence = { ...geo, radius_meters: radiusMeters }
      }
      if (dist <= radiusMeters) {
        matchedGeofence = { ...geo, radius_meters: radiusMeters }
        matchedDistance = dist
        break
      }
    }

    if (!matchedGeofence) {
      return res.status(400).json({
        error: `Outside authorized site perimeter. You are ${Math.round(closestDistance)}m from "${closestGeofence?.name || 'authorized site'}" (Maximum allowed perimeter radius: ${closestGeofence?.radius_meters || 150}m).`
      })
    }

    // 10. Fetch today's existing attendance record
    const { data: todayAttendance, error: attendFetchErr } = await adminClient
      .from('daily_attendance')
      .select('*')
      .eq('employee_id', callerUser.id)
      .eq('attendance_date', todayDateStr)
      .maybeSingle()

    if (attendFetchErr) {
      console.error('[API attendance] Daily attendance lookup error:', attendFetchErr)
      return res.status(500).json({ error: `Attendance lookup error: ${attendFetchErr.message}` })
    }

    // 11. Execute Attendance State Machine Transitions
    let savedAttendance = null

    if (action === 'CLOCK_IN') {
      if (todayAttendance && todayAttendance.sign_in_at) {
        return res.status(409).json({
          error: `Already clocked in for today (${todayDateStr}) at ${new Date(todayAttendance.sign_in_at).toLocaleTimeString('en-IN')}.`
        })
      }

      if (todayAttendance) {
        // Update existing draft record for today
        const { data: updatedAttend, error: updateErr } = await adminClient
          .from('daily_attendance')
          .update({
            project_id: targetProject.id,
            sign_in_at: nowIso,
            status: 'present',
            attendance_source: 'geofence',
            updated_at: nowIso
          })
          .eq('id', todayAttendance.id)
          .select()
          .single()

        if (updateErr) throw updateErr
        savedAttendance = updatedAttend
      } else {
        // Insert new daily_attendance record
        const { data: newAttend, error: insertErr } = await adminClient
          .from('daily_attendance')
          .insert({
            employee_id: callerUser.id,
            project_id: targetProject.id,
            attendance_date: todayDateStr,
            sign_in_at: nowIso,
            status: 'present',
            attendance_source: 'geofence'
          })
          .select()
          .single()

        if (insertErr) throw insertErr
        savedAttendance = newAttend
      }

      // Record attendance event
      await adminClient.from('attendance_events').insert({
        employee_id: callerUser.id,
        project_id: targetProject.id,
        geofence_id: matchedGeofence.id,
        device_id: activeBoundDevice.device_id,
        event_type: 'SIGN_IN',
        event_time: nowIso,
        latitude: latitude,
        longitude: longitude,
        distance_meters: Math.round(matchedDistance)
      })

      // Update device last used timestamp
      await adminClient
        .from('devices')
        .update({ last_used_at: nowIso })
        .eq('id', activeBoundDevice.id)

      // Record audit log
      await adminClient.from('audit_logs').insert({
        actor_id: callerUser.id,
        action: 'ATTENDANCE_CLOCK_IN',
        entity_type: 'daily_attendance',
        entity_id: callerUser.id,
        new_data: {
          project_id: targetProject.id,
          project_name: targetProject.name,
          geofence_id: matchedGeofence.id,
          geofence_name: matchedGeofence.name,
          device_id: activeBoundDevice.device_id,
          device_name: activeBoundDevice.device_name,
          latitude,
          longitude,
          distance_meters: Math.round(matchedDistance),
          accuracy: Math.round(accuracy)
        },
        remark: `Clock In verified inside "${matchedGeofence.name}" (Accuracy ±${Math.round(accuracy)}m)`
      })

      return res.status(200).json({
        success: true,
        message: `Successfully clocked in at ${matchedGeofence.name}!`,
        attendance: savedAttendance,
        site: matchedGeofence.name
      })
    } else if (action === 'CLOCK_OUT') {
      if (!todayAttendance || !todayAttendance.sign_in_at) {
        return res.status(400).json({ error: 'Cannot clock out: You have not clocked in today.' })
      }

      if (todayAttendance.sign_out_at) {
        return res.status(409).json({
          error: `Already clocked out for today (${todayDateStr}) at ${new Date(todayAttendance.sign_out_at).toLocaleTimeString('en-IN')}.`
        })
      }

      const signInTime = new Date(todayAttendance.sign_in_at).getTime()
      const signOutTime = new Date(nowIso).getTime()
      const workingMinutes = Math.max(0, Math.round((signOutTime - signInTime) / (1000 * 60)))

      const { data: updatedAttend, error: updateErr } = await adminClient
        .from('daily_attendance')
        .update({
          sign_out_at: nowIso,
          working_minutes: workingMinutes,
          updated_at: nowIso
        })
        .eq('id', todayAttendance.id)
        .select()
        .single()

      if (updateErr) throw updateErr
      savedAttendance = updatedAttend

      // Record attendance event
      await adminClient.from('attendance_events').insert({
        employee_id: callerUser.id,
        project_id: targetProject.id,
        geofence_id: matchedGeofence.id,
        device_id: activeBoundDevice.device_id,
        event_type: 'SIGN_OUT',
        event_time: nowIso,
        latitude: latitude,
        longitude: longitude,
        distance_meters: Math.round(matchedDistance)
      })

      // Update device last used timestamp
      await adminClient
        .from('devices')
        .update({ last_used_at: nowIso })
        .eq('id', activeBoundDevice.id)

      // Record audit log
      await adminClient.from('audit_logs').insert({
        actor_id: callerUser.id,
        action: 'ATTENDANCE_CLOCK_OUT',
        entity_type: 'daily_attendance',
        entity_id: todayAttendance.id,
        new_data: {
          project_id: targetProject.id,
          project_name: targetProject.name,
          geofence_id: matchedGeofence.id,
          geofence_name: matchedGeofence.name,
          device_id: activeBoundDevice.device_id,
          device_name: activeBoundDevice.device_name,
          working_minutes: workingMinutes,
          latitude,
          longitude,
          distance_meters: Math.round(matchedDistance),
          accuracy: Math.round(accuracy)
        },
        remark: `Clock Out recorded with duration ${workingMinutes} mins at "${matchedGeofence.name}"`
      })

      const hrs = Math.floor(workingMinutes / 60)
      const mins = workingMinutes % 60

      return res.status(200).json({
        success: true,
        message: `Successfully clocked out! Total working time: ${hrs}h ${mins}m.`,
        attendance: savedAttendance,
        site: matchedGeofence.name
      })
    }
  } catch (err) {
    console.error('[API attendance] Unexpected error:', err)
    return res.status(500).json({
      error: (err && err.message) ? err.message : 'Unexpected internal server error processing attendance.'
    })
  }
}

