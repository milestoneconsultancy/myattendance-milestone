import { supabase } from './supabaseClient'
import type { Profile } from '../types/database.types'

export interface CreateEmployeeInput {
  full_name: string
  email: string
  employee_code: string
  phone?: string | null
  password?: string
}

export interface CreateEmployeeResult {
  success: boolean
  profile?: Profile
  tempPassword?: string
  error?: string
}

/**
 * Securely creates a new Employee account.
 * 1. Calls the privileged backend endpoint (/api/create-employee) with the admin's JWT token.
 * 2. The server-side function creates auth.users record via auth.admin.createUser and inserts public.profiles with the exact same UUID.
 * 3. Handles rollback if profiles creation fails.
 * 4. NEVER exposes the service_role key to client-side code.
 */
export async function createEmployeeAccount(input: CreateEmployeeInput): Promise<CreateEmployeeResult> {
  const { full_name, email, employee_code, phone, password } = input

  // Verify current admin session
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return {
      success: false,
      error: 'Authentication required. Please sign in as an administrator.'
    }
  }

  try {
    const response = await fetch('/api/create-employee', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        full_name: full_name.trim(),
        email: email.trim().toLowerCase(),
        employee_code: employee_code.trim().toUpperCase(),
        phone: phone?.trim() || null,
        password: password?.trim() || undefined
      })
    })

    const data = await response.json().catch(() => null)

    if (response.ok && data?.success && data?.profile) {
      return {
        success: true,
        profile: data.profile as Profile,
        tempPassword: data.tempPassword || password || 'Milestone@2026'
      }
    }

    if (data?.error) {
      return {
        success: false,
        error: data.error
      }
    }

    // Fallback to Supabase Edge Function if /api/ is deployed as Supabase Function
    if (response.status === 404) {
      const { data: fnData, error: fnErr } = await supabase.functions.invoke('create-employee', {
        body: {
          full_name: full_name.trim(),
          email: email.trim().toLowerCase(),
          employee_code: employee_code.trim().toUpperCase(),
          phone: phone?.trim() || null,
          password: password?.trim() || undefined
        }
      })

      if (!fnErr && fnData?.success && fnData?.profile) {
        return {
          success: true,
          profile: fnData.profile as Profile,
          tempPassword: fnData.tempPassword || password || 'Milestone@2026'
        }
      }

      if (fnData?.error) {
        return {
          success: false,
          error: fnData.error
        }
      }
    }

    return {
      success: false,
      error: data?.error || `Server returned error (${response.status}). Could not create employee account.`
    }
  } catch (err) {
    console.error('[EmployeeService] Request failed:', err)
    return {
      success: false,
      error: `Network error creating employee: ${(err as Error).message}`
    }
  }
}

