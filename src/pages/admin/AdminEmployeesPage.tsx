import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { logAuditEvent } from '../../lib/auditService'
import { createEmployeeAccount } from '../../lib/employeeService'
import type {
  Profile,
  Device,
  Project,
  Geofence,
  EmployeeProjectAssignment,
  EmployeeGeofenceAssignment
} from '../../types/database.types'
import { StatusBadge } from '../../components/common/StatusBadge'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { ConfirmDialog } from '../../components/common/ConfirmDialog'
import { Modal } from '../../components/common/Modal'
import {
  Users,
  Search,
  RefreshCw,
  AlertCircle,
  Smartphone,
  SmartphoneNfc,
  Power,
  Plus,
  Mail,
  User,
  Hash,
  Phone,
  Copy,
  Check,
  Key,
  MapPin,
  Building2,
  CheckSquare,
  Square,
  Layers,
  Trash2,
  X
} from 'lucide-react'

export const AdminEmployeesPage: React.FC = () => {
  const { user } = useAuth()

  // Master Data
  const [employees, setEmployees] = useState<Profile[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [geofences, setGeofences] = useState<Geofence[]>([])
  const [projectAssignments, setProjectAssignments] = useState<EmployeeProjectAssignment[]>([])
  const [geofenceAssignments, setGeofenceAssignments] = useState<EmployeeGeofenceAssignment[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [projectFilter, setProjectFilter] = useState<string>('all')

  // Bulk Selection
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([])

  // Created Credentials Banner
  const [createdCredentials, setCreatedCredentials] = useState<{
    name: string
    email: string
    code: string
    projectName?: string
    siteNames?: string[]
    tempPassword: string
  } | null>(null)
  const [copiedPass, setCopiedPass] = useState(false)

  // Add Employee Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [addFormData, setAddFormData] = useState({
    full_name: '',
    email: '',
    employee_code: '',
    phone: '',
    project_id: '',
    geofence_ids: [] as string[]
  })
  const [isSubmittingEmployee, setIsSubmittingEmployee] = useState(false)

  // Single Employee "Manage Sites" Modal State
  const [isManageSitesModalOpen, setIsManageSitesModalOpen] = useState(false)
  const [managingEmployee, setManagingEmployee] = useState<Profile | null>(null)
  const [manageProjectId, setManageProjectId] = useState<string>('')
  const [manageGeofenceIds, setManageGeofenceIds] = useState<string[]>([])
  const [isSavingSites, setIsSavingSites] = useState(false)

  // Bulk Assign Modal State
  const [isBulkAssignModalOpen, setIsBulkAssignModalOpen] = useState(false)
  const [bulkAssignProjectId, setBulkAssignProjectId] = useState<string>('')
  const [bulkAssignGeofenceIds, setBulkAssignGeofenceIds] = useState<string[]>([])
  const [isProcessingBulkAssign, setIsProcessingBulkAssign] = useState(false)

  // Bulk Remove Modal State
  const [isBulkRemoveModalOpen, setIsBulkRemoveModalOpen] = useState(false)
  const [bulkRemoveProjectId, setBulkRemoveProjectId] = useState<string>('')
  const [bulkRemoveGeofenceIds, setBulkRemoveGeofenceIds] = useState<string[]>([])
  const [isProcessingBulkRemove, setIsProcessingBulkRemove] = useState(false)

  // Unbind / Toggle Confirmation
  const [selectedEmp, setSelectedEmp] = useState<Profile | null>(null)
  const [actionType, setActionType] = useState<'unbind' | 'toggle_status' | null>(null)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // 1. Fetch All Data
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setErrorMsg(null)
    try {
      // 1. Fetch Employees
      const { data: empData, error: empErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'employee')
        .order('full_name', { ascending: true })

      if (empErr) throw empErr
      setEmployees(empData || [])

      // 2. Fetch Devices
      const { data: devData, error: devErr } = await supabase
        .from('devices')
        .select('*')

      if (devErr) throw devErr
      setDevices(devData || [])

      // 3. Fetch Projects
      const { data: projData, error: projErr } = await supabase
        .from('projects')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true })

      if (projErr) throw projErr
      setProjects(projData || [])

      // 4. Fetch Geofences
      const { data: geoData, error: geoErr } = await supabase
        .from('geofences')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true })

      if (geoErr) throw geoErr
      setGeofences(geoData || [])

      // 5. Fetch Project Assignments
      const { data: assignData, error: assignErr } = await supabase
        .from('employee_project_assignments')
        .select('*')
        .eq('is_active', true)

      if (assignErr) throw assignErr
      setProjectAssignments(assignData || [])

      // 6. Fetch Geofence Assignments
      try {
        const { data: geoAssignData, error: geoAssignErr } = await supabase
          .from('employee_geofence_assignments')
          .select('*')
          .eq('is_active', true)

        if (!geoAssignErr && geoAssignData) {
          setGeofenceAssignments(geoAssignData)
        }
      } catch {
        // Fallback gracefully if junction table is in process of deployment
        setGeofenceAssignments([])
      }
    } catch (err) {
      console.error('[Employees] Error loading data:', err)
      setErrorMsg((err as Error).message || 'Failed to load employees and assignments.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 2. Add Employee Handlers
  const handleOpenAddModal = () => {
    const defaultProjId = projects.length > 0 ? projects[0].id : ''
    const availableGeofences = geofences.filter((g) => g.project_id === defaultProjId && g.is_active)
    
    setAddFormData({
      full_name: '',
      email: '',
      employee_code: '',
      phone: '',
      project_id: defaultProjId,
      geofence_ids: availableGeofences.map((g) => g.id) // Default select all for convenience
    })
    setIsAddModalOpen(true)
  }

  const handleAddProjectChange = (projectId: string) => {
    const availableGeofences = geofences.filter((g) => g.project_id === projectId && g.is_active)
    setAddFormData((prev) => ({
      ...prev,
      project_id: projectId,
      geofence_ids: availableGeofences.map((g) => g.id)
    }))
  }

  const handleToggleAddGeofence = (geofenceId: string) => {
    setAddFormData((prev) => {
      const exists = prev.geofence_ids.includes(geofenceId)
      return {
        ...prev,
        geofence_ids: exists
          ? prev.geofence_ids.filter((id) => id !== geofenceId)
          : [...prev.geofence_ids, geofenceId]
      }
    })
  }

  const handleAddEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setSuccessMsg(null)
    setCreatedCredentials(null)

    const name = addFormData.full_name.trim()
    const email = addFormData.email.trim().toLowerCase()
    const code = addFormData.employee_code.trim().toUpperCase()
    const phone = addFormData.phone.trim() || null
    const projectId = addFormData.project_id
    const geofenceIds = addFormData.geofence_ids

    if (!name) {
      setErrorMsg('Employee full name is required.')
      return
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMsg('A valid compulsory email address is required.')
      return
    }
    if (!code) {
      setErrorMsg('Employee / Staff code is required.')
      return
    }
    if (!projectId) {
      setErrorMsg('Please select a project for the employee.')
      return
    }
    if (geofenceIds.length === 0) {
      setErrorMsg('Please select at least one authorized site/geofence.')
      return
    }

    // Duplicate check in loaded list
    if (employees.some((emp) => emp.email?.toLowerCase() === email)) {
      setErrorMsg(`An employee with email "${email}" already exists.`)
      return
    }
    if (employees.some((emp) => emp.employee_code?.toUpperCase() === code)) {
      setErrorMsg(`An employee with staff code "${code}" already exists.`)
      return
    }

    setIsSubmittingEmployee(true)
    try {
      const result = await createEmployeeAccount({
        full_name: name,
        email: email,
        employee_code: code,
        phone: phone,
        project_id: projectId,
        geofence_ids: geofenceIds
      })

      if (!result.success || !result.profile) {
        throw new Error(result.error || 'Failed to create employee account.')
      }

      const assignedProject = projects.find((p) => p.id === projectId)
      const assignedGeofences = geofences.filter((g) => geofenceIds.includes(g.id))

      setCreatedCredentials({
        name: result.profile.full_name,
        email: result.profile.email || email,
        code: result.profile.employee_code || code,
        projectName: assignedProject?.name || 'Assigned Project',
        siteNames: assignedGeofences.map((g) => `${g.name} (${g.radius_meters}m)`),
        tempPassword: result.tempPassword || 'AutoGenerated'
      })

      setSuccessMsg(
        `Employee account for "${result.profile.full_name}" (${result.profile.employee_code || code}) created successfully with ${geofenceIds.length} authorized site(s).`
      )
      setIsAddModalOpen(false)
      await fetchData()
    } catch (err) {
      console.error('[Employees] Creation failed:', err)
      setErrorMsg((err as Error).message || 'Failed to create employee profile.')
    } finally {
      setIsSubmittingEmployee(false)
    }
  }

  // 3. Single Employee "Manage Sites" Handlers
  const handleOpenManageSites = (emp: Profile) => {
    setManagingEmployee(emp)
    
    // Find employee's assigned project
    const currentAssign = projectAssignments.find((a) => a.employee_id === emp.id && a.is_active)
    const initialProjectId = currentAssign?.project_id || (projects.length > 0 ? projects[0].id : '')
    setManageProjectId(initialProjectId)

    // Find currently active geofence assignments
    const currentGeoAssigns = geofenceAssignments
      .filter((ga) => ga.employee_id === emp.id && ga.is_active)
      .map((ga) => ga.geofence_id)

    // If no specific geofence assignments exist yet, default to all geofences for that project
    if (currentGeoAssigns.length === 0 && initialProjectId) {
      const defaultSites = geofences.filter((g) => g.project_id === initialProjectId).map((g) => g.id)
      setManageGeofenceIds(defaultSites)
    } else {
      setManageGeofenceIds(currentGeoAssigns)
    }

    setIsManageSitesModalOpen(true)
  }

  const handleSaveManageSites = async () => {
    if (!managingEmployee || !manageProjectId) return
    if (manageGeofenceIds.length === 0) {
      setErrorMsg('Please select at least one authorized site.')
      return
    }

    setIsSavingSites(true)
    setErrorMsg(null)
    try {
      const todayStr = new Date().toISOString().split('T')[0]

      // 1. Ensure employee_project_assignments has active row for manageProjectId
      const existingProjAssign = projectAssignments.find(
        (a) => a.employee_id === managingEmployee.id && a.project_id === manageProjectId
      )

      if (!existingProjAssign) {
        await supabase.from('employee_project_assignments').insert({
          employee_id: managingEmployee.id,
          project_id: manageProjectId,
          assigned_from: todayStr,
          is_active: true
        })
      }

      // 2. Geofences to activate vs deactivate for this project
      const projectGeofenceIds = geofences.filter((g) => g.project_id === manageProjectId).map((g) => g.id)
      
      const toActivate = manageGeofenceIds.filter((id) => projectGeofenceIds.includes(id))
      const toDeactivate = projectGeofenceIds.filter((id) => !manageGeofenceIds.includes(id))

      // Upsert activated geofences
      if (toActivate.length > 0) {
        const rows = toActivate.map((gId) => ({
          employee_id: managingEmployee.id,
          geofence_id: gId,
          assigned_from: todayStr,
          is_active: true
        }))
        await supabase.from('employee_geofence_assignments').upsert(rows, {
          onConflict: 'employee_id,geofence_id'
        })
      }

      // Deactivate unchecked geofences
      if (toDeactivate.length > 0) {
        await supabase
          .from('employee_geofence_assignments')
          .update({ is_active: false })
          .eq('employee_id', managingEmployee.id)
          .in('geofence_id', toDeactivate)
      }

      const assignedProject = projects.find((p) => p.id === manageProjectId)
      const assignedGeofenceNames = geofences.filter((g) => toActivate.includes(g.id)).map((g) => g.name)

      await logAuditEvent({
        actorId: user?.id,
        action: 'EMPLOYEE_GEOFENCE_ASSIGN',
        entityType: 'employee_geofence_assignments',
        entityId: managingEmployee.id,
        newData: {
          employee_id: managingEmployee.id,
          project_id: manageProjectId,
          geofence_ids: toActivate,
          geofence_names: assignedGeofenceNames
        },
        remark: `Updated authorized sites for ${managingEmployee.full_name} (${toActivate.length} active site(s) under ${assignedProject?.name || 'Project'})`
      })

      setSuccessMsg(
        `Authorized sites for "${managingEmployee.full_name}" updated successfully (${toActivate.length} site(s) assigned).`
      )
      setIsManageSitesModalOpen(false)
      setManagingEmployee(null)
      await fetchData()
    } catch (err) {
      console.error('[Employees] Error updating authorized sites:', err)
      setErrorMsg((err as Error).message || 'Failed to update authorized sites.')
    } finally {
      setIsSavingSites(false)
    }
  }

  // 4. Bulk Selection Handlers
  const handleToggleSelectAll = () => {
    if (selectedEmployeeIds.length === filteredEmployees.length) {
      setSelectedEmployeeIds([])
    } else {
      setSelectedEmployeeIds(filteredEmployees.map((e) => e.id))
    }
  }

  const handleToggleSelectEmployee = (empId: string) => {
    setSelectedEmployeeIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    )
  }

  // 5. Bulk Assign Handlers
  const handleOpenBulkAssign = () => {
    const defaultProjId = projects.length > 0 ? projects[0].id : ''
    const availableGeofences = geofences.filter((g) => g.project_id === defaultProjId && g.is_active)
    setBulkAssignProjectId(defaultProjId)
    setBulkAssignGeofenceIds(availableGeofences.map((g) => g.id))
    setIsBulkAssignModalOpen(true)
  }

  const handleConfirmBulkAssign = async () => {
    if (!bulkAssignProjectId || bulkAssignGeofenceIds.length === 0 || selectedEmployeeIds.length === 0) return
    setIsProcessingBulkAssign(true)
    setErrorMsg(null)
    try {
      const todayStr = new Date().toISOString().split('T')[0]

      // 1. Ensure project assignments for all selected employees
      const projAssignRows = selectedEmployeeIds.map((empId) => ({
        employee_id: empId,
        project_id: bulkAssignProjectId,
        assigned_from: todayStr,
        is_active: true
      }))

      for (const row of projAssignRows) {
        const existing = projectAssignments.find(
          (a) => a.employee_id === row.employee_id && a.project_id === row.project_id
        )
        if (!existing) {
          await supabase.from('employee_project_assignments').insert(row)
        }
      }

      // 2. Insert geofence assignments
      const geoAssignRows: { employee_id: string; geofence_id: string; assigned_from: string; is_active: boolean }[] = []
      for (const empId of selectedEmployeeIds) {
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
          employee_count: selectedEmployeeIds.length,
          employee_ids: selectedEmployeeIds,
          project_id: bulkAssignProjectId,
          geofence_ids: bulkAssignGeofenceIds,
          geofence_names: targetSites
        },
        remark: `Bulk assigned ${targetSites.length} site(s) under "${targetProj?.name}" to ${selectedEmployeeIds.length} employee(s)`
      })

      setSuccessMsg(
        `Successfully assigned ${bulkAssignGeofenceIds.length} site(s) to ${selectedEmployeeIds.length} employee(s).`
      )
      setIsBulkAssignModalOpen(false)
      setSelectedEmployeeIds([])
      await fetchData()
    } catch (err) {
      console.error('[Employees] Bulk assign error:', err)
      setErrorMsg((err as Error).message || 'Failed to bulk assign sites.')
    } finally {
      setIsProcessingBulkAssign(false)
    }
  }

  // 6. Bulk Remove Handlers
  const handleOpenBulkRemove = () => {
    const defaultProjId = projects.length > 0 ? projects[0].id : ''
    setBulkRemoveProjectId(defaultProjId)
    setBulkRemoveGeofenceIds([])
    setIsBulkRemoveModalOpen(true)
  }

  const handleConfirmBulkRemove = async () => {
    if (!bulkRemoveProjectId || bulkRemoveGeofenceIds.length === 0 || selectedEmployeeIds.length === 0) return
    setIsProcessingBulkRemove(true)
    setErrorMsg(null)
    try {
      await supabase
        .from('employee_geofence_assignments')
        .update({ is_active: false })
        .in('employee_id', selectedEmployeeIds)
        .in('geofence_id', bulkRemoveGeofenceIds)

      const targetProj = projects.find((p) => p.id === bulkRemoveProjectId)
      const removedSites = geofences.filter((g) => bulkRemoveGeofenceIds.includes(g.id)).map((g) => g.name)

      await logAuditEvent({
        actorId: user?.id,
        action: 'BULK_GEOFENCE_REMOVE',
        entityType: 'employee_geofence_assignments',
        entityId: bulkRemoveProjectId,
        oldData: {
          employee_count: selectedEmployeeIds.length,
          employee_ids: selectedEmployeeIds,
          project_id: bulkRemoveProjectId,
          removed_geofence_ids: bulkRemoveGeofenceIds,
          removed_geofence_names: removedSites
        },
        remark: `Bulk removed ${removedSites.length} site(s) under "${targetProj?.name}" from ${selectedEmployeeIds.length} employee(s)`
      })

      setSuccessMsg(
        `Successfully removed ${bulkRemoveGeofenceIds.length} site(s) from ${selectedEmployeeIds.length} employee(s).`
      )
      setIsBulkRemoveModalOpen(false)
      setSelectedEmployeeIds([])
      await fetchData()
    } catch (err) {
      console.error('[Employees] Bulk remove error:', err)
      setErrorMsg((err as Error).message || 'Failed to bulk remove sites.')
    } finally {
      setIsProcessingBulkRemove(false)
    }
  }

  // 7. Device & Status Handlers
  const handleOpenUnbind = (emp: Profile) => {
    setSelectedEmp(emp)
    setActionType('unbind')
    setIsConfirmOpen(true)
  }

  const handleOpenToggleStatus = (emp: Profile) => {
    setSelectedEmp(emp)
    setActionType('toggle_status')
    setIsConfirmOpen(true)
  }

  const handleConfirmAction = async () => {
    if (!selectedEmp || !actionType) return
    setIsProcessing(true)
    setErrorMsg(null)

    try {
      if (actionType === 'unbind') {
        const { error } = await supabase
          .from('devices')
          .update({
            is_active: false,
            unbound_at: new Date().toISOString(),
            unbound_by: user?.id || null
          })
          .eq('employee_id', selectedEmp.id)

        if (error) throw error

        await logAuditEvent({
          actorId: user?.id,
          action: 'DEVICE_UNBIND',
          entityType: 'devices',
          entityId: selectedEmp.id,
          oldData: { employee_id: selectedEmp.id },
          remark: `Unbound active device for ${selectedEmp.full_name}`
        })

        setSuccessMsg(`Device unbound successfully for ${selectedEmp.full_name}.`)
      } else if (actionType === 'toggle_status') {
        const newStatus = !selectedEmp.is_active
        const { error } = await supabase
          .from('profiles')
          .update({ is_active: newStatus, updated_at: new Date().toISOString() })
          .eq('id', selectedEmp.id)

        if (error) throw error

        await logAuditEvent({
          actorId: user?.id,
          action: newStatus ? 'EMPLOYEE_ACTIVATE' : 'EMPLOYEE_DEACTIVATE',
          entityType: 'profiles',
          entityId: selectedEmp.id,
          oldData: { is_active: selectedEmp.is_active },
          newData: { is_active: newStatus },
          remark: `Employee ${selectedEmp.full_name} status changed to ${newStatus ? 'active' : 'inactive'}`
        })

        setSuccessMsg(`Account status updated for ${selectedEmp.full_name}.`)
      }

      setIsConfirmOpen(false)
      setSelectedEmp(null)
      setActionType(null)
      await fetchData()
    } catch (err) {
      console.error('[Employees] Action failed:', err)
      setErrorMsg((err as Error).message || 'Action failed.')
    } finally {
      setIsProcessing(false)
    }
  }

  // 8. Filtered Employees List
  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch =
      emp.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (emp.email && emp.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (emp.employee_code && emp.employee_code.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'active'
        ? emp.is_active
        : !emp.is_active

    const empAssigns = projectAssignments.filter((a) => a.employee_id === emp.id && a.is_active)
    const matchesProject =
      projectFilter === 'all'
        ? true
        : empAssigns.some((a) => a.project_id === projectFilter)

    return matchesSearch && matchesStatus && matchesProject
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-white p-6 border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
              <Users className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Employee & Site Management</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Manage staff directory, project & multiple site authorizations, device bindings, and bulk geofence assignments.
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>Add Employee</span>
        </button>
      </div>

      {/* Created Credentials Card */}
      {createdCredentials && (
        <div className="rounded-2xl bg-gradient-to-br from-indigo-950 via-slate-900 to-sky-950 p-5 text-white shadow-md border border-indigo-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-indigo-500/20 p-2 text-indigo-300">
                <Key className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">New Employee Credentials Generated</h3>
                <p className="text-[11px] text-indigo-200">Share these initial sign-in credentials with the employee.</p>
              </div>
            </div>
            <button
              onClick={() => {
                const siteListText = createdCredentials.siteNames?.join(', ') || 'Assigned Sites'
                navigator.clipboard.writeText(
                  `Milestone Attendance Portal\nName: ${createdCredentials.name} (${createdCredentials.code})\nEmail: ${createdCredentials.email}\nProject: ${createdCredentials.projectName}\nAuthorized Sites: ${siteListText}\nTemporary Password: ${createdCredentials.tempPassword}\nLogin: ${window.location.origin}/login`
                )
                setCopiedPass(true)
                setTimeout(() => setCopiedPass(false), 3000)
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs font-semibold text-white border border-white/10 transition-colors cursor-pointer"
            >
              {copiedPass ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedPass ? 'Copied!' : 'Copy Credentials'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 text-xs border-t border-white/10">
            <div className="bg-white/5 rounded-xl p-3 border border-white/5">
              <span className="block text-[10px] uppercase font-bold text-indigo-300">Staff Member</span>
              <span className="font-semibold text-white mt-0.5 block">{createdCredentials.name} ({createdCredentials.code})</span>
            </div>
            <div className="bg-white/5 rounded-xl p-3 border border-white/5">
              <span className="block text-[10px] uppercase font-bold text-indigo-300">Email Address</span>
              <span className="font-mono text-white mt-0.5 block">{createdCredentials.email}</span>
            </div>
            <div className="bg-white/5 rounded-xl p-3 border border-white/5">
              <span className="block text-[10px] uppercase font-bold text-indigo-300">Project & Sites</span>
              <span className="font-semibold text-white mt-0.5 block truncate" title={createdCredentials.siteNames?.join(', ')}>
                {createdCredentials.projectName} ({createdCredentials.siteNames?.length || 0} sites)
              </span>
            </div>
            <div className="bg-white/5 rounded-xl p-3 border border-white/5">
              <span className="block text-[10px] uppercase font-bold text-indigo-300">Temporary Password</span>
              <span className="font-mono font-bold text-amber-300 mt-0.5 block select-all">{createdCredentials.tempPassword}</span>
            </div>
          </div>

          <p className="text-[10px] text-slate-400">
            * The employee will be required to set a permanent password and bind their device upon first sign-in.
          </p>
        </div>
      )}

      {/* Notifications */}
      {successMsg && !createdCredentials && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3.5 text-xs font-medium text-emerald-800 border border-emerald-200">
          <Check className="h-4 w-4 text-emerald-600 shrink-0" />
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
      {selectedEmployeeIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900 px-5 py-3.5 text-white shadow-lg border border-slate-800 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-[11px] font-bold">
              {selectedEmployeeIds.length}
            </span>
            <span>employee(s) selected for bulk operations</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenBulkAssign}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
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
              onClick={() => setSelectedEmployeeIds([])}
              className="rounded-xl bg-slate-800 hover:bg-slate-700 p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <div className="flex flex-col md:flex-row gap-3 rounded-2xl bg-white p-4 border border-slate-200 shadow-xs">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by employee name, email, or staff code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Project Filter */}
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

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
            className="rounded-xl border border-slate-200 bg-slate-50/50 py-2 px-3 text-xs font-medium text-slate-700 focus:border-sky-500 focus:bg-white focus:outline-none"
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>

          <button
            onClick={fetchData}
            title="Refresh directory"
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Employees Table */}
      {isLoading ? (
        <LoadingSpinner message="Loading employee directory and site authorizations..." />
      ) : errorMsg && employees.length === 0 ? (
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
      ) : filteredEmployees.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <Users className="h-10 w-10 text-slate-400 mb-3" />
          <h3 className="text-sm font-bold text-slate-800">No Employees Found</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm">
            {searchTerm || statusFilter !== 'all' || projectFilter !== 'all'
              ? 'No employees match your search and filter criteria.'
              : 'No employee accounts are registered yet in the profiles table.'}
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
                      className="text-slate-400 hover:text-indigo-600 transition-colors"
                      title={selectedEmployeeIds.length === filteredEmployees.length ? 'Deselect All' : 'Select All'}
                    >
                      {selectedEmployeeIds.length === filteredEmployees.length && filteredEmployees.length > 0 ? (
                        <CheckSquare className="h-4 w-4 text-indigo-600" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3.5 px-4">Employee Name</th>
                  <th className="py-3.5 px-4">Email</th>
                  <th className="py-3.5 px-4">Assigned Project</th>
                  <th className="py-3.5 px-4">Authorized Sites / Geofences</th>
                  <th className="py-3.5 px-4">Device Binding</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredEmployees.map((emp) => {
                  const isSelected = selectedEmployeeIds.includes(emp.id)
                  const boundDevice = devices.find((d) => d.employee_id === emp.id && d.is_active)
                  
                  // Project mapping
                  const empProjAssign = projectAssignments.find((a) => a.employee_id === emp.id && a.is_active)
                  const assignedProj = empProjAssign ? projects.find((p) => p.id === empProjAssign.project_id) : null

                  // Geofences mapping
                  const empGeoAssigns = geofenceAssignments.filter((ga) => ga.employee_id === emp.id && ga.is_active)
                  let authorizedSites: Geofence[] = []

                  if (empGeoAssigns.length > 0) {
                    authorizedSites = geofences.filter((g) =>
                      empGeoAssigns.some((ga) => ga.geofence_id === g.id) && g.is_active
                    )
                  } else if (assignedProj) {
                    // Fallback to project active geofences for backward compatibility
                    authorizedSites = geofences.filter((g) => g.project_id === assignedProj.id && g.is_active)
                  }

                  return (
                    <tr
                      key={emp.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isSelected ? 'bg-indigo-50/40' : ''
                      }`}
                    >
                      <td className="py-4 px-3 sm:px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectEmployee(emp.id)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>

                      <td className="py-4 px-4 font-semibold text-slate-900">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 font-bold text-xs">
                            {emp.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="block font-bold">{emp.full_name}</span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-[10px] text-slate-500">
                                {emp.employee_code || 'No Code'}
                              </span>
                              {emp.must_change_password && (
                                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 border border-amber-200">
                                  Temp Pass Pending
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4 font-mono text-[11px] text-slate-600">
                        {emp.email}
                      </td>

                      <td className="py-4 px-4">
                        {assignedProj ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700 border border-sky-200">
                            <Building2 className="h-3 w-3" />
                            <span>{assignedProj.name}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Unassigned</span>
                        )}
                      </td>

                      <td className="py-4 px-4">
                        {authorizedSites.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {authorizedSites.map((site) => (
                              <span
                                key={site.id}
                                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 border border-slate-200"
                              >
                                <MapPin className="h-2.5 w-2.5 text-indigo-500" />
                                <span>{site.name}</span>
                                <span className="text-slate-400 font-mono text-[9px]">({site.radius_meters}m)</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-amber-600 text-[11px] font-medium">No Sites Configured</span>
                        )}
                      </td>

                      <td className="py-4 px-4">
                        {boundDevice ? (
                          <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
                            <Smartphone className="h-4 w-4 text-emerald-600" />
                            <span>Linked ({boundDevice.device_name || 'Bound Device'})</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">No Device Linked</span>
                        )}
                      </td>

                      <td className="py-4 px-4">
                        <StatusBadge status={emp.is_active} />
                      </td>

                      <td className="py-4 px-4 sm:px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenManageSites(emp)}
                            className="rounded-lg p-1.5 text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                            title="Manage Authorized Sites / Geofences"
                          >
                            <MapPin className="h-4 w-4" />
                          </button>

                          {boundDevice && (
                            <button
                              onClick={() => handleOpenUnbind(emp)}
                              className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                              title="Unbind Device"
                            >
                              <SmartphoneNfc className="h-4 w-4" />
                            </button>
                          )}

                          <button
                            onClick={() => handleOpenToggleStatus(emp)}
                            className={`rounded-lg p-1.5 transition-colors cursor-pointer ${
                              emp.is_active
                                ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600'
                                : 'text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700'
                            }`}
                            title={emp.is_active ? 'Deactivate Account' : 'Activate Account'}
                          >
                            <Power className="h-4 w-4" />
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
      {/* 1. ADD EMPLOYEE MODAL (WITH PROJECT & MULTIPLE GEOFENCES) */}
      {/* ========================================================= */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Employee"
        description="Register a new employee, assign to a project, and authorize physical site boundaries."
      >
        <form onSubmit={handleAddEmployeeSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Full Name *
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                required
                placeholder="e.g. Rahul Sharma"
                value={addFormData.full_name}
                onChange={(e) => setAddFormData({ ...addFormData, full_name: e.target.value })}
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2 pl-9 pr-3 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Email Address (Compulsory) *
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                required
                placeholder="e.g. rahul@milestoneconsultancy.in"
                value={addFormData.email}
                onChange={(e) => setAddFormData({ ...addFormData, email: e.target.value })}
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2 pl-9 pr-3 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Employee / Staff Code *
              </label>
              <div className="relative">
                <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  placeholder="e.g. EMP001"
                  value={addFormData.employee_code}
                  onChange={(e) => setAddFormData({ ...addFormData, employee_code: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2 pl-9 pr-3 text-xs font-mono uppercase text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Phone Number (Optional)
              </label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="tel"
                  placeholder="e.g. +91 98765 43210"
                  value={addFormData.phone}
                  onChange={(e) => setAddFormData({ ...addFormData, phone: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2 pl-9 pr-3 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Project Dropdown */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Assigned Project *
            </label>
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                required
                value={addFormData.project_id}
                onChange={(e) => handleAddProjectChange(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2 pl-9 pr-3 text-xs font-medium text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
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
          </div>

          {/* Multi-Select Sites / Geofences */}
          {addFormData.project_id && (
            <div className="space-y-2 rounded-xl bg-slate-50 p-3.5 border border-slate-200">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Authorized Sites / Geofences *
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const allProjectSites = geofences.filter((g) => g.project_id === addFormData.project_id).map((g) => g.id)
                      setAddFormData((prev) => ({ ...prev, geofence_ids: allProjectSites }))
                    }}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={() => setAddFormData((prev) => ({ ...prev, geofence_ids: [] }))}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-700"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {geofences.filter((g) => g.project_id === addFormData.project_id).length === 0 ? (
                <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                  No active sites configured for this project. Please create a site under Sites & Geofences first.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {geofences
                    .filter((g) => g.project_id === addFormData.project_id)
                    .map((geo) => {
                      const isChecked = addFormData.geofence_ids.includes(geo.id)
                      return (
                        <label
                          key={geo.id}
                          className={`flex items-center justify-between rounded-lg p-2 text-xs border transition-colors cursor-pointer ${
                            isChecked
                              ? 'bg-indigo-50/80 border-indigo-200 text-indigo-950 font-medium'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleAddGeofence(geo.id)}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
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

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingEmployee}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isSubmittingEmployee ? 'Creating Account & Authorizing Sites...' : 'Create Employee Profile'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================= */}
      {/* 2. SINGLE EMPLOYEE "MANAGE SITES" MODAL                   */}
      {/* ========================================================= */}
      <Modal
        isOpen={isManageSitesModalOpen}
        onClose={() => {
          setIsManageSitesModalOpen(false)
          setManagingEmployee(null)
        }}
        title={`Manage Authorized Sites — ${managingEmployee?.full_name || 'Employee'}`}
        description="Select project and authorized physical sites where this employee is permitted to log attendance."
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Assigned Project
            </label>
            <select
              value={manageProjectId}
              onChange={(e) => {
                const newProjId = e.target.value
                setManageProjectId(newProjId)
                const newSites = geofences.filter((g) => g.project_id === newProjId).map((g) => g.id)
                setManageGeofenceIds(newSites)
              }}
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2 px-3 text-xs font-medium text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
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
                Authorized Sites ({manageGeofenceIds.length} Selected)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const allSites = geofences.filter((g) => g.project_id === manageProjectId).map((g) => g.id)
                    setManageGeofenceIds(allSites)
                  }}
                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  Select All
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={() => setManageGeofenceIds([])}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-700"
                >
                  Clear All
                </button>
              </div>
            </div>

            {geofences.filter((g) => g.project_id === manageProjectId).length === 0 ? (
              <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                No active sites found for this project.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {geofences
                  .filter((g) => g.project_id === manageProjectId)
                  .map((geo) => {
                    const isChecked = manageGeofenceIds.includes(geo.id)
                    return (
                      <label
                        key={geo.id}
                        className={`flex items-center justify-between rounded-lg p-2 text-xs border transition-colors cursor-pointer ${
                          isChecked
                            ? 'bg-indigo-50/80 border-indigo-200 text-indigo-950 font-medium'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setManageGeofenceIds((prev) =>
                                isChecked ? prev.filter((id) => id !== geo.id) : [...prev, geo.id]
                              )
                            }}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
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
              onClick={() => {
                setIsManageSitesModalOpen(false)
                setManagingEmployee(null)
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveManageSites}
              disabled={isSavingSites}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isSavingSites ? 'Saving Authorized Sites...' : 'Save Authorized Sites'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ========================================================= */}
      {/* 3. BULK ASSIGN SITES MODAL                                */}
      {/* ========================================================= */}
      <Modal
        isOpen={isBulkAssignModalOpen}
        onClose={() => setIsBulkAssignModalOpen(false)}
        title={`Bulk Assign Sites (${selectedEmployeeIds.length} Employees)`}
        description="Select a project and authorized sites to assign in bulk to all selected staff members."
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
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2 px-3 text-xs font-medium text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
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
                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
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
                            ? 'bg-indigo-50/80 border-indigo-200 text-indigo-950 font-medium'
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
                            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
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
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isProcessingBulkAssign
                ? 'Assigning Sites...'
                : `Assign Selected Sites to ${selectedEmployeeIds.length} Employees`}
            </button>
          </div>
        </div>
      </Modal>

      {/* ========================================================= */}
      {/* 4. BULK REMOVE SITES MODAL                                */}
      {/* ========================================================= */}
      <Modal
        isOpen={isBulkRemoveModalOpen}
        onClose={() => setIsBulkRemoveModalOpen(false)}
        title={`Bulk Remove Sites (${selectedEmployeeIds.length} Employees)`}
        description="Select sites to revoke authorization from all selected staff members."
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
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2 px-3 text-xs font-medium text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none"
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
                ? 'Removing Sites...'
                : `Remove Selected Sites from ${selectedEmployeeIds.length} Employees`}
            </button>
          </div>
        </div>
      </Modal>

      {/* ========================================================= */}
      {/* 5. CONFIRM ACTION DIALOG (UNBIND / TOGGLE STATUS)         */}
      {/* ========================================================= */}
      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirmAction}
        isLoading={isProcessing}
        title={actionType === 'unbind' ? 'Unbind Employee Device' : selectedEmp?.is_active ? 'Deactivate Employee' : 'Activate Employee'}
        message={
          actionType === 'unbind'
            ? `Are you sure you want to unbind the active device for ${selectedEmp?.full_name}? The employee will be able to bind a new device on their next login.`
            : `Are you sure you want to ${selectedEmp?.is_active ? 'deactivate' : 'activate'} the account for ${selectedEmp?.full_name}?`
        }
        confirmText={actionType === 'unbind' ? 'Unbind Device' : selectedEmp?.is_active ? 'Deactivate' : 'Activate'}
        isDestructive={actionType === 'unbind' || Boolean(selectedEmp?.is_active)}
      />
    </div>
  )
}
