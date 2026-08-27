import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { Lock, ShieldAlert, CheckCircle2 } from 'lucide-react'

export const ForcePasswordChangePage: React.FC = () => {
  const { user, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    try {
      let updateSucceeded = false

      // 1. Attempt client-side Supabase updateUser
      const { error: authError } = await supabase.auth.updateUser({
        password
      })

      if (!authError) {
        updateSucceeded = true
      } else {
        // If client update fails (e.g. Supabase project requires current password / reauthentication),
        // call the serverless endpoint using the user's active session token
        let token: string | null = null
        const { data: sessionData } = await supabase.auth.getSession()
        if (sessionData?.session?.access_token) {
          token = sessionData.session.access_token
        } else {
          const { data: refreshData } = await supabase.auth.refreshSession()
          token = refreshData?.session?.access_token || null
        }

        if (!token) {
          throw authError
        }

        const response = await fetch('/api/update-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ password })
        })

        const resData = await response.json().catch(() => null)

        if (response.ok && resData?.success) {
          updateSucceeded = true
        } else {
          throw new Error(resData?.error || authError.message || 'Failed to update password.')
        }
      }

      if (updateSucceeded) {
        // 2. Ensure profile must_change_password is set to false
        if (user?.id) {
          await supabase
            .from('profiles')
            .update({ must_change_password: false, updated_at: new Date().toISOString() })
            .eq('id', user.id)
        }

        await refreshProfile()
        navigate('/', { replace: true })
      }
    } catch (err) {
      setErrorMsg((err as Error).message || 'Failed to update password. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-140px)] items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Password Update Required
          </h1>
          <p className="text-sm text-slate-600">
            Your account was created with a temporary password. Please set a new permanent password to continue.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
          {errorMsg && (
            <div className="mb-4 rounded-xl bg-rose-50 p-4 text-xs text-rose-800 border border-rose-200">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div>
              <label
                htmlFor="new-password"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1"
              >
                New Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="new-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2.5 pl-10 pr-3.5 text-sm text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-600/20"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1"
              >
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="confirm-password"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2.5 pl-10 pr-3.5 text-sm text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-600/20"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 px-4 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-600/50 disabled:opacity-60 transition-all cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" />
              {isSubmitting ? 'Updating Password...' : 'Save & Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

