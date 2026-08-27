import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { logAuditEvent } from '../../lib/auditService'
import type { Project, Geofence, EmployeeProjectAssignment } from '../../types/database.types'
import { Modal } from '../../components/common/Modal'
import { ConfirmDialog } from '../../components/common/ConfirmDialog'
import { StatusBadge } from '../../components/common/StatusBadge'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import {
  Building2,
  Plus,
  Search,
  Edit2,
  Power,
  RefreshCw,
  FolderGit2,
  AlertCircle,
  CheckCircle2,
  MapPin,
  Users,
  Navigation,
  ArrowRight
} from 'lucide-react'

export const AdminProjectsPage: React.FC = () => {
  const { user } = useAuth()

  const [projects, setProjects] = useState<Project[]>([])
  const [geofences, setGeofences] = useState<Geofence[]>([])
  const [assignments, setAssignments] = useState<EmployeeProjectAssignment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    is_active: true
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // View Sites Modal State
  const [viewSitesProject, setViewSitesProject] = useState<Project | null>(null)
  const [isSitesModalOpen, setIsSitesModalOpen] = useState(false)

  // Confirm Dialog State (Deactivation / Activation)
  const [confirmProject, setConfirmProject] = useState<Project | null>(null)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)

  const fetchProjects = useCallback(async () => {
    setIsLoading(true)
    setErrorMsg(null)
    try {
      // 1. Fetch Projects
      const { data: projData, error: projErr } = await supabase
        .from('projects')
        .select('*')
        .order('name', { ascending: true })

      if (projErr) throw projErr
      setProjects(projData || [])

      // 2. Fetch Geofences / Sites
      const { data: geoData, error: geoErr } = await supabase
        .from('geofences')
        .select('*')

      if (geoErr) throw geoErr
      setGeofences(geoData || [])

      // 3. Fetch Assignments
      const { data: assignData, error: assignErr } = await supabase
        .from('employee_project_assignments')
        .select('*')

      if (assignErr) throw assignErr
      setAssignments(assignData || [])
    } catch (err) {
      console.error('[Projects] Error fetching projects:', err)
      setErrorMsg((err as Error).message || 'Failed to load projects from Supabase.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  // Open modal to view Sites under Project
  const handleOpenSitesModal = (project: Project) => {
    setViewSitesProject(project)
    setIsSitesModalOpen(true)
  }

  // Open modal for Create
  const handleOpenCreateModal = () => {
    setEditingProject(null)
    setFormData({
      name: '',
      code: '',
      description: '',
      is_active: true
    })
    setIsModalOpen(true)
  }

  // Open modal for Edit
  const handleOpenEditModal = (project: Project) => {
    setEditingProject(project)
    setFormData({
      name: project.name,
      code: project.code || '',
      description: project.description || '',
      is_active: project.is_active
    })
    setIsModalOpen(true)
  }

  // Handle Form Submit (Create / Edit)
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      setErrorMsg('Project / Site name is required.')
      return
    }

    setIsSubmitting(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      if (editingProject) {
        // UPDATE PROJECT
        const { error } = await supabase
          .from('projects')
          .update({
            name: formData.name.trim(),
            code: formData.code.trim() || null,
            description: formData.description.trim() || null,
            is_active: formData.is_active,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingProject.id)

        if (error) throw error

        await logAuditEvent({
          actorId: user?.id,
          action: 'PROJECT_EDIT',
          entityType: 'projects',
          entityId: editingProject.id,
          oldData: { name: editingProject.name, code: editingProject.code, is_active: editingProject.is_active },
          newData: formData,
          remark: `Updated project "${formData.name.trim()}"`
        })

        setSuccessMsg(`Project "${formData.name.trim()}" updated successfully.`)
      } else {
        // CREATE PROJECT
        const { data, error } = await supabase
          .from('projects')
          .insert({
            name: formData.name.trim(),
            code: formData.code.trim() || null,
            description: formData.description.trim() || null,
            is_active: formData.is_active
          })
          .select()
          .single()

        if (error) throw error

        await logAuditEvent({
          actorId: user?.id,
          action: 'PROJECT_CREATE',
          entityType: 'projects',
          entityId: data?.id,
          newData: formData,
          remark: `Created project "${formData.name.trim()}"`
        })

        setSuccessMsg(`Project "${formData.name.trim()}" created successfully.`)
      }

      setIsModalOpen(false)
      await fetchProjects()
    } catch (err) {
      console.error('[Projects] Error saving project:', err)
      setErrorMsg((err as Error).message || 'Failed to save project.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Status Toggle (Activate / Deactivate)
  const handleToggleStatus = (project: Project) => {
    setConfirmProject(project)
    setIsConfirmOpen(true)
  }

  const handleConfirmToggleStatus = async () => {
    if (!confirmProject) return
    setIsUpdatingStatus(true)
    const newStatus = !confirmProject.is_active

    try {
      const { error } = await supabase
        .from('projects')
        .update({
          is_active: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', confirmProject.id)

      if (error) throw error

      await logAuditEvent({
        actorId: user?.id,
        action: newStatus ? 'PROJECT_ACTIVATE' : 'PROJECT_DEACTIVATE',
        entityType: 'projects',
        entityId: confirmProject.id,
        oldData: { is_active: confirmProject.is_active },
        newData: { is_active: newStatus },
        remark: `Project "${confirmProject.name}" ${newStatus ? 'activated' : 'deactivated'}`
      })

      setSuccessMsg(
        `Project "${confirmProject.name}" ${newStatus ? 'activated' : 'deactivated'} successfully.`
      )
      setIsConfirmOpen(false)
      setConfirmProject(null)
      await fetchProjects()
    } catch (err) {
      console.error('[Projects] Status toggle error:', err)
      setErrorMsg((err as Error).message || 'Failed to update project status.')
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  // Filtered List
  const filteredProjects = projects.filter((proj) => {
    const matchesSearch =
      proj.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (proj.code && proj.code.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'active'
        ? proj.is_active
        : !proj.is_active
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-white p-6 border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-sky-50 p-2 text-sky-600">
              <Building2 className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Projects & Sites</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Manage company project locations, site codes, and active operational boundaries.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>New Project / Site</span>
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

      {/* Filters & Search Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 rounded-2xl bg-white p-4 border border-slate-200 shadow-xs">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by project name or site code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
            className="rounded-xl border border-slate-200 bg-slate-50/50 py-2 px-3 text-xs font-medium text-slate-700 focus:border-sky-500 focus:bg-white focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Sites</option>
            <option value="inactive">Inactive Sites</option>
          </select>

          <button
            onClick={fetchProjects}
            title="Refresh list"
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Table / Project Cards */}
      {isLoading ? (
        <LoadingSpinner message="Loading projects from database..." />
      ) : errorMsg && projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/50 p-12 text-center">
          <AlertCircle className="h-10 w-10 text-rose-500 mb-3" />
          <h3 className="text-sm font-bold text-rose-900">Database Query Error</h3>
          <p className="mt-1 text-xs text-rose-700 max-w-md font-mono">{errorMsg}</p>
          <p className="mt-2 text-[11px] text-rose-600">
            If this is a PostgreSQL permission error (42501), ensure the latest RLS migration is applied to Supabase.
          </p>
          <button
            onClick={fetchProjects}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Retry Query</span>
          </button>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <FolderGit2 className="h-10 w-10 text-slate-400 mb-3" />
          <h3 className="text-sm font-bold text-slate-800">No Projects Found</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm">
            {searchTerm || statusFilter !== 'all'
              ? 'No projects match your search or filter criteria.'
              : 'There are currently no projects configured. Click "+ New Project / Site" to add your first site.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6">Project Name</th>
                  <th className="py-3.5 px-4">Code</th>
                  <th className="py-3.5 px-4">Configured Sites</th>
                  <th className="py-3.5 px-4">Assigned Employees</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredProjects.map((project) => {
                  const projectSites = geofences.filter((g) => g.project_id === project.id)
                  const projectAssignments = assignments.filter((a) => a.project_id === project.id)
                  return (
                    <tr key={project.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-4 px-4 sm:px-6 font-semibold text-slate-900">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-sky-600 shrink-0" />
                          <div>
                            <span className="block font-bold">{project.name}</span>
                            {project.description && (
                              <span className="block text-[11px] font-normal text-slate-500 max-w-xs truncate">
                                {project.description}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        {project.code ? (
                          <span className="font-mono text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                            {project.code}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <button
                          onClick={() => handleOpenSitesModal(project)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 transition-colors cursor-pointer"
                          title="Click to view sites under this project"
                        >
                          <MapPin className="h-3.5 w-3.5 text-sky-600" />
                          <span>{projectSites.length} {projectSites.length === 1 ? 'Site' : 'Sites'}</span>
                        </button>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                          <Users className="h-3.5 w-3.5 text-slate-400" />
                          <span>{projectAssignments.length} {projectAssignments.length === 1 ? 'Staff' : 'Staff'}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <StatusBadge status={project.is_active} />
                      </td>
                      <td className="py-4 px-4 sm:px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenSitesModal(project)}
                            className="rounded-lg p-1.5 text-sky-600 hover:bg-sky-50 transition-colors cursor-pointer"
                            title="View Sites & Geofences"
                          >
                            <Navigation className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(project)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-sky-600 transition-colors cursor-pointer"
                            title="Edit Project"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(project)}
                            className={`rounded-lg p-1.5 transition-colors cursor-pointer ${
                              project.is_active
                                ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600'
                                : 'text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700'
                            }`}
                            title={project.is_active ? 'Deactivate Project' : 'Activate Project'}
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

      {/* VIEW SITES UNDER PROJECT MODAL */}
      <Modal
        isOpen={isSitesModalOpen}
        onClose={() => setIsSitesModalOpen(false)}
        maxWidth="lg"
        title={`Sites under ${viewSitesProject?.name || 'Project'}`}
        description="Physical location sites and geofence perimeters configured for this project."
      >
        <div className="space-y-4">
          {viewSitesProject && (
            <>
              {geofences.filter((g) => g.project_id === viewSitesProject.id).length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center bg-slate-50">
                  <MapPin className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">No Sites Configured Yet</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    This project has no active physical site locations or geofences.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden bg-white">
                  {geofences
                    .filter((g) => g.project_id === viewSitesProject.id)
                    .map((site) => (
                      <div key={site.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-sky-50 p-2 text-sky-600">
                            <MapPin className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-semibold text-xs text-slate-900">{site.name || 'Site Location'}</p>
                            <p className="text-[11px] font-mono text-slate-500">
                              Lat: {site.latitude.toFixed(5)}, Lon: {site.longitude.toFixed(5)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-semibold text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                            {site.radius_meters}m Radius
                          </span>
                          <StatusBadge status={site.is_active} />
                        </div>
                      </div>
                    ))}
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <Link
                  to="/admin/geofences"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-800"
                >
                  <span>Manage in Sites & Geofences</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>

                <button
                  type="button"
                  onClick={() => setIsSitesModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* CREATE / EDIT PROJECT MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingProject ? 'Edit Project' : 'Create New Project'}
        description={
          editingProject
            ? 'Update project details and operational status.'
            : 'Register a new project entity for Milestone Consultancy.'
        }
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Project Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Milestone Consultancy HQ"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Project Code
            </label>
            <input
              type="text"
              placeholder="e.g. MC-HQ-01"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 font-mono focus:border-sky-500 focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Description / Notes
            </label>
            <textarea
              rows={3}
              placeholder="Project scope, client details, or branch information..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <label htmlFor="is_active" className="text-xs font-medium text-slate-700 cursor-pointer">
              Project is currently active
            </label>
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
              {isSubmitting ? 'Saving...' : editingProject ? 'Update Project' : 'Create Project'}
            </button>
          </div>
        </form>
      </Modal>

      {/* CONFIRM DEACTIVATE / ACTIVATE DIALOG */}
      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirmToggleStatus}
        isLoading={isUpdatingStatus}
        title={confirmProject?.is_active ? 'Deactivate Project' : 'Activate Project'}
        message={
          confirmProject?.is_active
            ? `Are you sure you want to deactivate "${confirmProject?.name}"? Historical attendance records will be preserved, but employees will not be able to sign in to this site.`
            : `Are you sure you want to reactivate "${confirmProject?.name}"? Employees assigned to this site will be able to perform attendance.`
        }
        confirmText={confirmProject?.is_active ? 'Deactivate Site' : 'Activate Site'}
        isDestructive={Boolean(confirmProject?.is_active)}
      />
    </div>
  )
}

