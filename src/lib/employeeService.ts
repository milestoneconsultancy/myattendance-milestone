import { supabase } from './supabaseClient'
import type { Profile, Project, Geofence } from '../types/database.types'

export interface CreateEmployeeInput {
  full_name: string
  email: string
  employee_code: string
  phone?: string | null
  password?: string
  project_id: string
  geofence_ids: string[]
}

export interface CreateEmployeeResult {
  success: boolean
  profile?: Profile
  project?: Project
  geofences?: Geofence[]
  tempPassword?: string
  error?: string
}

/**
 * Securely creates a new Employee account with project and multiple geofence assignments.
 * 1. Calls privileged backend endpoint (/api/create-employee) with admin's JWT token.
 * 2. Server creates auth.users, public.profiles, employee_project_assignments, and employee_geofence_assignments.
 * 3. Handles atomic rollback if any step fails.
 * 4. NEVER exposes the service_role key to client-side code.
 */
export async function createEmployeeAccount(input: CreateEmployeeInput): Promise<CreateEmployeeResult> {
  const { full_name, email, employee_code, phone, password, project_id, geofence_ids } = input

  // 1. Obtain current valid session and access token
  let token: string | null = null
  const { data: sessionData } = await supabase.auth.getSession()
  
  if (sessionData?.session?.access_token) {
    token = sessionData.session.access_token
  } else {
    // Attempt token refresh if session is missing in memory
    const { data: refreshData } = await supabase.auth.refreshSession()
    token = refreshData?.session?.access_token || null
  }

  if (!token) {
    return {
      success: false,
      error: 'Authentication required. Please sign in as an administrator to create employee accounts.'
    }
  }

  try {
    const response = await fetch('/api/create-employee', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        full_name: full_name.trim(),
        email: email.trim().toLowerCase(),
        employee_code: employee_code.trim().toUpperCase(),
        phone: phone?.trim() || null,
        password: password?.trim() || undefined,
        project_id,
        geofence_ids
      })
    })

    const data = await response.json().catch(() => null)

    if (response.ok && data?.success && data?.profile) {
      return {
        success: true,
        profile: data.profile as Profile,
        project: data.project as Project | undefined,
        geofences: data.geofences as Geofence[] | undefined,
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
          password: password?.trim() || undefined,
          project_id,
          geofence_ids
        }
      })

      if (!fnErr && fnData?.success && fnData?.profile) {
        return {
          success: true,
          profile: fnData.profile as Profile,
          project: fnData.project as Project | undefined,
          geofences: fnData.geofences as Geofence[] | undefined,
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
