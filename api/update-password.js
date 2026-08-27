import { createClient } from '@supabase/supabase-js'

/**
 * Serverless endpoint to update an authenticated employee's password without requiring
 * reauthentication / current password when they are in forced initial password change mode.
 * Uses SUPABASE_SERVICE_ROLE_KEY strictly on the server side.
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

  // 1. Extract Bearer token from caller
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

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[API update-password] Server configuration error: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL missing.')
    return res.status(500).json({
      error: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is not configured in the server environment.'
    })
  }

  try {
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })

    // 3. Authenticate caller from session token
    const { data: userData, error: userErr } = await adminClient.auth.getUser(token)
    if (userErr || !userData?.user) {
      return res.status(401).json({
        error: `Unauthorized: Invalid or expired session. (${userErr?.message || 'User not found'})`
      })
    }

    const callerUser = userData.user

    // 4. Validate input password
    const { password } = req.body || {}
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' })
    }

    // 5. Update user password using privileged admin API (bypasses GoTrue current_password requirement)
    const { error: updateAuthErr } = await adminClient.auth.admin.updateUserById(callerUser.id, {
      password: password,
      user_metadata: {
        ...(callerUser.user_metadata || {}),
        must_change_password: false
      }
    })

    if (updateAuthErr) {
      console.error('[API update-password] auth.admin.updateUserById failed:', updateAuthErr)
      return res.status(500).json({
        error: `Failed to update password: ${updateAuthErr.message}`
      })
    }

    // 6. Update public.profiles must_change_password to false
    const { error: profileErr } = await adminClient
      .from('profiles')
      .update({
        must_change_password: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', callerUser.id)

    if (profileErr) {
      console.error('[API update-password] Profile update error:', profileErr)
    }

    // 7. Record audit log
    await adminClient.from('audit_logs').insert({
      actor_id: callerUser.id,
      action: 'PASSWORD_UPDATE',
      entity_type: 'profiles',
      entity_id: callerUser.id,
      remark: 'Employee successfully updated initial temporary password to permanent password'
    })

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully.'
    })
  } catch (err) {
    console.error('[API update-password] Unexpected error:', err)
    return res.status(500).json({
      error: (err && err.message) ? err.message : 'Unexpected internal server error updating password.'
    })
  }
}
