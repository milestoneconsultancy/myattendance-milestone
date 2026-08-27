import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { LoadingSpinner } from '../components/common/LoadingSpinner'
import type { UserRole } from '../types/database.types'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles
}) => {
  const { isAuthenticated, isLoading, role, mustChangePassword } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <LoadingSpinner fullScreen message="Authenticating..." />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Force password change on first login
  if (mustChangePassword && location.pathname !== '/force-password-change') {
    return <Navigate to="/force-password-change" replace />
  }

  // Check role authorization
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />
  }

  return <>{children}</>
}

