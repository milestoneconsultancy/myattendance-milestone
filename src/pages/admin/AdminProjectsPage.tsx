import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { logAuditEvent } from '../../lib/auditService'
import type { Project } from '../../types/database.types'
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
  Clock
} from 'lucide-react'

export const AdminProjectsPage: React.FC = () => {
  const { user } = useAuth()

  const [projects, setProjects] = useState<Project[]>([])
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

  // Confirm Dialog State (Deactivation / Activation)
  const [confirmProject, setConfirmProject] = useState<Project | null>(null)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)

  const fetchProjects = useCallback(async () => {
    setIsLoading(true)
    setErrorMsg(null)
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('name', { ascending: true })

      if (error) {
        throw error
      }
      setProjects(data || [])
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
          targetEntity: 'projects',
          targetId: editingProject.id,
          details: {
            previous: { name: editingProject.name, code: editingProject.code },
            updated: formData
          }
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
          targetEntity: 'projects',
          targetId: data?.id,
          details: { name: formData.name.trim(), code: formData.code.trim() }
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
        targetEntity: 'projects',
        targetId: confirmProject.id,
        details: { name: confirmProject.name, new_status: newStatus }
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
                  <th className="py-3.5 px-4 sm:px-6">Project / Site Name</th>
                  <th className="py-3.5 px-4">Site Code</th>
                  <th className="py-3.5 px-4">Description</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Created Date</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredProjects.map((project) => (
                  <tr key={project.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-4 sm:px-6 font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                        <span>{project.name}</span>
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
                    <td className="py-4 px-4 text-slate-500 max-w-xs truncate">
                      {project.description || '—'}
                    </td>
                    <td className="py-4 px-4">
                      <StatusBadge status={project.is_active} />
                    </td>
                    <td className="py-4 px-4 text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        {new Date(project.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </div>
                    </td>
                    <td className="py-4 px-4 sm:px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
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
                          title={project.is_active ? 'Deactivate Site' : 'Activate Site'}
                        >
                          <Power className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE / EDIT PROJECT MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingProject ? 'Edit Project / Site' : 'Create New Project / Site'}
        description={
          editingProject
            ? 'Update project details and operational status.'
            : 'Register a new project or work site for Milestone Consultancy.'
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
              placeholder="e.g. Pune Metro Line 3 Site"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Site / Project Code
            </label>
            <input
              type="text"
              placeholder="e.g. MC-PUN-01"
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
              placeholder="Site location details, client contact, or project scope..."
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
              Site is currently active and accepting attendance
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
              {isSubmitting
                ? 'Saving...'
                : editingProject
                ? 'Update Project'
                : 'Create Project'}
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

