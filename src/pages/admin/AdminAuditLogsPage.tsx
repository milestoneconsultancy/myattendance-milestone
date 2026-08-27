import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { AuditLog, Profile } from '../../types/database.types'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import {
  ShieldAlert,
  Search,
  RefreshCw,
  AlertCircle,
  Clock,
  User,
  Activity,
  Layers
} from 'lucide-react'

interface AuditLogWithActor extends AuditLog {
  actor?: Profile | null
}

export const AdminAuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogWithActor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [entityFilter, setEntityFilter] = useState<string>('all')

  const fetchLogs = useCallback(async () => {
    setIsLoading(true)
    setErrorMsg(null)
    try {
      let query = supabase
        .from('audit_logs')
        .select('*, actor:profiles(*)')
        .order('created_at', { ascending: false })
        .limit(100)

      if (entityFilter !== 'all') {
        query = query.eq('target_entity', entityFilter)
      }

      const { data, error } = await query
      if (error) throw error
      setLogs((data || []) as AuditLogWithActor[])
    } catch (err) {
      console.error('[AuditLogs] Error fetching logs:', err)
      setErrorMsg((err as Error).message || 'Failed to load audit logs.')
    } finally {
      setIsLoading(false)
    }
  }, [entityFilter])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const filteredLogs = logs.filter((log) => {
    const actionStr = log.action.toLowerCase()
    const actorName = log.actor?.full_name?.toLowerCase() || ''
    const detailsStr = JSON.stringify(log.details || '').toLowerCase()
    return (
      actionStr.includes(searchTerm.toLowerCase()) ||
      actorName.includes(searchTerm.toLowerCase()) ||
      detailsStr.includes(searchTerm.toLowerCase())
    )
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-white p-6 border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-purple-50 p-2 text-purple-600">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">System Audit Trail</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Immutable, append-only security logs tracking administrative changes, adjustments, and device actions.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Logs</span>
        </button>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3.5 text-xs font-medium text-rose-800 border border-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 rounded-2xl bg-white p-4 border border-slate-200 shadow-xs">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search action, admin name, or payload metadata..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50/50 py-2 px-3 text-xs font-medium text-slate-700 focus:border-sky-500 focus:bg-white focus:outline-none"
          >
            <option value="all">All Entities</option>
            <option value="projects">Projects</option>
            <option value="geofences">Geofences</option>
            <option value="profiles">Employees / Profiles</option>
            <option value="devices">Devices</option>
            <option value="employee_project_assignments">Site Assignments</option>
            <option value="daily_attendance">Attendance Adjustments</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      {isLoading ? (
        <LoadingSpinner message="Loading audit trail from database..." />
      ) : errorMsg && logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/50 p-12 text-center">
          <AlertCircle className="h-10 w-10 text-rose-500 mb-3" />
          <h3 className="text-sm font-bold text-rose-900">Database Query Error</h3>
          <p className="mt-1 text-xs text-rose-700 max-w-md font-mono">{errorMsg}</p>
          <button
            onClick={fetchLogs}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Retry Query</span>
          </button>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <Activity className="h-10 w-10 text-slate-400 mb-3" />
          <h3 className="text-sm font-bold text-slate-800">No Audit Events Found</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm">
            Administrative actions such as creating projects, adjusting attendance, or editing boundaries will be automatically recorded here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6">Timestamp</th>
                  <th className="py-3.5 px-4">Action</th>
                  <th className="py-3.5 px-4">Admin / Actor</th>
                  <th className="py-3.5 px-4">Target Entity</th>
                  <th className="py-3.5 px-4 sm:px-6">Event Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-4 sm:px-6 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        {new Date(log.created_at).toLocaleString('en-IN', {
                          timeZone: 'Asia/Kolkata',
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </div>
                    </td>
                    <td className="py-4 px-4 font-bold text-slate-900">
                      <span className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-800 border border-slate-200">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-4 px-4 font-semibold text-slate-900">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-slate-400" />
                        <span>{log.actor?.full_name || 'System Admin'}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 font-mono text-[11px] text-slate-600">
                      <span className="inline-flex items-center gap-1 text-slate-700">
                        <Layers className="h-3 w-3 text-slate-400" />
                        {log.target_entity}
                      </span>
                    </td>
                    <td className="py-4 px-4 sm:px-6 text-[11px] font-mono text-slate-600">
                      <pre className="max-w-md truncate bg-slate-50 p-2 rounded-lg border border-slate-200 overflow-x-auto text-[10px]">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

