import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { logAuditEvent } from '../../lib/auditService'
import type { DailyAttendance, Profile, Project } from '../../types/database.types'
import { Modal } from '../../components/common/Modal'
import { StatusBadge } from '../../components/common/StatusBadge'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import {
  Clock,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Edit3,
  Calendar,
  Building2,
  Info
} from 'lucide-react'

interface AttendanceRecordDetail extends DailyAttendance {
  employee?: Profile | null
  project?: Project | null
}

export const AdminAttendancePage: React.FC = () => {
  const { user } = useAuth()

  const [records, setRecords] = useState<AttendanceRecordDetail[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [employees, setEmployees] = useState<Profile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Filters
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())

  const [selectedDate, setSelectedDate] = useState<string>(todayStr)
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')

  // Adjustment Modal State
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false)
  const [adjustingRecord, setAdjustingRecord] = useState<AttendanceRecordDetail | null>(null)
  const [adjustFormData, setAdjustFormData] = useState({
    status: 'present' as 'present' | 'absent',
    sign_in_time: '',
    sign_out_time: '',
    remark: ''
  })
  const [isAdjusting, setIsAdjusting] = useState(false)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setErrorMsg(null)
    try {
      // 1. Fetch Daily Attendance for selected date
      let query = supabase
        .from('daily_attendance')
        .select('*, employee:profiles(*), project:projects(*)')
        .eq('attendance_date', selectedDate)
        .order('created_at', { ascending: false })

      if (selectedProjectId !== 'all') {
        query = query.eq('project_id', selectedProjectId)
      }
      if (selectedEmployeeId !== 'all') {
        query = query.eq('employee_id', selectedEmployeeId)
      }

      const { data: attendanceData, error: attErr } = await query
      if (attErr) throw attErr
      setRecords((attendanceData || []) as AttendanceRecordDetail[])

      // 2. Fetch Projects for filter
      const { data: projData, error: projErr } = await supabase
        .from('projects')
        .select('*')
        .order('name', { ascending: true })

      if (projErr) throw projErr
      setProjects(projData || [])

      // 3. Fetch Employees for filter
      const { data: empData, error: empErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'employee')
        .order('full_name', { ascending: true })

      if (empErr) throw empErr
      setEmployees(empData || [])
    } catch (err) {
      console.error('[Attendance] Error fetching attendance:', err)
      setErrorMsg((err as Error).message || 'Failed to load attendance records.')
    } finally {
      setIsLoading(false)
    }
  }, [selectedDate, selectedProjectId, selectedEmployeeId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Open Adjustment Modal
  const handleOpenAdjust = (record: AttendanceRecordDetail) => {
    setAdjustingRecord(record)
    setAdjustFormData({
      status: record.status,
      sign_in_time: record.sign_in_time || '09:00',
      sign_out_time: record.sign_out_time || '18:00',
      remark: ''
    })
    setIsAdjustModalOpen(true)
  }

  // Submit Adjustment
  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!adjustingRecord) return
    if (!adjustFormData.remark.trim()) {
      setErrorMsg('Mandatory adjustment remark is required.')
      return
    }

    setIsAdjusting(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const previousValue = {
        status: adjustingRecord.status,
        sign_in_time: adjustingRecord.sign_in_time,
        sign_out_time: adjustingRecord.sign_out_time,
        is_adjusted: adjustingRecord.is_adjusted
      }

      const newValue = {
        status: adjustFormData.status,
        sign_in_time: adjustFormData.sign_in_time || null,
        sign_out_time: adjustFormData.sign_out_time || null,
        is_adjusted: true,
        adjustment_remark: adjustFormData.remark.trim()
      }

      // 1. Update daily_attendance record
      const { error: updateErr } = await supabase
        .from('daily_attendance')
        .update({
          status: adjustFormData.status,
          sign_in_time: adjustFormData.status === 'present' ? adjustFormData.sign_in_time : null,
          sign_out_time: adjustFormData.status === 'present' ? adjustFormData.sign_out_time : null,
          is_adjusted: true,
          adjustment_remark: adjustFormData.remark.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', adjustingRecord.id)

      if (updateErr) throw updateErr

      // 2. Insert into attendance_adjustments table
      if (user?.id) {
        const { error: adjErr } = await supabase
          .from('attendance_adjustments')
          .insert({
            daily_attendance_id: adjustingRecord.id,
            adjusted_by: user.id,
            previous_value: previousValue,
            new_value: newValue,
            remark: adjustFormData.remark.trim()
          })

        if (adjErr) {
          console.warn('[Attendance] Adjustment history insert warning:', adjErr.message)
        }
      }

      // 3. Log Audit Event
      await logAuditEvent({
        actorId: user?.id,
        action: 'ATTENDANCE_ADJUSTMENT',
        targetEntity: 'daily_attendance',
        targetId: adjustingRecord.id,
        details: {
          employee_name: adjustingRecord.employee?.full_name,
          date: adjustingRecord.attendance_date,
          previous: previousValue,
          new: newValue,
          remark: adjustFormData.remark.trim()
        }
      })

      setSuccessMsg(
        `Attendance for ${adjustingRecord.employee?.full_name || 'Employee'} adjusted successfully.`
      )
      setIsAdjustModalOpen(false)
      setAdjustingRecord(null)
      await fetchData()
    } catch (err) {
      console.error('[Attendance] Adjustment submission error:', err)
      setErrorMsg((err as Error).message || 'Failed to apply attendance adjustment.')
    } finally {
      setIsAdjusting(false)
    }
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
              <Clock className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Attendance Records & Adjustments</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            View daily employee attendance, verify timestamps, and perform audited administrative adjustments with mandatory remarks.
          </p>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3.5 text-xs font-medium text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3.5 text-xs font-medium text-rose-800 border border-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Date & Filter Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 rounded-2xl bg-white p-4 border border-slate-200 shadow-xs">
        {/* Date Picker */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            Attendance Date
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 px-3 text-xs text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
          />
        </div>

        {/* Project Filter */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            Project / Site
          </label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 px-3 text-xs text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
          >
            <option value="all">All Project Sites</option>
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

        {/* Search */}
        <div className="lg:col-span-2">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            Quick Search
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, site, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-8 pr-3 text-xs text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
              />
            </div>
            <button
              onClick={fetchData}
              title="Refresh"
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Attendance Records Table */}
      {isLoading ? (
        <LoadingSpinner message="Loading attendance records for date..." />
      ) : errorMsg && records.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/50 p-12 text-center">
          <AlertCircle className="h-10 w-10 text-rose-500 mb-3" />
          <h3 className="text-sm font-bold text-rose-900">Database Query Error</h3>
          <p className="mt-1 text-xs text-rose-700 max-w-md font-mono">{errorMsg}</p>
          <button
            onClick={fetchData}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Retry Query</span>
          </button>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <Calendar className="h-10 w-10 text-slate-400 mb-3" />
          <h3 className="text-sm font-bold text-slate-800">No Attendance Records for {selectedDate}</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm">
            No employee sign-ins or attendance records were recorded on this date for the selected site filters.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6">Employee</th>
                  <th className="py-3.5 px-4">Project Site</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Sign In</th>
                  <th className="py-3.5 px-4">Sign Out</th>
                  <th className="py-3.5 px-4">Working Hours</th>
                  <th className="py-3.5 px-4">Adjustment Detail</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-4 sm:px-6 font-semibold text-slate-900">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-700 font-bold text-[11px]">
                          {record.employee?.full_name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div>
                          <span className="block font-bold">{record.employee?.full_name || 'Staff Member'}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{record.employee?.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 font-semibold text-slate-800">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-slate-400" />
                        <span>{record.project?.name || 'Assigned Site'}</span>
                      </div>
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
                    <td className="py-4 px-4">
                      {record.is_adjusted ? (
                        <div>
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                            * Adjusted by Admin
                          </span>
                          {record.adjustment_remark && (
                            <p className="mt-0.5 text-[10px] text-slate-500 italic max-w-xs truncate">
                              "{record.adjustment_remark}"
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Original</span>
                      )}
                    </td>
                    <td className="py-4 px-4 sm:px-6 text-right">
                      <button
                        onClick={() => handleOpenAdjust(record)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-sky-600 transition-colors cursor-pointer"
                        title="Adjust Attendance"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>Adjust</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ADJUSTMENT MODAL */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        title="Admin Attendance Adjustment"
        description="Adjust an employee attendance record. A mandatory reason/remark is required for auditing."
      >
        <form onSubmit={handleSubmitAdjustment} className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 text-xs text-slate-700 space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Employee:</span>
              <span className="font-bold">{adjustingRecord?.employee?.full_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Date:</span>
              <span className="font-mono">{adjustingRecord?.attendance_date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Original Status:</span>
              <span className="uppercase font-semibold text-slate-800">{adjustingRecord?.status}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              New Attendance Status *
            </label>
            <select
              value={adjustFormData.status}
              onChange={(e) =>
                setAdjustFormData({ ...adjustFormData, status: e.target.value as 'present' | 'absent' })
              }
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
            >
              <option value="present">PRESENT</option>
              <option value="absent">ABSENT</option>
            </select>
          </div>

          {adjustFormData.status === 'present' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Sign In Time (HH:MM)
                </label>
                <input
                  type="time"
                  value={adjustFormData.sign_in_time}
                  onChange={(e) =>
                    setAdjustFormData({ ...adjustFormData, sign_in_time: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2 px-3 text-xs text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Sign Out Time (HH:MM)
                </label>
                <input
                  type="time"
                  value={adjustFormData.sign_out_time}
                  onChange={(e) =>
                    setAdjustFormData({ ...adjustFormData, sign_out_time: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2 px-3 text-xs text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Mandatory Adjustment Remark / Reason *
            </label>
            <textarea
              required
              rows={3}
              placeholder="e.g. Employee was present on site with supervisor confirmation but mobile network issue prevented sign in."
              value={adjustFormData.remark}
              onChange={(e) => setAdjustFormData({ ...adjustFormData, remark: e.target.value })}
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-amber-700 flex items-center gap-1">
              <Info className="h-3 w-3" />
              This remark will be permanently preserved in reports and audit records.
            </p>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setIsAdjustModalOpen(false)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isAdjusting}
              className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isAdjusting ? 'Saving Adjustment...' : 'Save & Record Adjustment'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
