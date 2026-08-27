import React, { useState } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { Clock, Lock, Mail, AlertCircle, ArrowRight } from 'lucide-react'

export const LoginPage: React.FC = () => {
  const { signIn, isAuthenticated, role, isLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Redirect if already authenticated
  if (isAuthenticated && !isLoading) {
    const from = (location.state as { from?: { pathname?: string } })?.from?.pathname
    if (from) {
      return <Navigate to={from} replace />
    }
    return <Navigate to={role === 'admin' ? '/admin' : '/dashboard'} replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (!email || !password) {
      setErrorMsg('Please enter both email and password.')
      return
    }

    setIsSubmitting(true)
    const result = await signIn(email, password)
    setIsSubmitting(false)

    if (result.error) {
      setErrorMsg(result.error.message || 'Invalid credentials or login failed.')
      return
    }

    // Auth provider updates state and triggers redirect
    navigate('/')
  }

  return (
    <div className="flex min-h-[calc(100vh-140px)] items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-700 text-white shadow-lg shadow-sky-600/30">
            <Clock className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Milestone Attendance
          </h1>
          <p className="text-sm text-slate-600">
            Sign in with your company email and password
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
          {errorMsg && (
            <div className="mb-5 flex items-start gap-3 rounded-xl bg-rose-50 p-4 text-sm text-rose-800 border border-rose-200">
              <AlertCircle className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-950">Authentication Failed</p>
                <p className="text-rose-700 text-xs mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@milestoneconsultancy.com"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2.5 pl-10 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-600/20 transition-all"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2.5 pl-10 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-600/20 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 py-3 px-4 text-sm font-semibold text-white shadow-sm hover:from-sky-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-sky-600/50 disabled:opacity-60 transition-all cursor-pointer"
            >
              {isSubmitting ? (
                <span>Signing in...</span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-500">
          Attendance validation & device binding enforced securely via Supabase.
        </p>
      </div>
    </div>
  )
}

