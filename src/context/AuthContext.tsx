import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
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

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    try {
      setProfileError(null)

      // Query authenticated user profile strictly by ID
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('[AuthContext] Error fetching profile for user ID:', userId, error.message)
        setProfile(null)
        setRole(null)
        setProfileError(`Failed to load profile: ${error.message}`)
        return null
      }

      if (!data) {
        console.error('[AuthContext] No profile found for user ID:', userId)
        setProfile(null)
        setRole(null)
        setProfileError('Profile record not found in database.')
        return null
      }

      const userProfile = data as Profile

      // Authoritative role assignment - strictly from database profile, no unsafe fallbacks
      if (userProfile.role !== 'admin' && userProfile.role !== 'employee') {
        console.error('[AuthContext] Invalid role in database profile:', userProfile.role)
        setProfile(userProfile)
        setRole(null)
        setProfileError(`Invalid role "${userProfile.role}" configured in database.`)
        return null
      }

      setProfile(userProfile)
      setRole(userProfile.role)
      setMustChangePassword(Boolean(userProfile.must_change_password))
      setProfileError(null)
      return userProfile
    } catch (err) {
      console.error('[AuthContext] Unexpected error fetching profile:', err)
      setProfile(null)
      setRole(null)
      setProfileError((err as Error).message || 'Failed to fetch user profile.')
      return null
    }
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
          console.error('[AuthContext] Session retrieval error:', sessionErr.message)
        }

        if (!mounted) return

        setSession(initialSession)
        setUser(initialSession?.user ?? null)

        if (initialSession?.user?.id) {
          await fetchProfile(initialSession.user.id)
        } else {
          setProfile(null)
          setRole(null)
          setMustChangePassword(false)
          setProfileError(null)
        }
      } catch (err) {
        console.error('[AuthContext] Auth initialization error:', err)
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
      console.error('[AuthContext] Sign out error:', err)
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
