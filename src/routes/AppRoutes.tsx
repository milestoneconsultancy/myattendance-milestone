import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { AppLayout } from '../components/layout/AppLayout'
import { AdminLayout } from '../components/admin/AdminLayout'
import { ProtectedRoute } from './ProtectedRoute'
import { LoginPage } from '../pages/auth/LoginPage'
import { ForcePasswordChangePage } from '../pages/auth/ForcePasswordChangePage'
import { EmployeeDashboardPage } from '../pages/employee/EmployeeDashboardPage'
import { AdminDashboardPage } from '../pages/admin/AdminDashboardPage'
import { AdminProjectsPage } from '../pages/admin/AdminProjectsPage'
import { AdminGeofencesPage } from '../pages/admin/AdminGeofencesPage'
import { AdminEmployeesPage } from '../pages/admin/AdminEmployeesPage'
import { AdminAssignmentsPage } from '../pages/admin/AdminAssignmentsPage'
import { AdminAttendancePage } from '../pages/admin/AdminAttendancePage'
import { AdminReportsPage } from '../pages/admin/AdminReportsPage'
import { AdminAuditLogsPage } from '../pages/admin/AdminAuditLogsPage'
import { AdminSettingsPage } from '../pages/admin/AdminSettingsPage'
import { UnauthorizedPage } from '../pages/error/UnauthorizedPage'
import { NotFoundPage } from '../pages/error/NotFoundPage'
import { LoadingSpinner } from '../components/common/LoadingSpinner'

// Smart index redirect based strictly on authoritative database role
const HomeRedirect: React.FC = () => {
  const { isAuthenticated, isLoading, role, profileError } = useAuth()

  // Wait until session and role are definitively resolved
  if (isLoading || (isAuthenticated && !role && !profileError)) {
    return <LoadingSpinner fullScreen message="Checking permissions..." />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (profileError) {
    return <Navigate to="/dashboard" replace />
  }

  if (role === 'admin') {
    return <Navigate to="/admin" replace />
  }

  if (role === 'employee') {
    return <Navigate to="/dashboard" replace />
  }

  return <Navigate to="/login" replace />
}

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public / Auth routes */}
      <Route path="/login" element={<LoginPage />} />

      {/* Admin Console routes with dedicated AdminLayout & ProtectedRoute */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboardPage />} />
        <Route path="projects" element={<AdminProjectsPage />} />
        <Route path="geofences" element={<AdminGeofencesPage />} />
        <Route path="employees" element={<AdminEmployeesPage />} />
        <Route path="assignments" element={<AdminAssignmentsPage />} />
        <Route path="attendance" element={<AdminAttendancePage />} />
        <Route path="reports" element={<AdminReportsPage />} />
        <Route path="audit" element={<AdminAuditLogsPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
      </Route>

      {/* Main app layout wrapper for Employee & General views */}
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

        {/* Fallbacks */}
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
