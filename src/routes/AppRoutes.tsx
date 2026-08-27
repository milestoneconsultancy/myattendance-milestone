import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { AppLayout } from '../components/layout/AppLayout'
import { ProtectedRoute } from './ProtectedRoute'
import { LoginPage } from '../pages/auth/LoginPage'
import { ForcePasswordChangePage } from '../pages/auth/ForcePasswordChangePage'
import { EmployeeDashboardPage } from '../pages/employee/EmployeeDashboardPage'
import { AdminDashboardPage } from '../pages/admin/AdminDashboardPage'
import { UnauthorizedPage } from '../pages/error/UnauthorizedPage'
import { NotFoundPage } from '../pages/error/NotFoundPage'
import { LoadingSpinner } from '../components/common/LoadingSpinner'

// Smart index redirect based strictly on authoritative database role
const HomeRedirect: React.FC = () => {
  const { isAuthenticated, isLoading, role } = useAuth()

  if (isLoading) {
    return <LoadingSpinner fullScreen message="Checking permissions..." />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (role === 'admin') {
    return <Navigate to="/admin" replace />
  }

  if (role === 'employee') {
    return <Navigate to="/dashboard" replace />
  }

  // If authenticated but role could not be resolved, stay on layout to show error
  return <Navigate to="/dashboard" replace />
}

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public / Auth routes */}
      <Route path="/login" element={<LoginPage />} />

      {/* Main app layout wrapper */}
      <Route element={<AppLayout />}>
        {/* Smart Index redirect */}
        <Route path="/" element={<HomeRedirect />} />

        {/* Forced Password Reset */}
        <Route
          path="/force-password-change"
          element={
            <ProtectedRoute>
              <ForcePasswordChangePage />
            </ProtectedRoute>
          }
        />

        {/* Employee Dashboard - strictly for employees */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute allowedRoles={['employee']}>
              <EmployeeDashboardPage />
            </ProtectedRoute>
          }
        />

        {/* Admin Dashboard - strictly for administrators */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboardPage />
            </ProtectedRoute>
          }
        />

        {/* Fallbacks */}
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
