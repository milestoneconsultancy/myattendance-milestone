import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { DailyAttendance, Profile, Project } from '../../types/database.types'
import { StatusBadge } from '../../components/common/StatusBadge'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import {
  FileBarChart,
  Download,
  Search,
  RefreshCw,
  AlertCircle
} from 'lucide-react'

interface ReportAttendanceRecord extends DailyAttendance {
  employee?: Profile | null
  project?: Project | null
}

export const AdminReportsPage: React.FC = () => {
  const [records, setRecords] = useState<ReportAttendanceRecord[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [employees, setEmployees] = useState<Profile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Filters
  const currentMonthStr = new Date().toISOString().slice(0, 7) // YYYY-MM
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr)
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')

  const fetchReportData = useCallback(async () => {
    setIsLoading(true)
    setErrorMsg(null)
    try {
      // Calculate start and end date for month
      const [year, month] = selectedMonth.split('-').map(Number)
      const startDate = `${selectedMonth}-01`
      const lastDay = new Date(year, month, 0).getDate() // 28, 29, 30, or 31 dynamically!
      const endDate = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`

      let query = supabase
        .from('daily_attendance')
        .select('*, employee:profiles(*), project:projects(*)')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false })

      if (selectedProjectId !== 'all') {
        query = query.eq('project_id', selectedProjectId)
      }
      if (selectedEmployeeId !== 'all') {
        query = query.eq('employee_id', selectedEmployeeId)
      }

      const { data: attendanceData, error: attErr } = await query
      if (attErr) throw attErr

      let filtered = (attendanceData || []) as ReportAttendanceRecord[]
      if (statusFilter === 'present') {
        filtered = filtered.filter((r) => r.status === 'present')
      } else if (statusFilter === 'absent') {
        filtered = filtered.filter((r) => r.status === 'absent')
      } else if (statusFilter === 'adjusted') {
        filtered = filtered.filter((r) => r.is_adjusted)
      }

      setRecords(filtered)

      // Fetch Projects for dropdown
      const { data: projData, error: projErr } = await supabase
        .from('projects')
        .select('*')
        .order('name', { ascending: true })

      if (projErr) throw projErr
      setProjects(projData || [])

      // Fetch Employees for dropdown
      const { data: empData, error: empErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'employee')
        .order('full_name', { ascending: true })

      if (empErr) throw empErr
      setEmployees(empData || [])
    } catch (err) {
      console.error('[Reports] Error loading report data:', err)
      setErrorMsg((err as Error).message || 'Failed to generate attendance report.')
    } finally {
      setIsLoading(false)
    }
  }, [selectedMonth, selectedProjectId, selectedEmployeeId, statusFilter])

  useEffect(() => {
    fetchReportData()
  }, [fetchReportData])

  // Export to CSV
  const handleExportCSV = () => {
    if (records.length === 0) return

    const headers = [
      'Company',
      'Employee Name',
      'Employee Email',
      'Staff Code',
      'Project / Site',
      'Date',
      'Status',
      'Sign In Time',
      'Sign Out Time',
      'Working Hours',
      'Is Adjusted',
      'Adjustment Remark'
    ]

    const rows = records.map((r) => [
      'Milestone Consultancy',
      `"${r.employee?.full_name || 'Staff'}"`,
      `"${r.employee?.email || ''}"`,
      `"${r.employee?.employee_code || ''}"`,
      `"${r.project?.name || ''}"`,
      `"${r.date}"`,
      `"${r.status.toUpperCase()}"`,
      `"${r.sign_in_time || ''}"`,
      `"${r.sign_out_time || ''}"`,
      `"${r.total_working_hours || ''}"`,
      `"${r.is_adjusted ? 'YES' : 'NO'}"`,
      `"${(r.adjustment_remark || '').replace(/"/g, '""')}"`
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute(
      'download',
      `Milestone_Attendance_Report_${selectedMonth}_${new Date().toISOString().slice(0, 10)}.csv`
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const filteredRecords = records.filter((r) => {
    const empName = r.employee?.full_name || ''
    const empEmail = r.employee?.email || ''
    const projName = r.project?.name || ''
    return (
      empName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      empEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      projName.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-white p-6 border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-sky-50 p-2 text-sky-600">
              <FileBarChart className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Attendance Reports & Exports</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Generate and export monthly attendance reports across sites and employees with audit indicators.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          disabled={records.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer"
        >
          <Download className="h-4 w-4" />
          <span>Export CSV Report ({records.length})</span>
        </button>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3.5 text-xs font-medium text-rose-800 border border-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Report Filter Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 rounded-2xl bg-white p-4 border border-slate-200 shadow-xs">
        {/* Month Selector */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            Report Month
          </label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 px-3 text-xs text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
          />
        </div>

        {/* Project Filter */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            Site / Project
          </label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 px-3 text-xs text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
          >
            <option value="all">All Sites</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Employee Filter */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            Employee
          </label>
          <select
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 px-3 text-xs text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
          >
            <option value="all">All Employees</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.full_name}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            Attendance Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 px-3 text-xs text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
          >
            <option value="all">All Records</option>
            <option value="present">Present Only</option>
            <option value="absent">Absent Only</option>
            <option value="adjusted">Adjusted by Admin Only</option>
          </select>
        </div>

        {/* Quick Search */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            Search
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search report..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-8 pr-3 text-xs text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
              />
            </div>
            <button
              onClick={fetchReportData}
              title="Refresh"
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Reports Table */}
      {isLoading ? (
        <LoadingSpinner message="Generating filtered attendance report..." />
      ) : errorMsg && records.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/50 p-12 text-center">
          <AlertCircle className="h-10 w-10 text-rose-500 mb-3" />
          <h3 className="text-sm font-bold text-rose-900">Database Query Error</h3>
          <p className="mt-1 text-xs text-rose-700 max-w-md font-mono">{errorMsg}</p>
          <button
            onClick={fetchReportData}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Retry Query</span>
          </button>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <FileBarChart className="h-10 w-10 text-slate-400 mb-3" />
          <h3 className="text-sm font-bold text-slate-800">No Records Found</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm">
            No attendance records match the selected month and filter parameters.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6">Employee</th>
                  <th className="py-3.5 px-4">Site / Project</th>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Sign In</th>
                  <th className="py-3.5 px-4">Sign Out</th>
                  <th className="py-3.5 px-4">Duration</th>
                  <th className="py-3.5 px-4 sm:px-6">Adjustment Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-4 sm:px-6 font-semibold text-slate-900">
                      <div>
                        <span className="block font-bold">{record.employee?.full_name || 'Staff'}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{record.employee?.email}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 font-semibold text-slate-800">
                      {record.project?.name || 'Assigned Site'}
                    </td>
                    <td className="py-4 px-4 font-mono text-[11px] text-slate-600">
                      {record.date}
                    </td>
                    <td className="py-4 px-4">
                      <StatusBadge status={record.status} activeLabel="PRESENT" inactiveLabel="ABSENT" />
                    </td>
                    <td className="py-4 px-4 font-mono text-[11px] text-slate-700">
                      {record.sign_in_time || '—'}
                    </td>
                    <td className="py-4 px-4 font-mono text-[11px] text-slate-700">
                      {record.sign_out_time || '—'}
                    </td>
                    <td className="py-4 px-4 font-mono text-[11px] text-slate-600">
                      {record.total_working_hours ? `${record.total_working_hours} hrs` : '—'}
                    </td>
                    <td className="py-4 px-4 sm:px-6">
                      {record.is_adjusted ? (
                        <div>
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                            * Adjusted by Admin
                          </span>
                          {record.adjustment_remark && (
                            <p className="mt-0.5 text-[10px] text-slate-600 italic">
                              "{record.adjustment_remark}"
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Original</span>
                      )}
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
