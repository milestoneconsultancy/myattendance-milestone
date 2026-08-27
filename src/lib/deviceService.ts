import { supabase } from './supabaseClient'
import type { Device } from '../types/database.types'

const DEVICE_STORAGE_KEY = 'milestone_client_device_id'

/**
 * Generates or retrieves a persistent, secure device identifier for the current browser/installation.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server-side'

  try {
    let deviceId = localStorage.getItem(DEVICE_STORAGE_KEY)
    if (!deviceId || deviceId.trim().length < 10) {
      deviceId = crypto.randomUUID ? crypto.randomUUID() : `dev-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
      localStorage.setItem(DEVICE_STORAGE_KEY, deviceId)
    }
    return deviceId
  } catch {
    // Fallback if localStorage is restricted (e.g. private browsing storage isolation)
    return `session-${navigator.userAgent.replace(/[^a-zA-Z0-9]/g, '').substring(0, 32)}`
  }
}

/**
 * Computes a human-readable device name from browser and platform environment.
 * Examples: "Windows • Chrome (Desktop)", "Android • Chrome Mobile", "iPhone • Mobile Safari"
 */
export function getDeviceName(): string {
  if (typeof window === 'undefined') return 'Unknown Device'

  const ua = navigator.userAgent || ''
  let os = 'Unknown OS'
  let browser = 'Browser'
  let isMobile = false

  // Detect OS
  if (/Windows NT 10.0|Windows NT 11.0/i.test(ua)) os = 'Windows'
  else if (/Windows/i.test(ua)) os = 'Windows'
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS'
  else if (/iPhone|iPad|iPod/i.test(ua)) {
    os = /iPad/i.test(ua) ? 'iPadOS' : 'iOS'
    isMobile = true
  } else if (/Android/i.test(ua)) {
    os = 'Android'
    isMobile = true
  } else if (/Linux/i.test(ua)) os = 'Linux'

  // Detect Browser
  if (/Edg\//i.test(ua)) browser = 'Edge'
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome'
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari'
  else if (/Firefox\//i.test(ua)) browser = 'Firefox'
  else if (/Opera|OPR\//i.test(ua)) browser = 'Opera'

  const formFactor = isMobile ? 'Mobile' : 'Desktop'
  return `${os} • ${browser} (${formFactor})`
}

export interface DeviceValidationResult {
  isValid: boolean
  status: 'NO_DEVICE' | 'MATCH' | 'MISMATCH' | 'ERROR'
  boundDevice: Device | null
  currentDeviceId: string
  currentDeviceName: string
  error?: string
}

/**
 * Queries active device binding for an employee and validates against current client device ID.
 */
export async function validateEmployeeDevice(employeeId: string): Promise<DeviceValidationResult> {
  const currentDeviceId = getDeviceId()
  const currentDeviceName = getDeviceName()

  if (!employeeId) {
    return {
      isValid: false,
      status: 'NO_DEVICE',
      boundDevice: null,
      currentDeviceId,
      currentDeviceName,
      error: 'Invalid employee ID'
    }
  }

  try {
    const { data: boundDevices, error } = await supabase
      .from('devices')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('is_active', true)
      .order('bound_at', { ascending: false })

    if (error) {
      console.error('[DeviceService] Error querying device binding:', error)
      return {
        isValid: false,
        status: 'ERROR',
        boundDevice: null,
        currentDeviceId,
        currentDeviceName,
        error: error.message
      }
    }

    if (!boundDevices || boundDevices.length === 0) {
      return {
        isValid: false,
        status: 'NO_DEVICE',
        boundDevice: null,
        currentDeviceId,
        currentDeviceName
      }
    }

    // Active bound device found
    const activeDevice = boundDevices[0]
    const isMatch = activeDevice.device_id === currentDeviceId

    return {
      isValid: isMatch,
      status: isMatch ? 'MATCH' : 'MISMATCH',
      boundDevice: activeDevice,
      currentDeviceId,
      currentDeviceName
    }
  } catch (err) {
    console.error('[DeviceService] Unexpected validation error:', err)
    return {
      isValid: false,
      status: 'ERROR',
      boundDevice: null,
      currentDeviceId,
      currentDeviceName,
      error: (err as Error).message
    }
  }
}

/**
 * Authoritatively binds the current client device to the authenticated employee via server API.
 */
export async function bindCurrentDevice(employeeId: string): Promise<{ success: boolean; device?: Device; error?: string }> {
  if (!employeeId) {
    return { success: false, error: 'Employee ID is required.' }
  }

  const currentDeviceId = getDeviceId()
  const currentDeviceName = getDeviceName()

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
      return { success: false, error: 'Session expired. Please log in again.' }
    }

    const response = await fetch('/api/bind-device', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        device_id: currentDeviceId,
        device_name: currentDeviceName
      })
    })

    const resData = await response.json().catch(() => null)

    if (response.ok && resData?.success) {
      return { success: true, device: resData.device as Device }
    }

    return {
      success: false,
      error: resData?.error || 'Failed to bind device to account.'
    }
  } catch (err) {
    console.error('[DeviceService] Unexpected error during device binding:', err)
    return { success: false, error: (err as Error).message || 'Network error binding device.' }
  }
}

/**
 * Updates last_used_at timestamp on the active bound device.
 */
export async function touchDeviceUsage(deviceId: string, employeeId: string): Promise<void> {
  try {
    await supabase
      .from('devices')
      .update({
        last_used_at: new Date().toISOString()
      })
      .eq('device_id', deviceId)
      .eq('employee_id', employeeId)
      .eq('is_active', true)
  } catch {
    // Non-fatal timestamp touch
  }
}

