import { createClient } from '@supabase/supabase-js'

/**
 * Serverless endpoint for initial employee device binding.
 * Enforces:
 *  1. JWT Authentication
 *  2. Active Employee Profile Status
 *  3. Single Active Device Rule: Rejects binding if an active device is already bound to the employee.
 *     (Only administrators can unbind a device to allow rebinding).
 *  4. Authoritative Database Insertion & Audit Logging.
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

  // 1. Extract Bearer token
  const authHeader = req.headers.authorization || req.headers.Authorization
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid Bearer token.' })
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Empty access token provided.' })
  }

  // 2. Read server-side environment variables
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
    console.error('[API bind-device] Server configuration error: Missing Supabase credentials.')
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
      return res.status(403).json({ error: 'Device binding blocked: Your employee account has been deactivated.' })
    }

    // 5. Check if an active device is ALREADY bound to this employee
    const { data: existingActiveDevices, error: existingErr } = await adminClient
      .from('devices')
      .select('id, device_id, device_name, is_active, bound_at')
      .eq('employee_id', callerUser.id)
      .eq('is_active', true)

    if (existingErr) {
      console.error('[API bind-device] Query existing devices error:', existingErr)
      return res.status(500).json({ error: `Database error checking existing devices: ${existingErr.message}` })
    }

    if (existingActiveDevices && existingActiveDevices.length > 0) {
      const activeDev = existingActiveDevices[0]
      return res.status(409).json({
        error: `An active device is already bound to your account (${activeDev.device_name || 'Bound Device'}). You cannot replace a registered device on your own. Please contact your Milestone administrator to unbind your previous device.`
      })
    }

    // 6. Validate device identifier and name from request
    const { device_id, device_name } = req.body || {}
    const cleanDeviceId = String(device_id || '').trim()
    const cleanDeviceName = String(device_name || 'Registered Device').trim()

    if (!cleanDeviceId || cleanDeviceId.length < 8) {
      return res.status(400).json({ error: 'Invalid client device identifier.' })
    }

    const nowIso = new Date().toISOString()

    // 7. Insert new authoritative device binding
    const { data: newDevice, error: insertErr } = await adminClient
      .from('devices')
      .insert({
        employee_id: callerUser.id,
        device_id: cleanDeviceId,
        device_name: cleanDeviceName,
        is_active: true,
        bound_at: nowIso,
        last_used_at: nowIso
      })
      .select()
      .single()

    if (insertErr) {
      console.error('[API bind-device] Insert device error:', insertErr)
      return res.status(500).json({ error: `Failed to bind device: ${insertErr.message}` })
    }

    // 8. Record audit log
    await adminClient.from('audit_logs').insert({
      actor_id: callerUser.id,
      action: 'DEVICE_BIND',
      entity_type: 'devices',
      entity_id: newDevice.id,
      new_data: {
        employee_id: callerUser.id,
        device_id: cleanDeviceId,
        device_name: cleanDeviceName
      },
      remark: `Employee bound initial device "${cleanDeviceName}"`
    })

    return res.status(200).json({
      success: true,
      message: `Device "${cleanDeviceName}" successfully linked to your account!`,
      device: newDevice
    })
  } catch (err) {
    console.error('[API bind-device] Unexpected error:', err)
    return res.status(500).json({
      error: (err && err.message) ? err.message : 'Unexpected internal server error binding device.'
    })
  }
}
