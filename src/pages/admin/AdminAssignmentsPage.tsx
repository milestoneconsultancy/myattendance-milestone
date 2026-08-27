import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { logAuditEvent } from '../../lib/auditService'
import type {
  EmployeeProjectAssignment,
  EmployeeGeofenceAssignment,
  Profile,
  Project,
  Geofence
} from '../../types/database.types'
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
  ShieldAlert,
  Power,
  Layers,
  X,
  CheckSquare,
  Square
} from 'lucide-react'

interface AssignmentDetail extends EmployeeProjectAssignment {
  employee?: Profile | null
  project?: Project | null
}

export const AdminAssignmentsPage: React.FC = () => {
  const { user } = useAuth()

  // Master Data
  const [assignments, setAssignments] = useState<AssignmentDetail[]>([])
  const [employees, setEmployees] = useState<Profile[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [geofences, setGeofences] = useState<Geofence[]>([])
  const [geofenceAssignments, setGeofenceAssignments] = useState<EmployeeGeofenceAssignment[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('')
  const [projectFilter, setProjectFilter] = useState<string>('all')

  // Bulk Selection
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>([])

  // Create / Edit Assignment Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<AssignmentDetail | null>(null)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [selectedGeofenceIds, setSelectedGeofenceIds] = useState<string[]>([])
  const [assignedFrom, setAssignedFrom] = useState(new Date().toISOString().split('T')[0])
  const [assignedTo, setAssignedTo] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Bulk Assign Modal State
  const [isBulkAssignModalOpen, setIsBulkAssignModalOpen] = useState(false)
  const [bulkAssignProjectId, setBulkAssignProjectId] = useState('')
  const [bulkAssignGeofenceIds, setBulkAssignGeofenceIds] = useState<string[]>([])
  const [isProcessingBulkAssign, setIsProcessingBulkAssign] = useState(false)

  // Bulk Remove Modal State
  const [isBulkRemoveModalOpen, setIsBulkRemoveModalOpen] = useState(false)
  const [bulkRemoveProjectId, setBulkRemoveProjectId] = useState('')
  const [bulkRemoveGeofenceIds, setBulkRemoveGeofenceIds] = useState<string[]>([])
  const [isProcessingBulkRemove, setIsProcessingBulkRemove] = useState(false)

  // Deactivate Assignment Confirm
  const [deactivateItem, setDeactivateItem] = useState<AssignmentDetail | null>(null)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isDeactivating, setIsDeactivating] = useState(false)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setErrorMsg(null)
    try {
      // 1. Fetch Project Assignments
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
        .order('name', { ascending: true })

      if (geoErr) throw geoErr
      setGeofences(geoData || [])

      // 5. Fetch Geofence Assignments
      try {
        const { data: geoAssignData, error: geoAssignErr } = await supabase
          .from('employee_geofence_assignments')
          .select('*')
          .eq('is_active', true)

        if (!geoAssignErr && geoAssignData) {
          setGeofenceAssignments(geoAssignData)
        }
      } catch {
        setGeofenceAssignments([])
      }
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

  // 1. Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingAssignment(null)
    const defaultEmpId = employees.length > 0 ? employees[0].id : ''
    const defaultProjId = projects.length > 0 ? projects[0].id : ''
    const availableSites = geofences.filter((g) => g.project_id === defaultProjId).map((g) => g.id)

    setSelectedEmployeeId(defaultEmpId)
    setSelectedProjectId(defaultProjId)
    setSelectedGeofenceIds(availableSites)
    setAssignedFrom(new Date().toISOString().split('T')[0])
    setAssignedTo('')
    setIsActive(true)
    setIsModalOpen(true)
  }

  // 2. Open Edit Modal for a specific Assignment
  const handleOpenEditModal = (assignment: AssignmentDetail) => {
    setEditingAssignment(assignment)
    setSelectedEmployeeId(assignment.employee_id)
    setSelectedProjectId(assignment.project_id)

    // Load active geofences for this employee
    const activeGeoIds = geofenceAssignments
      .filter((ga) => ga.employee_id === assignment.employee_id && ga.is_active)
      .map((ga) => ga.geofence_id)

    if (activeGeoIds.length === 0) {
      // Default to all active sites for the project
      const projSites = geofences.filter((g) => g.project_id === assignment.project_id).map((g) => g.id)
      setSelectedGeofenceIds(projSites)
    } else {
      setSelectedGeofenceIds(activeGeoIds)
    }

    setAssignedFrom(assignment.assigned_from || new Date().toISOString().split('T')[0])
    setAssignedTo(assignment.assigned_to || '')
    setIsActive(assignment.is_active)
    setIsModalOpen(true)
  }

  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId)
    // Clear & reload geofences for new project
    const availableSites = geofences.filter((g) => g.project_id === projectId).map((g) => g.id)
    setSelectedGeofenceIds(availableSites)
  }

  const handleToggleGeofence = (geofenceId: string) => {
    setSelectedGeofenceIds((prev) =>
      prev.includes(geofenceId) ? prev.filter((id) => id !== geofenceId) : [...prev, geofenceId]
    )
  }

  // 3. Submit Assignment (Create or Edit)
  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEmployeeId || !selectedProjectId) {
      setErrorMsg('Please select both an employee and a project.')
      return
    }
    if (selectedGeofenceIds.length === 0) {
      setErrorMsg('Please select at least one authorized site/geofence.')
      return
    }

    setIsSubmitting(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const todayStr = new Date().toISOString().split('T')[0]
      const fromDate = assignedFrom || todayStr
      const toDate = assignedTo || null

      let assignmentId = editingAssignment?.id

      if (editingAssignment) {
        // UPDATE existing project assignment
        const { error: updateErr } = await supabase
          .from('employee_project_assignments')
          .update({
            project_id: selectedProjectId,
            assigned_from: fromDate,
            assigned_to: toDate,
            is_active: isActive
          })
          .eq('id', editingAssignment.id)

        if (updateErr) throw updateErr
      } else {
        // Check for existing assignment to avoid duplicate active rows
        const existing = assignments.find(
          (a) => a.employee_id === selectedEmployeeId && a.project_id === selectedProjectId
        )

        if (existing) {
          const { error: updateErr } = await supabase
            .from('employee_project_assignments')
            .update({
              assigned_from: fromDate,
              assigned_to: toDate,
              is_active: true
            })
            .eq('id', existing.id)

          if (updateErr) throw updateErr
          assignmentId = existing.id
        } else {
          // INSERT new project assignment
          const { data: newAssign, error: insertErr } = await supabase
            .from('employee_project_assignments')
            .insert({
              employee_id: selectedEmployeeId,
              project_id: selectedProjectId,
              assigned_from: fromDate,
              assigned_to: toDate,
              is_active: isActive
            })
            .select()
            .single()

          if (insertErr) throw insertErr
          assignmentId = newAssign.id
        }
      }

      // Reconcile Geofence Assignments
      // A) Activate selected geofences for this employee
      if (selectedGeofenceIds.length > 0) {
        const geoRows = selectedGeofenceIds.map((gId) => ({
          employee_id: selectedEmployeeId,
          geofence_id: gId,
          assigned_from: fromDate,
          assigned_to: toDate,
          is_active: isActive
        }))

        await supabase.from('employee_geofence_assignments').upsert(geoRows, {
          onConflict: 'employee_id,geofence_id'
        })
      }

      // B) Deactivate unselected geofences belonging to this project for this employee
      const projectAllGeofences = geofences.filter((g) => g.project_id === selectedProjectId).map((g) => g.id)
      const toDeactivate = projectAllGeofences.filter((id) => !selectedGeofenceIds.includes(id))

      if (toDeactivate.length > 0) {
        await supabase
          .from('employee_geofence_assignments')
          .update({ is_active: false, assigned_to: todayStr })
          .eq('employee_id', selectedEmployeeId)
          .in('geofence_id', toDeactivate)
      }

      const emp = employees.find((e) => e.id === selectedEmployeeId)
      const proj = projects.find((p) => p.id === selectedProjectId)
      const siteNames = geofences.filter((g) => selectedGeofenceIds.includes(g.id)).map((g) => g.name)

      await logAuditEvent({
        actorId: user?.id,
        action: editingAssignment ? 'EMPLOYEE_PROJECT_ASSIGN' : 'EMPLOYEE_PROJECT_ASSIGN',
        entityType: 'employee_project_assignments',
        entityId: assignmentId || selectedEmployeeId,
        newData: {
          employee_id: selectedEmployeeId,
          employee_name: emp?.full_name,
          project_id: selectedProjectId,
          project_name: proj?.name,
          geofence_ids: selectedGeofenceIds,
          geofence_names: siteNames,
          assigned_from: fromDate,
          assigned_to: toDate,
          is_active: isActive
        },
        remark: `Configured assignment for ${emp?.full_name || 'Employee'} (${proj?.name}, ${selectedGeofenceIds.length} sites)`
      })

      setSuccessMsg(
        `Assignment saved successfully for ${emp?.full_name || 'Employee'} (${proj?.name} — ${selectedGeofenceIds.length} site(s)).`
      )
      setIsModalOpen(false)
      setEditingAssignment(null)
      await fetchData()
    } catch (err) {
      console.error('[Assignments] Save error:', err)
      setErrorMsg((err as Error).message || 'Failed to save project assignment.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 4. Toggle Status (Activate / Deactivate)
  const handleToggleActive = async (item: AssignmentDetail) => {
    try {
      const nextStatus = !item.is_active
      const todayStr = new Date().toISOString().split('T')[0]

      const { error } = await supabase
        .from('employee_project_assignments')
        .update({
          is_active: nextStatus,
          assigned_to: nextStatus ? null : todayStr
        })
        .eq('id', item.id)

      if (error) throw error

      // Also toggle corresponding geofences
      const projGeofenceIds = geofences.filter((g) => g.project_id === item.project_id).map((g) => g.id)
      if (projGeofenceIds.length > 0) {
        await supabase
          .from('employee_geofence_assignments')
          .update({
            is_active: nextStatus,
            assigned_to: nextStatus ? null : todayStr
          })
          .eq('employee_id', item.employee_id)
          .in('geofence_id', projGeofenceIds)
      }

      await logAuditEvent({
        actorId: user?.id,
        action: nextStatus ? 'ASSIGNMENT_ACTIVATE' : 'ASSIGNMENT_DEACTIVATE',
        entityType: 'employee_project_assignments',
        entityId: item.id,
        oldData: { is_active: item.is_active },
        newData: { is_active: nextStatus },
        remark: `Assignment status changed to ${nextStatus ? 'active' : 'inactive'} for ${item.employee?.full_name}`
      })

      setSuccessMsg(`Assignment ${nextStatus ? 'activated' : 'deactivated'} successfully.`)
      await fetchData()
    } catch (err) {
      console.error('[Assignments] Toggle status error:', err)
      setErrorMsg((err as Error).message || 'Failed to update assignment status.')
    }
  }

  // 5. Deactivate / Unassign Handler (Safe deactivation without deleting history)
  const handleOpenDeactivate = (item: AssignmentDetail) => {
    setDeactivateItem(item)
    setIsConfirmOpen(true)
  }

  const handleConfirmDeactivate = async () => {
    if (!deactivateItem) return
    setIsDeactivating(true)
    const todayStr = new Date().toISOString().split('T')[0]

    try {
      // Mark project assignment inactive
      const { error: projErr } = await supabase
        .from('employee_project_assignments')
        .update({
          is_active: false,
          assigned_to: todayStr
        })
        .eq('id', deactivateItem.id)

      if (projErr) throw projErr

      // Mark geofence assignments inactive
      const projGeofenceIds = geofences.filter((g) => g.project_id === deactivateItem.project_id).map((g) => g.id)
      if (projGeofenceIds.length > 0) {
        await supabase
          .from('employee_geofence_assignments')
          .update({
            is_active: false,
            assigned_to: todayStr
          })
          .eq('employee_id', deactivateItem.employee_id)
          .in('geofence_id', projGeofenceIds)
      }

      await logAuditEvent({
        actorId: user?.id,
        action: 'EMPLOYEE_UNASSIGN_PROJECT',
        entityType: 'employee_project_assignments',
        entityId: deactivateItem.id,
        oldData: {
          employee_id: deactivateItem.employee_id,
          project_id: deactivateItem.project_id
        },
        remark: `Deactivated assignment of ${deactivateItem.employee?.full_name || 'Employee'} from ${deactivateItem.project?.name}`
      })

      setSuccessMsg(
        `Assignment deactivated for ${deactivateItem.employee?.full_name || 'Employee'}. Attendance history preserved.`
      )
      setIsConfirmOpen(false)
      setDeactivateItem(null)
      await fetchData()
    } catch (err) {
      console.error('[Assignments] Deactivation error:', err)
      setErrorMsg((err as Error).message || 'Failed to deactivate assignment.')
    } finally {
      setIsDeactivating(false)
    }
  }

  // 6. Bulk Selection Handlers
  const handleToggleSelectAll = () => {
    if (selectedAssignmentIds.length === filteredAssignments.length) {
      setSelectedAssignmentIds([])
    } else {
      setSelectedAssignmentIds(filteredAssignments.map((a) => a.id))
    }
  }

  const handleToggleSelectAssignment = (assignId: string) => {
    setSelectedAssignmentIds((prev) =>
      prev.includes(assignId) ? prev.filter((id) => id !== assignId) : [...prev, assignId]
    )
  }

  // 7. Bulk Assign Handlers
  const handleOpenBulkAssign = () => {
    const defaultProjId = projects.length > 0 ? projects[0].id : ''
    const availableSites = geofences.filter((g) => g.project_id === defaultProjId).map((g) => g.id)
    setBulkAssignProjectId(defaultProjId)
    setBulkAssignGeofenceIds(availableSites)
    setIsBulkAssignModalOpen(true)
  }

  const handleConfirmBulkAssign = async () => {
    if (!bulkAssignProjectId || bulkAssignGeofenceIds.length === 0 || selectedAssignmentIds.length === 0) return
    setIsProcessingBulkAssign(true)
    setErrorMsg(null)

    try {
      const todayStr = new Date().toISOString().split('T')[0]
      const selectedAssigns = assignments.filter((a) => selectedAssignmentIds.includes(a.id))
      const targetEmployeeIds = Array.from(new Set(selectedAssigns.map((a) => a.employee_id)))

      // Ensure project assignment for each employee
      for (const empId of targetEmployeeIds) {
        const existing = assignments.find((a) => a.employee_id === empId && a.project_id === bulkAssignProjectId)
        if (!existing) {
          await supabase.from('employee_project_assignments').insert({
            employee_id: empId,
            project_id: bulkAssignProjectId,
            assigned_from: todayStr,
            is_active: true
          })
        }
      }

      // Upsert geofence assignments
      const geoAssignRows: { employee_id: string; geofence_id: string; assigned_from: string; is_active: boolean }[] = []
      for (const empId of targetEmployeeIds) {
        for (const gId of bulkAssignGeofenceIds) {
          geoAssignRows.push({
            employee_id: empId,
            geofence_id: gId,
            assigned_from: todayStr,
            is_active: true
          })
        }
      }

      await supabase.from('employee_geofence_assignments').upsert(geoAssignRows, {
        onConflict: 'employee_id,geofence_id'
      })

      const targetProj = projects.find((p) => p.id === bulkAssignProjectId)
      const targetSites = geofences.filter((g) => bulkAssignGeofenceIds.includes(g.id)).map((g) => g.name)

      await logAuditEvent({
        actorId: user?.id,
        action: 'BULK_GEOFENCE_ASSIGN',
        entityType: 'employee_geofence_assignments',
        entityId: bulkAssignProjectId,
        newData: {
          employee_count: targetEmployeeIds.length,
          employee_ids: targetEmployeeIds,
          project_id: bulkAssignProjectId,
          geofence_ids: bulkAssignGeofenceIds,
          geofence_names: targetSites
        },
        remark: `Bulk assigned ${targetSites.length} site(s) under "${targetProj?.name}" to ${targetEmployeeIds.length} employee(s)`
      })

      setSuccessMsg(
        `Successfully assigned ${bulkAssignGeofenceIds.length} site(s) to ${targetEmployeeIds.length} employee(s).`
      )
      setIsBulkAssignModalOpen(false)
      setSelectedAssignmentIds([])
      await fetchData()
    } catch (err) {
      console.error('[Assignments] Bulk assign error:', err)
      setErrorMsg((err as Error).message || 'Failed to bulk assign sites.')
    } finally {
      setIsProcessingBulkAssign(false)
    }
  }

  // 8. Bulk Remove Handlers
  const handleOpenBulkRemove = () => {
    const defaultProjId = projects.length > 0 ? projects[0].id : ''
    setBulkRemoveProjectId(defaultProjId)
    setBulkRemoveGeofenceIds([])
    setIsBulkRemoveModalOpen(true)
  }

  const handleConfirmBulkRemove = async () => {
    if (!bulkRemoveProjectId || bulkRemoveGeofenceIds.length === 0 || selectedAssignmentIds.length === 0) return
    setIsProcessingBulkRemove(true)
    setErrorMsg(null)

    try {
      const todayStr = new Date().toISOString().split('T')[0]
      const selectedAssigns = assignments.filter((a) => selectedAssignmentIds.includes(a.id))
      const targetEmployeeIds = Array.from(new Set(selectedAssigns.map((a) => a.employee_id)))

      await supabase
        .from('employee_geofence_assignments')
        .update({
          is_active: false,
          assigned_to: todayStr
        })
        .in('employee_id', targetEmployeeIds)
        .in('geofence_id', bulkRemoveGeofenceIds)

      const targetProj = projects.find((p) => p.id === bulkRemoveProjectId)
      const removedSites = geofences.filter((g) => bulkRemoveGeofenceIds.includes(g.id)).map((g) => g.name)

      await logAuditEvent({
        actorId: user?.id,
        action: 'BULK_GEOFENCE_REMOVE',
        entityType: 'employee_geofence_assignments',
        entityId: bulkRemoveProjectId,
        oldData: {
          employee_count: targetEmployeeIds.length,
          employee_ids: targetEmployeeIds,
          project_id: bulkRemoveProjectId,
          removed_geofence_ids: bulkRemoveGeofenceIds,
          removed_geofence_names: removedSites
        },
        remark: `Bulk removed ${removedSites.length} site(s) under "${targetProj?.name}" from ${targetEmployeeIds.length} employee(s)`
      })

      setSuccessMsg(
        `Successfully removed ${bulkRemoveGeofenceIds.length} site(s) from ${targetEmployeeIds.length} employee(s).`
      )
      setIsBulkRemoveModalOpen(false)
      setSelectedAssignmentIds([])
      await fetchData()
    } catch (err) {
      console.error('[Assignments] Bulk remove error:', err)
      setErrorMsg((err as Error).message || 'Failed to bulk remove sites.')
    } finally {
      setIsProcessingBulkRemove(false)
    }
  }

  // 9. Filtered List
  const filteredAssignments = assignments.filter((a) => {
    const empName = a.employee?.full_name || ''
    const empEmail = a.employee?.email || ''
    const empCode = a.employee?.employee_code || ''
    const projName = a.project?.name || ''
    const matchesSearch =
      empName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      empEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      empCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
            Authorize employees to work and perform geofenced attendance at one or multiple project sites.
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

      {/* Floating Bulk Action Bar */}
      {selectedAssignmentIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900 px-5 py-3.5 text-white shadow-lg border border-slate-800 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500 text-[11px] font-bold">
              {selectedAssignmentIds.length}
            </span>
            <span>assignment(s) selected for bulk action</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenBulkAssign}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Assign Sites</span>
            </button>

            <button
              onClick={handleOpenBulkRemove}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600/80 hover:bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Remove Sites</span>
            </button>

            <button
              onClick={() => setSelectedAssignmentIds([])}
              className="rounded-xl bg-slate-800 hover:bg-slate-700 p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 rounded-2xl bg-white p-4 border border-slate-200 shadow-xs">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by employee name, email, staff code, or project..."
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
            <option value="all">All Projects</option>
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
        <LoadingSpinner message="Loading project assignments and authorized sites..." />
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
            Employees must be assigned to projects and sites to enable geofenced sign-ins. Click "+ New Site Assignment" to configure.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-3.5 px-3 sm:px-4 w-10 text-center">
                    <button
                      onClick={handleToggleSelectAll}
                      className="text-slate-400 hover:text-sky-600 transition-colors"
                      title={selectedAssignmentIds.length === filteredAssignments.length ? 'Deselect All' : 'Select All'}
                    >
                      {selectedAssignmentIds.length === filteredAssignments.length && filteredAssignments.length > 0 ? (
                        <CheckSquare className="h-4 w-4 text-sky-600" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3.5 px-4">Employee</th>
                  <th className="py-3.5 px-4">Assigned Project</th>
                  <th className="py-3.5 px-4">Authorized Sites & Geofences</th>
                  <th className="py-3.5 px-4">Assigned Validity</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredAssignments.map((assignment) => {
                  const isSelected = selectedAssignmentIds.includes(assignment.id)

                  // Look up specific authorized geofences for this employee
                  const empGeoAssigns = geofenceAssignments.filter(
                    (ga) => ga.employee_id === assignment.employee_id && ga.is_active
                  )
                  let authorizedSites: Geofence[] = []

                  if (empGeoAssigns.length > 0) {
                    authorizedSites = geofences.filter(
                      (g) => empGeoAssigns.some((ga) => ga.geofence_id === g.id) && g.is_active
                    )
                  } else {
                    // Fallback to project active geofences
                    authorizedSites = geofences.filter((g) => g.project_id === assignment.project_id && g.is_active)
                  }

                  return (
                    <tr
                      key={assignment.id}
                      className={`hover:bg-slate-50/60 transition-colors ${isSelected ? 'bg-sky-50/40' : ''}`}
                    >
                      <td className="py-4 px-3 sm:px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectAssignment(assignment.id)}
                          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                        />
                      </td>

                      <td className="py-4 px-4 font-semibold text-slate-900">
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
                        {authorizedSites.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-medium">
                            <ShieldAlert className="h-3.5 w-3.5" />
                            No site boundaries set
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 max-w-sm">
                            {authorizedSites.map((site) => (
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
                            onClick={() => handleOpenEditModal(assignment)}
                            className="rounded-lg p-1.5 text-sky-600 hover:bg-sky-50 transition-colors cursor-pointer"
                            title="Edit Authorized Sites & Validity"
                          >
                            <MapPin className="h-4 w-4" />
                          </button>

                          <button
                            onClick={() => handleToggleActive(assignment)}
                            className={`rounded-lg p-1.5 transition-colors cursor-pointer ${
                              assignment.is_active
                                ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600'
                                : 'text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700'
                            }`}
                            title={assignment.is_active ? 'Deactivate' : 'Activate'}
                          >
                            <Power className="h-4 w-4" />
                          </button>

                          <button
                            onClick={() => handleOpenDeactivate(assignment)}
                            className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Unassign / Deactivate Assignment"
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

      {/* ========================================================= */}
      {/* 1. CREATE / EDIT ASSIGNMENT MODAL                         */}
      {/* ========================================================= */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setEditingAssignment(null)
        }}
        title={editingAssignment ? 'Edit Project & Site Assignment' : 'New Project & Site Assignment'}
        description="Assign employee to a project and authorize specific physical site perimeters for attendance."
      >
        <form onSubmit={handleSaveAssignment} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Select Employee *
            </label>
            <select
              required
              disabled={Boolean(editingAssignment)}
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2 px-3 text-xs font-medium text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none disabled:opacity-60"
            >
              <option value="" disabled>
                Select an employee...
              </option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name} ({emp.employee_code || emp.email})
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
              onChange={(e) => handleProjectChange(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2 px-3 text-xs font-medium text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
            >
              <option value="" disabled>
                Select a project...
              </option>
              {projects.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.name} {proj.code ? `(${proj.code})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Multi-Select Sites / Geofences */}
          {selectedProjectId && (
            <div className="space-y-2 rounded-xl bg-slate-50 p-3.5 border border-slate-200">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Authorized Sites / Geofences ({selectedGeofenceIds.length} Selected) *
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const allProjectSites = geofences.filter((g) => g.project_id === selectedProjectId).map((g) => g.id)
                      setSelectedGeofenceIds(allProjectSites)
                    }}
                    className="text-[11px] font-semibold text-sky-600 hover:text-sky-800"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={() => setSelectedGeofenceIds([])}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-700"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {geofences.filter((g) => g.project_id === selectedProjectId).length === 0 ? (
                <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                  No active sites configured for this project. Please create a site under Sites & Geofences first.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {geofences
                    .filter((g) => g.project_id === selectedProjectId)
                    .map((geo) => {
                      const isChecked = selectedGeofenceIds.includes(geo.id)
                      return (
                        <label
                          key={geo.id}
                          className={`flex items-center justify-between rounded-lg p-2 text-xs border transition-colors cursor-pointer ${
                            isChecked
                              ? 'bg-sky-50/80 border-sky-200 text-sky-950 font-medium'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleGeofence(geo.id)}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                            />
                            <span>{geo.name}</span>
                          </div>
                          <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            {geo.radius_meters}m radius
                          </span>
                        </label>
                      )
                    })}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Assigned From Date *
              </label>
              <input
                type="date"
                required
                value={assignedFrom}
                onChange={(e) => setAssignedFrom(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2 px-3 text-xs text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Assigned To Date (Optional)
              </label>
              <input
                type="date"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2 px-3 text-xs text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              id="assign-is-active"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <label htmlFor="assign-is-active" className="text-xs font-semibold text-slate-700">
              Active Assignment (Enables immediate GPS sign-in)
            </label>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => {
                setIsModalOpen(false)
                setEditingAssignment(null)
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isSubmitting ? 'Saving Assignment...' : 'Save Project & Site Assignment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================= */}
      {/* 2. BULK ASSIGN SITES MODAL                                */}
      {/* ========================================================= */}
      <Modal
        isOpen={isBulkAssignModalOpen}
        onClose={() => setIsBulkAssignModalOpen(false)}
        title={`Bulk Assign Sites (${selectedAssignmentIds.length} Assignments)`}
        description="Select a project and sites to assign in bulk to all selected staff members."
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Target Project
            </label>
            <select
              value={bulkAssignProjectId}
              onChange={(e) => {
                const newProjId = e.target.value
                setBulkAssignProjectId(newProjId)
                const newSites = geofences.filter((g) => g.project_id === newProjId).map((g) => g.id)
                setBulkAssignGeofenceIds(newSites)
              }}
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2 px-3 text-xs font-medium text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
            >
              {projects.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.name} {proj.code ? `(${proj.code})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 rounded-xl bg-slate-50 p-3.5 border border-slate-200">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Select Sites to Assign ({bulkAssignGeofenceIds.length} Selected)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const allSites = geofences.filter((g) => g.project_id === bulkAssignProjectId).map((g) => g.id)
                    setBulkAssignGeofenceIds(allSites)
                  }}
                  className="text-[11px] font-semibold text-sky-600 hover:text-sky-800"
                >
                  Select All
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={() => setBulkAssignGeofenceIds([])}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-700"
                >
                  Clear All
                </button>
              </div>
            </div>

            {geofences.filter((g) => g.project_id === bulkAssignProjectId).length === 0 ? (
              <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                No active sites found for this project.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {geofences
                  .filter((g) => g.project_id === bulkAssignProjectId)
                  .map((geo) => {
                    const isChecked = bulkAssignGeofenceIds.includes(geo.id)
                    return (
                      <label
                        key={geo.id}
                        className={`flex items-center justify-between rounded-lg p-2 text-xs border transition-colors cursor-pointer ${
                          isChecked
                            ? 'bg-sky-50/80 border-sky-200 text-sky-950 font-medium'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setBulkAssignGeofenceIds((prev) =>
                                isChecked ? prev.filter((id) => id !== geo.id) : [...prev, geo.id]
                              )
                            }}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                          />
                          <span>{geo.name}</span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          {geo.radius_meters}m radius
                        </span>
                      </label>
                    )
                  })}
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setIsBulkAssignModalOpen(false)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmBulkAssign}
              disabled={isProcessingBulkAssign || bulkAssignGeofenceIds.length === 0}
              className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isProcessingBulkAssign
                ? 'Assigning Sites...'
                : `Assign Selected Sites to Selected Assignments`}
            </button>
          </div>
        </div>
      </Modal>

      {/* ========================================================= */}
      {/* 3. BULK REMOVE SITES MODAL                                */}
      {/* ========================================================= */}
      <Modal
        isOpen={isBulkRemoveModalOpen}
        onClose={() => setIsBulkRemoveModalOpen(false)}
        title={`Bulk Remove Sites (${selectedAssignmentIds.length} Assignments)`}
        description="Select sites to revoke authorization from all selected assignments."
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Project
            </label>
            <select
              value={bulkRemoveProjectId}
              onChange={(e) => {
                setBulkRemoveProjectId(e.target.value)
                setBulkRemoveGeofenceIds([])
              }}
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2 px-3 text-xs font-medium text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
            >
              {projects.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.name} {proj.code ? `(${proj.code})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 rounded-xl bg-slate-50 p-3.5 border border-slate-200">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Select Sites to Revoke
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const allSites = geofences.filter((g) => g.project_id === bulkRemoveProjectId).map((g) => g.id)
                    setBulkRemoveGeofenceIds(allSites)
                  }}
                  className="text-[11px] font-semibold text-rose-600 hover:text-rose-800"
                >
                  Select All
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={() => setBulkRemoveGeofenceIds([])}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-700"
                >
                  Clear All
                </button>
              </div>
            </div>

            {geofences.filter((g) => g.project_id === bulkRemoveProjectId).length === 0 ? (
              <p className="text-xs text-slate-500 bg-slate-100 p-2.5 rounded-lg">
                No active sites found for this project.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {geofences
                  .filter((g) => g.project_id === bulkRemoveProjectId)
                  .map((geo) => {
                    const isChecked = bulkRemoveGeofenceIds.includes(geo.id)
                    return (
                      <label
                        key={geo.id}
                        className={`flex items-center justify-between rounded-lg p-2 text-xs border transition-colors cursor-pointer ${
                          isChecked
                            ? 'bg-rose-50 border-rose-200 text-rose-950 font-medium'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setBulkRemoveGeofenceIds((prev) =>
                                isChecked ? prev.filter((id) => id !== geo.id) : [...prev, geo.id]
                              )
                            }}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                          />
                          <span>{geo.name}</span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          {geo.radius_meters}m radius
                        </span>
                      </label>
                    )
                  })}
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setIsBulkRemoveModalOpen(false)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmBulkRemove}
              disabled={isProcessingBulkRemove || bulkRemoveGeofenceIds.length === 0}
              className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isProcessingBulkRemove
                ? 'Revoking Sites...'
                : `Remove Selected Sites from Selected Assignments`}
            </button>
          </div>
        </div>
      </Modal>

      {/* ========================================================= */}
      {/* 4. CONFIRM DEACTIVATE DIALOG                              */}
      {/* ========================================================= */}
      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirmDeactivate}
        isLoading={isDeactivating}
        title="Deactivate Site Assignment"
        message={`Are you sure you want to deactivate the site assignment for ${deactivateItem?.employee?.full_name || 'Employee'} from ${deactivateItem?.project?.name || 'Project'}? Historical attendance records will remain preserved.`}
        confirmText="Deactivate Assignment"
        isDestructive={true}
      />
    </div>
  )
}
