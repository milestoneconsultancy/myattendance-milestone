import React from 'react'
import { AlertTriangle, Key } from 'lucide-react'

export const ConfigAlert: React.FC = () => {
  return (
    <div className="mx-auto my-6 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900 shadow-xs">
      <div className="flex items-start gap-4">
        <div className="rounded-lg bg-amber-100 p-2 text-amber-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-amber-950">
            Supabase Configuration Required
          </h3>
          <p className="text-sm text-amber-800 leading-relaxed">
            The project requires your Supabase credentials to connect to the backend. Please create a{' '}
            <code className="rounded bg-amber-200/70 px-1.5 py-0.5 font-mono text-xs font-semibold text-amber-900">
              .env.local
            </code>{' '}
            file in the project root based on <code className="font-mono text-xs">.env.example</code>:
          </p>
          <div className="rounded-lg bg-slate-900 p-4 font-mono text-xs text-sky-400">
            <div>VITE_SUPABASE_URL=https://your-project.supabase.co</div>
            <div>VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-or-publishable-key</div>
          </div>
          <p className="text-xs text-amber-700 flex items-center gap-1.5">
            <Key className="h-3.5 w-3.5" />
            Note: <code className="font-mono font-medium">SUPABASE_SERVICE_ROLE_KEY</code> is server-side only for Vercel functions and must never be exposed to the browser.
          </p>
        </div>
      </div>
    </div>
  )
}

