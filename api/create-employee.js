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
 * Serverless function to securely create an Employee account.
 * Uses SUPABASE_SERVICE_ROLE_KEY exclusively on the server side.
 * 
 * Flow:
 * 1. Verifies caller JWT token from Authorization header.
 * 2. Verifies caller's profile role is 'admin'.
 * 3. Checks for duplicate email or employee_code in public.profiles.
 * 4. Calls auth.admin.createUser with email_confirm: true and a unique temporary password.
 * 5. Inserts public.profiles using the EXACT same UUID (profiles.id = auth.users.id).
 * 6. Partial-failure handling: If profiles insert fails, deletes the auth user (rollback).
 * 7. Records immutable audit log.
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

  const authHeader = req.headers.authorization || req.headers.Authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid Bearer token in Authorization header.' })
  }

  const token = authHeader.replace('Bearer ', '').trim()

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[API create-employee] Server configuration error: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL missing.')
    return res.status(500).json({
      error: 'Server configuration error: Missing Supabase credentials in server environment. Please set SUPABASE_SERVICE_ROLE_KEY in environment variables.'
    })
  }

  try {
    // 1. Verify caller identity using JWT token
    const authClient = createClient(supabaseUrl, anonKey || serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
    const { data: { user: callerUser }, error: tokenErr } = await authClient.auth.getUser(token)

    if (tokenErr || !callerUser) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired authentication token.' })
    }

    // 2. Initialize privileged admin client with service_role key
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    // Verify caller role is 'admin' from public.profiles
    const { data: callerProfile, error: profileCheckErr } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .maybeSingle()

    if (profileCheckErr || callerProfile?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Only administrators can create employee accounts.' })
    }

    // 3. Extract & Validate input
    const { full_name, email, employee_code, phone, password } = req.body || {}

    if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
      return res.status(400).json({ error: 'Employee full name is required.' })
    }

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'A valid compulsory email address is required.' })
    }

    const cleanEmail = email.trim().toLowerCase()
    const cleanName = full_name.trim()
    const cleanCode = employee_code ? String(employee_code).trim().toUpperCase() : null
    const cleanPhone = phone ? String(phone).trim() : null
    const initialPassword = password && String(password).trim().length >= 8 
      ? String(password).trim() 
      : generateSecureTempPassword()

    // Duplicate check in profiles
    const { data: existingEmail } = await adminClient
      .from('profiles')
      .select('id, email')
      .eq('email', cleanEmail)
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

    // 4. Create Auth User in auth.users via admin API
    let createdAuthUserId = null
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

    // 5. Insert public.profiles with the EXACT SAME auth user UUID
    const { data: newProfile, error: profileInsertErr } = await adminClient
      .from('profiles')
      .insert({
        id: createdAuthUserId, // EXACT MATCH to auth.users.id
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
      console.error('[API create-employee] Profile insert failed, rolling back auth user:', profileInsertErr)
      // PARTIAL FAILURE ROLLBACK: Delete newly created auth user so we don't leave orphaned auth record
      try {
        await adminClient.auth.admin.deleteUser(createdAuthUserId)
      } catch (rollbackErr) {
        console.error('[API create-employee] Rollback error:', rollbackErr)
      }
      return res.status(500).json({
        error: `Failed to create employee profile: ${profileInsertErr.message}. Auth user creation was rolled back.`
      })
    }

    // 6. Log audit event
    await adminClient.from('audit_logs').insert({
      actor_id: callerUser.id,
      action: 'EMPLOYEE_CREATE',
      entity_type: 'profiles',
      entity_id: createdAuthUserId,
      new_data: {
        full_name: cleanName,
        email: cleanEmail,
        employee_code: cleanCode,
        phone: cleanPhone
      },
      remark: `Created employee profile for ${cleanName} (${cleanEmail})`
    })

    return res.status(200).json({
      success: true,
      profile: newProfile,
      tempPassword: initialPassword
    })
  } catch (err) {
    console.error('[API create-employee] Unexpected error:', err)
    return res.status(500).json({
      error: (err && err.message) ? err.message : 'Unexpected internal server error creating employee.'
    })
  }
}
