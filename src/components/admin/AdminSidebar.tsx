import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import {
  LayoutDashboard,
  Building2,
  Users,
  UserCheck,
  MapPin,
  Clock,
  FileBarChart,
  ShieldAlert,
  Settings,
  LogOut,
  X,
  Shield
} from 'lucide-react'

interface AdminSidebarProps {
  isOpen: boolean
  onClose: () => void
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ isOpen, onClose }) => {
  const { profile, user, signOut } = useAuth()
  const navigate = useNavigate()

  const navItems = [
    { label: 'Dashboard', path: '/admin', icon: LayoutDashboard, end: true },
    { label: 'Projects / Sites', path: '/admin/projects', icon: Building2 },
    { label: 'Employees', path: '/admin/employees', icon: Users },
    { label: 'Assignments', path: '/admin/assignments', icon: UserCheck },
    { label: 'Geofences', path: '/admin/geofences', icon: MapPin },
    { label: 'Attendance', path: '/admin/attendance', icon: Clock },
    { label: 'Reports', path: '/admin/reports', icon: FileBarChart },
    { label: 'Audit Log', path: '/admin/audit', icon: ShieldAlert },
    { label: 'Settings', path: '/admin/settings', icon: Settings }
  ]

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-slate-900 text-slate-100">
      {/* Brand Header */}
      <div>
        <div className="flex h-16 items-center justify-between px-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-md">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <span className="block text-sm font-bold text-white tracking-tight">
                Milestone Admin
              </span>
              <span className="block text-[10px] text-sky-400 font-medium">
                Attendance Management
              </span>
            </div>
          </div>

          {/* Close button for mobile */}
          <button
            onClick={onClose}
            className="lg:hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30 font-bold'
                      : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
      </div>

      {/* User Info & Logout */}
      <div className="border-t border-slate-800 p-4">
        <div className="flex items-center justify-between rounded-xl bg-slate-800/60 p-3 mb-2">
          <div className="min-w-0 flex-1 mr-2">
            <p className="truncate text-xs font-bold text-white">
              {profile?.full_name || 'Admin User'}
            </p>
            <p className="truncate text-[10px] text-slate-400">{user?.email}</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
            <Shield className="h-3 w-3" /> Admin
          </span>
        </div>

        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 py-2 px-3 text-xs font-semibold text-rose-400 hover:bg-rose-950/30 hover:border-rose-800 hover:text-rose-300 transition-colors cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 z-30 shadow-xl">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
            onClick={onClose}
          />
          <div className="fixed inset-y-0 left-0 w-72 max-w-[80vw] shadow-2xl z-10">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  )
}

