import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { logAuditEvent } from '../../lib/auditService'
import type { EmployeeProjectAssignment, Profile, Project, Geofence } from '../../types/database.types'
import { Modal } from '../../components/common/Modal'
import { ConfirmDialog } from '../../components/common/ConfirmDialog'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { StatusBadge } from '../../components/common/StatusBadge'
import {
  UserCheck,
  Plus,
  Search,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Building2,
  Clock,
  MapPin,
  ShieldAlert
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
  const [geofences, setGeofences] = useState<Geofence[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [projectFilter, setProjectFilter] = useState<string>('all')

  // Create Assignment Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [assignedFrom, setAssignedFrom] = useState(new Date().toISOString().split('T')[0])
  const [assignedTo, setAssignedTo] = useState('')
  const [isActive, setIsActive] = useState(true)
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
        .order('created_at', { ascending: false })

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

      // 4. Fetch Active Geofences / Sites
      const { data: geoData, error: geoErr } = await supabase
        .from('geofences')
        .select('*')
        .eq('is_active', true)

      if (geoErr) throw geoErr
      setGeofences(geoData || [])
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
    setAssignedFrom(new Date().toISOString().split('T')[0])
    setAssignedTo('')
    setIsActive(true)
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
      (a) => a.employee_id === selectedEmployeeId && a.project_id === selectedProjectId && a.is_active
    )
    if (exists) {
      setErrorMsg('This employee already has an active assignment to this project.')
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
          assigned_from: assignedFrom || new Date().toISOString().split('T')[0],
          assigned_to: assignedTo || null,
          is_active: isActive
        })
        .select()
        .single()

      if (error) throw error

      const emp = employees.find((e) => e.id === selectedEmployeeId)
      const proj = projects.find((p) => p.id === selectedProjectId)

      await logAuditEvent({
        actorId: user?.id,
        action: 'EMPLOYEE_ASSIGN_PROJECT',
        entityType: 'employee_project_assignments',
        entityId: data?.id,
        newData: {
          employee_id: selectedEmployeeId,
          employee_name: emp?.full_name,
          project_id: selectedProjectId,
          project_name: proj?.name,
          assigned_from: assignedFrom,
          assigned_to: assignedTo || null,
          is_active: isActive
        },
        remark: `Assigned ${emp?.full_name || 'Employee'} to ${proj?.name || 'Project'}`
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

  const handleToggleActive = async (item: AssignmentDetail) => {
    try {
      const nextStatus = !item.is_active
      const { error } = await supabase
        .from('employee_project_assignments')
        .update({ is_active: nextStatus })
        .eq('id', item.id)

      if (error) throw error

      await logAuditEvent({
        actorId: user?.id,
        action: nextStatus ? 'ASSIGNMENT_ACTIVATE' : 'ASSIGNMENT_DEACTIVATE',
        entityType: 'employee_project_assignments',
        entityId: item.id,
        oldData: { is_active: item.is_active },
        newData: { is_active: nextStatus },
        remark: `Assignment status changed to ${nextStatus ? 'active' : 'inactive'}`
      })

      setSuccessMsg(`Assignment ${nextStatus ? 'activated' : 'deactivated'} successfully.`)
      await fetchData()
    } catch (err) {
      console.error('[Assignments] Toggle status error:', err)
      setErrorMsg((err as Error).message || 'Failed to update assignment status.')
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
        entityType: 'employee_project_assignments',
        entityId: deleteAssignmentItem.id,
        oldData: {
          employee_id: deleteAssignmentItem.employee_id,
          project_id: deleteAssignmentItem.project_id
        },
        remark: `Removed assignment of ${deleteAssignmentItem.employee?.full_name || 'Employee'}`
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
      ) : errorMsg && assignments.length === 0 ? (
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
                  <th className="py-3.5 px-4">Assigned Project</th>
                  <th className="py-3.5 px-4">Authorized Sites & Geofences</th>
                  <th className="py-3.5 px-4">Assigned Validity</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredAssignments.map((assignment) => {
                  const assignedSites = geofences.filter((g) => g.project_id === assignment.project_id)
                  return (
                    <tr key={assignment.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-4 px-4 sm:px-6 font-semibold text-slate-900">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 font-bold text-xs">
                            {assignment.employee?.full_name?.charAt(0).toUpperCase() || 'U'}
                          </div>
                          <div>
                            <span className="block font-bold">{assignment.employee?.full_name || 'Unnamed'}</span>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                              <span>{assignment.employee?.email}</span>
                              {assignment.employee?.employee_code && (
                                <span className="bg-slate-100 px-1.5 py-0.2 rounded text-slate-600 font-semibold">
                                  {assignment.employee.employee_code}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 font-semibold text-slate-900">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-sky-600 shrink-0" />
                          <div>
                            <span className="block">{assignment.project?.name || 'Unknown Project'}</span>
                            {assignment.project?.code && (
                              <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                {assignment.project.code}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        {assignedSites.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-medium">
                            <ShieldAlert className="h-3.5 w-3.5" />
                            No site boundaries set
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 max-w-sm">
                            {assignedSites.map((site) => (
                              <span
                                key={site.id}
                                className="inline-flex items-center gap-1 rounded-lg bg-sky-50 border border-sky-200/70 px-2 py-0.5 text-[11px] font-medium text-sky-800"
                              >
                                <MapPin className="h-3 w-3 text-sky-600 shrink-0" />
                                <span>{site.name || 'Site'}</span>
                                <b className="font-mono text-[10px] text-sky-900">({site.radius_meters}m)</b>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4 text-slate-500">
                        <div className="flex flex-col gap-0.5 text-[11px]">
                          <div className="flex items-center gap-1 text-slate-700">
                            <Clock className="h-3 w-3 text-slate-400" />
                            <span>From: {assignment.assigned_from || '—'}</span>
                          </div>
                          {assignment.assigned_to && (
                            <span className="text-[10px] text-slate-500">
                              To: {assignment.assigned_to}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <StatusBadge status={assignment.is_active} />
                      </td>
                      <td className="py-4 px-4 sm:px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleToggleActive(assignment)}
                            className="rounded-lg p-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                            title={assignment.is_active ? 'Deactivate Assignment' : 'Activate Assignment'}
                          >
                            {assignment.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            onClick={() => handleOpenDelete(assignment)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                            title="Remove Assignment"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE ASSIGNMENT MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        maxWidth="lg"
        title="Assign Employee to Project & Sites"
        description="Select an employee and the project. The employee will be authorized for all active site boundaries under this project."
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
                  {emp.full_name} ({emp.email}) {emp.employee_code ? `[${emp.employee_code}]` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Select Project *
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Assigned From (Date) *
              </label>
              <input
                type="date"
                required
                value={assignedFrom}
                onChange={(e) => setAssignedFrom(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Assigned To (Optional)
              </label>
              <input
                type="date"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="assignmentActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <label htmlFor="assignmentActive" className="text-xs font-medium text-slate-700 cursor-pointer">
              Assignment is Active
            </label>
          </div>

          {/* Sites preview under the selected project */}
          {selectedProjectId && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block">
                Active Sites / Geofence Perimeters under this Project:
              </span>
              {geofences.filter((g) => g.project_id === selectedProjectId).length === 0 ? (
                <div className="flex items-center gap-2 text-amber-700 text-xs py-1">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
                  <span>
                    No active geofences configured for this project yet. Please add a geofence in Sites & Geofences.
                  </span>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 pt-1">
                  {geofences
                    .filter((g) => g.project_id === selectedProjectId)
                    .map((site) => (
                      <div
                        key={site.id}
                        className="rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs text-slate-800 flex items-center gap-2 shadow-2xs"
                      >
                        <MapPin className="h-3.5 w-3.5 text-sky-600" />
                        <span className="font-semibold">{site.name || 'Site Location'}</span>
                        <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {site.radius_meters}m
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

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
              {isSubmitting ? 'Assigning...' : 'Assign to Project & Sites'}
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
