import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { logAuditEvent } from '../../lib/auditService'
import type { EmployeeProjectAssignment, Profile, Project } from '../../types/database.types'
import { Modal } from '../../components/common/Modal'
import { ConfirmDialog } from '../../components/common/ConfirmDialog'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import {
  UserCheck,
  Plus,
  Search,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Building2,
  Clock
} from 'lucide-react'

interface AssignmentDetail extends EmployeeProjectAssignment {
  employee?: Profile | null
  project?: Project | null
}

export const AdminAssignmentsPage: React.FC = () => {
  const { user } = useAuth()

  const [assignments, setAssignments] = useState<AssignmentDetail[]>([])
  const [employees, setEmployees] = useState<Profile[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [projectFilter, setProjectFilter] = useState<string>('all')

  // Create Assignment Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Delete Assignment Confirm
  const [deleteAssignmentItem, setDeleteAssignmentItem] = useState<AssignmentDetail | null>(null)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setErrorMsg(null)
    try {
      // 1. Fetch Assignments with relations
      const { data: assignData, error: assignErr } = await supabase
        .from('employee_project_assignments')
        .select('*, employee:profiles(*), project:projects(*)')
        .order('assigned_at', { ascending: false })

      if (assignErr) throw assignErr
      setAssignments((assignData || []) as AssignmentDetail[])

      // 2. Fetch Active Employees
      const { data: empData, error: empErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'employee')
        .eq('is_active', true)
        .order('full_name', { ascending: true })

      if (empErr) throw empErr
      setEmployees(empData || [])

      // 3. Fetch Active Projects
      const { data: projData, error: projErr } = await supabase
        .from('projects')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true })

      if (projErr) throw projErr
      setProjects(projData || [])
    } catch (err) {
      console.error('[Assignments] Error loading assignments:', err)
      setErrorMsg((err as Error).message || 'Failed to load project assignments.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleOpenCreateModal = () => {
    setSelectedEmployeeId(employees.length > 0 ? employees[0].id : '')
    setSelectedProjectId(projects.length > 0 ? projects[0].id : '')
    setIsModalOpen(true)
  }

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEmployeeId || !selectedProjectId) {
      setErrorMsg('Please select both an employee and a project site.')
      return
    }

    // Check for duplicate active assignment
    const exists = assignments.some(
      (a) => a.employee_id === selectedEmployeeId && a.project_id === selectedProjectId
    )
    if (exists) {
      setErrorMsg('This employee is already assigned to this project site.')
      return
    }

    setIsSubmitting(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const { data, error } = await supabase
        .from('employee_project_assignments')
        .insert({
          employee_id: selectedEmployeeId,
          project_id: selectedProjectId,
          assigned_by: user?.id || null
        })
        .select()
        .single()

      if (error) throw error

      const emp = employees.find((e) => e.id === selectedEmployeeId)
      const proj = projects.find((p) => p.id === selectedProjectId)

      await logAuditEvent({
        actorId: user?.id,
        action: 'EMPLOYEE_ASSIGN_PROJECT',
        targetEntity: 'employee_project_assignments',
        targetId: data?.id,
        details: {
          employee_id: selectedEmployeeId,
          employee_name: emp?.full_name,
          project_id: selectedProjectId,
          project_name: proj?.name
        }
      })

      setSuccessMsg(`Assigned ${emp?.full_name || 'Employee'} to ${proj?.name || 'Project'}.`)
      setIsModalOpen(false)
      await fetchData()
    } catch (err) {
      console.error('[Assignments] Assignment creation error:', err)
      setErrorMsg((err as Error).message || 'Failed to create site assignment.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenDelete = (item: AssignmentDetail) => {
    setDeleteAssignmentItem(item)
    setIsConfirmOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!deleteAssignmentItem) return
    setIsDeleting(true)

    try {
      const { error } = await supabase
        .from('employee_project_assignments')
        .delete()
        .eq('id', deleteAssignmentItem.id)

      if (error) throw error

      await logAuditEvent({
        actorId: user?.id,
        action: 'EMPLOYEE_UNASSIGN_PROJECT',
        targetEntity: 'employee_project_assignments',
        targetId: deleteAssignmentItem.id,
        details: {
          employee_name: deleteAssignmentItem.employee?.full_name,
          project_name: deleteAssignmentItem.project?.name
        }
      })

      setSuccessMsg(
        `Removed assignment for ${deleteAssignmentItem.employee?.full_name || 'Employee'}.`
      )
      setIsConfirmOpen(false)
      setDeleteAssignmentItem(null)
      await fetchData()
    } catch (err) {
      console.error('[Assignments] Deletion error:', err)
      setErrorMsg((err as Error).message || 'Failed to remove assignment.')
    } finally {
      setIsDeleting(false)
    }
  }

  const filteredAssignments = assignments.filter((a) => {
    const empName = a.employee?.full_name || ''
    const empEmail = a.employee?.email || ''
    const projName = a.project?.name || ''
    const matchesSearch =
      empName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      empEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      projName.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesProj = projectFilter === 'all' ? true : a.project_id === projectFilter
    return matchesSearch && matchesProj
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-white p-6 border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
              <UserCheck className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Project & Site Assignments</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Authorize employees to work and perform attendance at one or multiple project sites.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          disabled={employees.length === 0 || projects.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50 transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>New Site Assignment</span>
        </button>
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

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3 rounded-2xl bg-white p-4 border border-slate-200 shadow-xs">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by employee name or project..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50/50 py-2 px-3 text-xs font-medium text-slate-700 focus:border-sky-500 focus:bg-white focus:outline-none"
          >
            <option value="all">All Sites</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <button
            onClick={fetchData}
            title="Refresh list"
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Assignments Table */}
      {isLoading ? (
        <LoadingSpinner message="Loading project assignments..." />
      ) : filteredAssignments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <UserCheck className="h-10 w-10 text-slate-400 mb-3" />
          <h3 className="text-sm font-bold text-slate-800">No Assignments Found</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm">
            Employees must be assigned to sites to enable geofenced sign-ins. Click "+ New Site Assignment" to assign employees.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6">Employee</th>
                  <th className="py-3.5 px-4">Assigned Site / Project</th>
                  <th className="py-3.5 px-4">Assigned Date</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredAssignments.map((assignment) => (
                  <tr key={assignment.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-4 sm:px-6 font-semibold text-slate-900">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-700 font-bold text-[11px]">
                          {assignment.employee?.full_name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div>
                          <span className="block font-bold">{assignment.employee?.full_name || 'Unnamed'}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{assignment.employee?.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-sky-600 shrink-0" />
                        <span>{assignment.project?.name || 'Unknown Project'}</span>
                        {assignment.project?.code && (
                          <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {assignment.project.code}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        {new Date(assignment.assigned_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </div>
                    </td>
                    <td className="py-4 px-4 sm:px-6 text-right">
                      <button
                        onClick={() => handleOpenDelete(assignment)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                        title="Remove Assignment"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE ASSIGNMENT MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Assign Employee to Project Site"
        description="Select an employee and the site they are authorized to work at."
      >
        <form onSubmit={handleCreateAssignment} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Select Employee *
            </label>
            <select
              required
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name} ({emp.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Select Project Site *
            </label>
            <select
              required
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
            >
              {projects.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.name} {proj.code ? `(${proj.code})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isSubmitting ? 'Assigning...' : 'Assign to Site'}
            </button>
          </div>
        </form>
      </Modal>

      {/* CONFIRM DELETE DIALOG */}
      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        isLoading={isDeleting}
        title="Remove Site Assignment"
        message={`Are you sure you want to remove the assignment of ${deleteAssignmentItem?.employee?.full_name || 'Employee'} from ${deleteAssignmentItem?.project?.name || 'Project'}?`}
        confirmText="Remove Assignment"
        isDestructive={true}
      />
    </div>
  )
}
