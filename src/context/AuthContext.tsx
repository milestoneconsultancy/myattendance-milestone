import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import type { Profile, UserRole } from '../types/database.types'
import type { AuthContextValue } from '../types/auth.types'

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  // Track in-flight profile fetch to avoid redundant duplicate queries
  const inFlightFetchRef = useRef<Promise<Profile | null> | null>(null)

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    if (!userId) {
      setProfile(null)
      setRole(null)
      return null
    }

    // Reuse existing in-flight request if already querying the same user
    if (inFlightFetchRef.current) {
      return inFlightFetchRef.current
    }

    const fetchPromise = (async () => {
      try {
        setProfileError(null)

        // Safe diagnostic log: Log authenticated user ID ONLY
        console.log('[Auth] Fetching profile for user ID:', userId)

        const { data, error, status } = await supabase
          .from('profiles')
          .select('id, email, full_name, role, phone, employee_code, must_change_password, is_active, created_at, updated_at')
          .eq('id', userId)
          .maybeSingle()

        if (error) {
          console.error('[Auth] Profile query failed for user ID:', userId, 'Status:', status, 'Error:', error.message, 'Code:', error.code)
          setProfile(null)
          setRole(null)
          setProfileError(`Profile query failed (Code: ${error.code || 'UNKNOWN'}): ${error.message}`)
          return null
        }

        if (!data) {
          console.warn('[Auth] No profile record exists in profiles table for user ID:', userId)
          setProfile(null)
          setRole(null)
          setProfileError(`No profile found in database for user ID (${userId}). Please ensure a row exists in the profiles table.`)
          return null
        }

        const userProfile = data as Profile

        // Authoritative role validation
        if (userProfile.role !== 'admin' && userProfile.role !== 'employee') {
          console.error('[Auth] Invalid role configured in database profile:', userProfile.role)
          setProfile(userProfile)
          setRole(null)
          setProfileError(`Invalid role "${userProfile.role}" configured in database profile.`)
          return null
        }

        console.log('[Auth] Profile successfully loaded for user ID:', userId, 'Role:', userProfile.role)
        setProfile(userProfile)
        setRole(userProfile.role)
        setMustChangePassword(Boolean(userProfile.must_change_password))
        setProfileError(null)
        return userProfile
      } catch (err) {
        console.error('[Auth] Unexpected error fetching profile:', err)
        setProfile(null)
        setRole(null)
        setProfileError((err as Error).message || 'Failed to fetch user profile.')
        return null
      } finally {
        inFlightFetchRef.current = null
      }
    })()

    inFlightFetchRef.current = fetchPromise
    return fetchPromise
  }, [])

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id)
    }
  }, [user?.id, fetchProfile])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false)
      return
    }

    let mounted = true

    // Initialize session and load authoritative profile
    const initAuth = async () => {
      try {
        setIsLoading(true)
        const {
          data: { session: initialSession },
          error: sessionErr
        } = await supabase.auth.getSession()

        if (sessionErr) {
          console.error('[Auth] Session retrieval error:', sessionErr.message)
        }

        if (!mounted) return

        if (initialSession?.user) {
          setSession(initialSession)
          setUser(initialSession.user)
          await fetchProfile(initialSession.user.id)
        } else {
          setSession(null)
          setUser(null)
          setProfile(null)
          setRole(null)
          setMustChangePassword(false)
          setProfileError(null)
        }
      } catch (err) {
        console.error('[Auth] Auth initialization error:', err)
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    initAuth()

    // Subscribe to Supabase auth state changes
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return

      if (event === 'SIGNED_OUT' || !newSession) {
        setSession(null)
        setUser(null)
        setProfile(null)
        setRole(null)
        setMustChangePassword(false)
        setProfileError(null)
        setIsLoading(false)
        return
      }

      setSession(newSession)
      setUser(newSession.user)

      if (newSession.user?.id) {
        await fetchProfile(newSession.user.id)
      }
      setIsLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  const signIn = async (email: string, password: string) => {
    setIsLoading(true)
    setProfileError(null)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      })

      if (error) {
        setIsLoading(false)
        return { error }
      }

      if (data.user?.id) {
        setUser(data.user)
        setSession(data.session)
        const loadedProfile = await fetchProfile(data.user.id)
        if (!loadedProfile) {
          setIsLoading(false)
          return {
            error: new Error(
              'Authentication succeeded, but user profile could not be loaded from database.'
            )
          }
        }
      }

      setIsLoading(false)
      return { error: null }
    } catch (err) {
      setIsLoading(false)
      return { error: err as Error }
    }
  }

  const signOut = async () => {
    setIsLoading(true)
    try {
      await supabase.auth.signOut()
      setUser(null)
      setSession(null)
      setProfile(null)
      setRole(null)
      setMustChangePassword(false)
      setProfileError(null)
    } catch (err) {
      console.error('[Auth] Sign out error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const value: AuthContextValue = {
    user,
    session,
    profile,
    role,
    isLoading,
    isAuthenticated: Boolean(user && session),
    mustChangePassword,
    profileError,
    signIn,
    signOut,
    refreshProfile
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
