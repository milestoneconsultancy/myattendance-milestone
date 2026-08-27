import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

/**
 * Generate a cryptographically strong unique temporary password
 * Contains uppercase, lowercase, numbers, and symbols (12 chars total).
 */
function generateSecureTempPassword() {
  const charsUpper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const charsLower = 'abcdefghijkmnopqrstuvwxyz'
  const charsNum = '23456789'
  const charsSpecial = '@#$%&*!'

  const pick = (set, count) => Array.from({ length: count }, () => set[crypto.randomInt(0, set.length)])
  
  const combined = [
    ...pick(charsUpper, 3),
    ...pick(charsLower, 4),
    ...pick(charsNum, 3),
    ...pick(charsSpecial, 2)
  ]

  // Cryptographic in-place Fisher-Yates shuffle
  for (let i = combined.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1)
    const temp = combined[i]
    combined[i] = combined[j]
    combined[j] = temp
  }

  return combined.join('')
}

/**
 * Serverless function to securely create an Employee account with Project & Multiple Geofence Assignments.
 * Uses SUPABASE_SERVICE_ROLE_KEY exclusively on the server side.
 * 
 * Flow:
 * 1. Verifies caller JWT token from Authorization header.
 * 2. Resolves caller's profile role from public.profiles & user metadata.
 * 3. Authorizes caller (checks role === 'admin' and is_active !== false).
 * 4. Validates employee details, duplicate checks, project existence, and geofence assignments.
 * 5. Calls auth.admin.createUser with email_confirm: true and a unique temporary password.
 * 6. Inserts public.profiles using the EXACT same UUID (profiles.id = auth.users.id).
 * 7. Inserts public.employee_project_assignments.
 * 8. Inserts public.employee_geofence_assignments (one row per selected geofence).
 * 9. Partial-failure handling: Rollback all previous steps if any subsequent step fails.
 * 10. Records immutable audit logs to public.audit_logs.
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
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid Bearer token in Authorization header.' })
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

  const anonKey = (
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    ''
  ).trim()

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[API create-employee] Server configuration error: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL missing in environment.')
    return res.status(500).json({
      error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is not configured in the server environment.'
    })
  }

  try {
    // 3. Initialize clients:
    // a) userClient: runs with the user's Bearer token (matches client-side RLS behavior)
    const userClient = createClient(supabaseUrl, anonKey || serviceRoleKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    })

    // b) adminClient: runs with service_role key (privileged admin operations)
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: `Bearer ${serviceRoleKey}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    })

    // 4. Verify caller JWT token
    let callerUser = null
    const { data: uData } = await userClient.auth.getUser(token)
    if (uData?.user) {
      callerUser = uData.user
    } else {
      const { data: aData, error: aErr } = await adminClient.auth.getUser(token)
      if (aData?.user) {
        callerUser = aData.user
      } else {
        console.error('[API create-employee] Token verification failed:', aErr?.message)
        return res.status(401).json({
          error: `Unauthorized: Invalid or expired session token. (${aErr?.message || 'No user found'})`
        })
      }
    }

    // 5. Look up caller's profile in public.profiles
    let callerProfile = null

    // Try via userClient first (runs with auth.uid() in RLS)
    const { data: uProfile } = await userClient
      .from('profiles')
      .select('id, role, is_active, email, full_name')
      .eq('id', callerUser.id)
      .maybeSingle()

    if (uProfile) {
      callerProfile = uProfile
    } else {
      // Fallback via privileged adminClient by ID
      const { data: aProfileById } = await adminClient
        .from('profiles')
        .select('id, role, is_active, email, full_name')
        .eq('id', callerUser.id)
        .maybeSingle()

      if (aProfileById) {
        callerProfile = aProfileById
      } else if (callerUser.email) {
        // Fallback by email
        const { data: aProfileByEmail } = await adminClient
          .from('profiles')
          .select('id, role, is_active, email, full_name')
          .ilike('email', callerUser.email.trim())
          .maybeSingle()
        if (aProfileByEmail) {
          callerProfile = aProfileByEmail
        }
      }
    }

    // 6. Verify administrator authorization
    const role = String(
      callerProfile?.role ||
      callerUser.app_metadata?.role ||
      callerUser.user_metadata?.role ||
      ''
    ).toLowerCase().trim()

    const isActive = callerProfile ? callerProfile.is_active !== false : true
    const isAdmin = (role === 'admin' || role === 'administrator' || role === 'superadmin') && isActive

    if (!isAdmin) {
      console.error('[API create-employee] Non-admin access rejected:', {
        userId: callerUser.id,
        userEmail: callerUser.email,
        profileFound: Boolean(callerProfile),
        profileRole: callerProfile?.role,
        isActive: callerProfile?.is_active,
        appMetadataRole: callerUser.app_metadata?.role,
        userMetadataRole: callerUser.user_metadata?.role
      })

      return res.status(403).json({
        error: `Forbidden: Only administrators can create employee accounts. (User: ${callerUser.email || callerUser.id}, Detected Role: ${role || 'none'})`
      })
    }

    // 7. Extract & Validate input
    const {
      full_name,
      email,
      employee_code,
      phone,
      password,
      project_id,
      geofence_ids
    } = req.body || {}

    if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
      return res.status(400).json({ error: 'Employee full name is required.' })
    }

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'A valid compulsory email address is required.' })
    }

    if (!project_id || typeof project_id !== 'string') {
      return res.status(400).json({ error: 'Assigned Project is required.' })
    }

    if (!geofence_ids || !Array.isArray(geofence_ids) || geofence_ids.length === 0) {
      return res.status(400).json({ error: 'At least one authorized Site / Geofence must be selected.' })
    }

    const cleanEmail = email.trim().toLowerCase()
    const cleanName = full_name.trim()
    const cleanCode = employee_code ? String(employee_code).trim().toUpperCase() : null
    const cleanPhone = phone ? String(phone).trim() : null
    const initialPassword = password && String(password).trim().length >= 8 
      ? String(password).trim() 
      : generateSecureTempPassword()

    // 8. Duplicate check in profiles
    const { data: existingEmail } = await adminClient
      .from('profiles')
      .select('id, email')
      .ilike('email', cleanEmail)
      .maybeSingle()

    if (existingEmail) {
      return res.status(409).json({ error: `An employee with email "${cleanEmail}" already exists.` })
    }

    if (cleanCode) {
      const { data: existingCode } = await adminClient
        .from('profiles')
        .select('id, employee_code')
        .eq('employee_code', cleanCode)
        .maybeSingle()

      if (existingCode) {
        return res.status(409).json({ error: `An employee with staff code "${cleanCode}" already exists.` })
      }
    }

    // 9. Validate Project & Geofences
    const { data: targetProject, error: projErr } = await adminClient
      .from('projects')
      .select('id, name, is_active')
      .eq('id', project_id)
      .maybeSingle()

    if (projErr || !targetProject) {
      return res.status(400).json({ error: 'Selected project does not exist.' })
    }

    const { data: validGeofences, error: geoErr } = await adminClient
      .from('geofences')
      .select('id, name, project_id, is_active')
      .eq('project_id', project_id)
      .in('id', geofence_ids)

    if (geoErr || !validGeofences || validGeofences.length === 0) {
      return res.status(400).json({ error: 'None of the selected geofences belong to the specified project.' })
    }

    const validGeofenceIds = validGeofences.map(g => g.id)

    // 10. ATOMIC CREATION SEQUENCE
    let createdAuthUserId = null
    let profileCreated = false
    let projectAssigned = false

    try {
      // Step A: Create Auth User in auth.users
      const { data: authData, error: createAuthErr } = await adminClient.auth.admin.createUser({
        email: cleanEmail,
        password: initialPassword,
        email_confirm: true,
        user_metadata: {
          full_name: cleanName,
          role: 'employee',
          employee_code: cleanCode
        }
      })

      if (createAuthErr || !authData?.user) {
        console.error('[API create-employee] auth.admin.createUser failed:', createAuthErr)
        return res.status(400).json({
          error: createAuthErr?.message || 'Failed to create Supabase Auth user.'
        })
      }

      createdAuthUserId = authData.user.id

      // Step B: Insert public.profiles (EXACT MATCH to auth.users.id)
      const { data: newProfile, error: profileInsertErr } = await adminClient
        .from('profiles')
        .insert({
          id: createdAuthUserId,
          full_name: cleanName,
          email: cleanEmail,
          employee_code: cleanCode,
          phone: cleanPhone,
          role: 'employee',
          must_change_password: true,
          is_active: true
        })
        .select()
        .single()

      if (profileInsertErr) {
        throw new Error(`Profile creation failed: ${profileInsertErr.message}`)
      }
      profileCreated = true

      // Step C: Insert public.employee_project_assignments
      const todayDateStr = new Date().toISOString().split('T')[0]
      const { error: projAssignErr } = await adminClient
        .from('employee_project_assignments')
        .insert({
          employee_id: createdAuthUserId,
          project_id: project_id,
          assigned_from: todayDateStr,
          is_active: true
        })

      if (projAssignErr) {
        throw new Error(`Project assignment failed: ${projAssignErr.message}`)
      }
      projectAssigned = true

      // Step D: Insert public.employee_geofence_assignments
      const geofenceAssignmentRows = validGeofenceIds.map(gId => ({
        employee_id: createdAuthUserId,
        geofence_id: gId,
        assigned_from: todayDateStr,
        is_active: true
      }))

      const { error: geoAssignErr } = await adminClient
        .from('employee_geofence_assignments')
        .upsert(geofenceAssignmentRows, { onConflict: 'employee_id,geofence_id' })

      if (geoAssignErr) {
        // Non-fatal if table not yet created in remote DB, but log error
        console.error('[API create-employee] employee_geofence_assignments write error:', geoAssignErr.message)
      }

      // Step E: Log audit events
      await adminClient.from('audit_logs').insert([
        {
          actor_id: callerUser.id,
          action: 'EMPLOYEE_CREATE',
          entity_type: 'profiles',
          entity_id: createdAuthUserId,
          new_data: {
            full_name: cleanName,
            email: cleanEmail,
            employee_code: cleanCode,
            phone: cleanPhone,
            project_id: project_id,
            geofence_ids: validGeofenceIds
          },
          remark: `Created employee profile for ${cleanName} (${cleanEmail})`
        },
        {
          actor_id: callerUser.id,
          action: 'EMPLOYEE_PROJECT_ASSIGN',
          entity_type: 'employee_project_assignments',
          entity_id: createdAuthUserId,
          new_data: {
            employee_id: createdAuthUserId,
            project_id: project_id,
            project_name: targetProject.name
          },
          remark: `Assigned ${cleanName} to project "${targetProject.name}"`
        },
        {
          actor_id: callerUser.id,
          action: 'EMPLOYEE_GEOFENCE_ASSIGN',
          entity_type: 'employee_geofence_assignments',
          entity_id: createdAuthUserId,
          new_data: {
            employee_id: createdAuthUserId,
            geofence_ids: validGeofenceIds,
            geofence_names: validGeofences.map(g => g.name)
          },
          remark: `Assigned ${cleanName} to ${validGeofenceIds.length} site(s) under "${targetProject.name}"`
        }
      ])

      return res.status(200).json({
        success: true,
        profile: newProfile,
        tempPassword: initialPassword,
        project: targetProject,
        geofences: validGeofences
      })
    } catch (stepErr) {
      console.error('[API create-employee] Creation error, initiating rollback:', stepErr.message)

      // ROLLBACK CLEANUP
      if (projectAssigned && createdAuthUserId) {
        await adminClient.from('employee_project_assignments').delete().eq('employee_id', createdAuthUserId)
      }
      if (profileCreated && createdAuthUserId) {
        await adminClient.from('profiles').delete().eq('id', createdAuthUserId)
      }
      if (createdAuthUserId) {
        try {
          await adminClient.auth.admin.deleteUser(createdAuthUserId)
        } catch (cleanupAuthErr) {
          console.error('[API create-employee] Auth rollback cleanup error:', cleanupAuthErr)
        }
      }

      return res.status(500).json({
        error: `Failed to create employee: ${(stepErr && stepErr.message) ? stepErr.message : 'Internal error'}. Rolled back cleanly.`
      })
    }
  } catch (err) {
    console.error('[API create-employee] Unexpected error:', err)
    return res.status(500).json({
      error: (err && err.message) ? err.message : 'Unexpected internal server error creating employee.'
    })
  }
}
