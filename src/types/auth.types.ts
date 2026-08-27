import type { User, Session } from '@supabase/supabase-js'
import type { Profile, UserRole } from './database.types'

export interface AuthState {
  user: User | null
  profile: Profile | null
  role: UserRole | null
  session: Session | null
  isLoading: boolean
  isAuthenticated: boolean
  mustChangePassword: boolean
}

export interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

