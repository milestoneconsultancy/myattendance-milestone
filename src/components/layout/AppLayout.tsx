import React from 'react'
import { Outlet } from 'react-router-dom'
import { Navbar } from './Navbar'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { ConfigAlert } from '../common/ConfigAlert'

export const AppLayout: React.FC = () => {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <Navbar />
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {!isSupabaseConfigured && <ConfigAlert />}
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <p>&copy; {new Date().getFullYear()} Milestone Consultancy. All rights reserved.</p>
      </footer>
    </div>
  )
}

