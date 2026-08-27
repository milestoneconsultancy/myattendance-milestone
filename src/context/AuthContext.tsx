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

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('[AuthContext] Error fetching profile:', error.message)
        return null
      }

      const userProfile = data as Profile
      setProfile(userProfile)
      setRole(userProfile.role || 'employee')
      setMustChangePassword(Boolean(userProfile.must_change_password))
      return userProfile
    } catch (err) {
      console.error('[AuthContext] Unexpected error fetching profile:', err)
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

    // 1. Check current session
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (!mounted) return
        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user?.id) {
          await fetchProfile(session.user.id)
        }
      })
      .catch((err) => {
        console.error('[AuthContext] Session retrieval error:', err)
      })
      .finally(() => {
        if (mounted) setIsLoading(false)
      })

    // 2. Subscribe to auth state changes
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return

      setSession(newSession)
      setUser(newSession?.user ?? null)

      if (newSession?.user?.id) {
        await fetchProfile(newSession.user.id)
      } else {
        setProfile(null)
        setRole(null)
        setMustChangePassword(false)
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
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      })

      if (error) {
        setIsLoading(false)
        return { error }
      }

      if (data.user) {
        await fetchProfile(data.user.id)
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
      // Explicitly clear local session state
      setUser(null)
      setSession(null)
      setProfile(null)
      setRole(null)
      setMustChangePassword(false)
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

