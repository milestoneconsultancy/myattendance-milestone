import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { LoadingSpinner } from '../components/common/LoadingSpinner'
import type { UserRole } from '../types/database.types'
import { ShieldAlert, RefreshCw, LogOut } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles
}) => {
  const { isAuthenticated, isLoading, role, mustChangePassword, profileError, refreshProfile, signOut } = useAuth()
  const location = useLocation()

  // 1. Keep loading screen active while auth is initializing or while profile/role is still resolving
  if (isLoading || (isAuthenticated && !role && !profileError)) {
    return <LoadingSpinner fullScreen message="Verifying authentication & profile role..." />
  }

  // 2. Not authenticated -> redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // 3. Handle explicit profile loading failure
  if (profileError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-4">
        <div className="rounded-2xl bg-amber-50 p-4 text-amber-600 mb-4 border border-amber-200">
          <ShieldAlert className="h-10 w-10" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Profile Verification Failed</h1>
        <p className="mt-2 max-w-md text-sm text-slate-600">
          We authenticated your account, but could not load your role permissions from the database.
        </p>
        <p className="mt-2 text-xs font-mono text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-100 max-w-md">
          {profileError}
        </p>
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={() => refreshProfile()}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-sky-700 transition-colors cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            Retry Profile Load
          </button>
          <button
            onClick={() => signOut()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  // 4. Force password change on first login
  if (mustChangePassword && location.pathname !== '/force-password-change') {
    return <Navigate to="/force-password-change" replace />
  }

  // 5. Strict role check: role must exist and match allowedRoles
  if (allowedRoles) {
    if (!role || !allowedRoles.includes(role)) {
      return <Navigate to="/unauthorized" replace />
    }
  }

  return <>{children}</>
}
