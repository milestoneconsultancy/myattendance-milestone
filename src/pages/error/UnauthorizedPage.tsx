import React from 'react'
import { Link } from 'react-router-dom'
import { ShieldX, ArrowLeft } from 'lucide-react'

export const UnauthorizedPage: React.FC = () => {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-4">
      <div className="rounded-2xl bg-rose-50 p-4 text-rose-600 mb-4 border border-rose-100">
        <ShieldX className="h-10 w-10" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900">Access Denied</h1>
      <p className="mt-2 max-w-md text-sm text-slate-600">
        You do not have permission to view this section. If you believe this is an error, contact your Milestone Consultancy administrator.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Return to Home
      </Link>
    </div>
  )
}

