import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { logAuditEvent } from '../../lib/auditService'
import type { Geofence, Project } from '../../types/database.types'
import { Modal } from '../../components/common/Modal'
import { ConfirmDialog } from '../../components/common/ConfirmDialog'
import { StatusBadge } from '../../components/common/StatusBadge'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { GeofenceMap } from '../../components/map/GeofenceMap'
import {
  MapPin,
  Plus,
  Search,
  Edit2,
  Power,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Navigation,
  Eye
} from 'lucide-react'

interface GeofenceWithProject extends Geofence {
  project?: Project | null
}

export const AdminGeofencesPage: React.FC = () => {
  const { user } = useAuth()

  const [geofences, setGeofences] = useState<GeofenceWithProject[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  // Selected Geofence for Map Preview
  const [selectedGeofence, setSelectedGeofence] = useState<GeofenceWithProject | null>(null)

  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingGeofence, setEditingGeofence] = useState<GeofenceWithProject | null>(null)
  const [formData, setFormData] = useState({
    project_id: '',
    name: '',
    latitude: 18.5204, // Default Pune
    longitude: 73.8567,
    radius_meters: 150, // default 150m
    is_active: true
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Confirm Dialog State (Deactivation / Activation)
  const [confirmGeofence, setConfirmGeofence] = useState<GeofenceWithProject | null>(null)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setErrorMsg(null)
    try {
      // 1. Fetch Geofences with project relation
      const { data: geofencesData, error: geoError } = await supabase
        .from('geofences')
        .select('*, project:projects(*)')
        .order('created_at', { ascending: false })

      if (geoError) throw geoError

      // 2. Fetch Projects for dropdown
      const { data: projectsData, error: projError } = await supabase
        .from('projects')
        .select('*')
        .order('name', { ascending: true })

      if (projError) throw projError

      const formattedGeofences = (geofencesData || []) as GeofenceWithProject[]
      setGeofences(formattedGeofences)
      setProjects(projectsData || [])

      // Set initial preview geofence if none selected
      if (!selectedGeofence && formattedGeofences.length > 0) {
        setSelectedGeofence(formattedGeofences[0])
      }
    } catch (err) {
      console.error('[Geofences] Error fetching geofence data:', err)
      setErrorMsg((err as Error).message || 'Failed to load geofences from Supabase.')
    } finally {
      setIsLoading(false)
    }
  }, [selectedGeofence])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Open modal for Create
  const handleOpenCreateModal = () => {
    setEditingGeofence(null)
    const firstActiveProject = projects.find((p) => p.is_active)
    setFormData({
      project_id: firstActiveProject ? firstActiveProject.id : '',
      name: firstActiveProject ? `${firstActiveProject.name} Geofence` : '',
      latitude: 18.5204,
      longitude: 73.8567,
      radius_meters: 150,
      is_active: true
    })
    setIsModalOpen(true)
  }

  // Open modal for Edit
  const handleOpenEditModal = (geo: GeofenceWithProject) => {
    setEditingGeofence(geo)
    setFormData({
      project_id: geo.project_id,
      name: geo.name || (geo.project?.name ? `${geo.project.name} Geofence` : 'Site Geofence'),
      latitude: geo.latitude,
      longitude: geo.longitude,
      radius_meters: geo.radius_meters,
      is_active: geo.is_active
    })
    setIsModalOpen(true)
  }

  // Handle Form Submit (Create / Edit)
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.project_id) {
      setErrorMsg('Please select a project/site for this geofence.')
      return
    }
    if (!formData.latitude || !formData.longitude || formData.radius_meters <= 0) {
      setErrorMsg('Please provide valid latitude, longitude, and positive radius.')
      return
    }

    setIsSubmitting(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const fallbackName = projects.find((p) => p.id === formData.project_id)?.name
        ? `${projects.find((p) => p.id === formData.project_id)!.name} Geofence`
        : 'Site Geofence'
      const geofenceName = formData.name.trim() || fallbackName

      if (editingGeofence) {
        // UPDATE GEOFENCE
        const { error } = await supabase
          .from('geofences')
          .update({
            project_id: formData.project_id,
            name: geofenceName,
            latitude: formData.latitude,
            longitude: formData.longitude,
            radius_meters: formData.radius_meters,
            is_active: formData.is_active,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingGeofence.id)

        if (error) throw error

        await logAuditEvent({
          actorId: user?.id,
          action: 'GEOFENCE_EDIT',
          entityType: 'geofences',
          entityId: editingGeofence.id,
          oldData: {
            name: editingGeofence.name,
            latitude: editingGeofence.latitude,
            longitude: editingGeofence.longitude,
            radius_meters: editingGeofence.radius_meters,
            is_active: editingGeofence.is_active
          },
          newData: { ...formData, name: geofenceName },
          remark: `Updated geofence "${geofenceName}"`
        })

        setSuccessMsg('Geofence boundary updated successfully.')
      } else {
        // CREATE GEOFENCE
        const { data, error } = await supabase
          .from('geofences')
          .insert({
            project_id: formData.project_id,
            name: geofenceName,
            latitude: formData.latitude,
            longitude: formData.longitude,
            radius_meters: formData.radius_meters,
            is_active: formData.is_active
          })
          .select()
          .single()

        if (error) throw error

        await logAuditEvent({
          actorId: user?.id,
          action: 'GEOFENCE_CREATE',
          entityType: 'geofences',
          entityId: data?.id,
          newData: { ...formData, name: geofenceName },
          remark: `Created geofence "${geofenceName}"`
        })

        setSuccessMsg('Geofence boundary created successfully.')
      }

      setIsModalOpen(false)
      await fetchData()
    } catch (err) {
      console.error('[Geofences] Error saving geofence:', err)
      setErrorMsg((err as Error).message || 'Failed to save geofence.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Status Toggle (Activate / Deactivate)
  const handleToggleStatus = (geo: GeofenceWithProject) => {
    setConfirmGeofence(geo)
    setIsConfirmOpen(true)
  }

  const handleConfirmToggleStatus = async () => {
    if (!confirmGeofence) return
    setIsUpdatingStatus(true)
    const newStatus = !confirmGeofence.is_active

    try {
      const { error } = await supabase
        .from('geofences')
        .update({
          is_active: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', confirmGeofence.id)

      if (error) throw error

      await logAuditEvent({
        actorId: user?.id,
        action: newStatus ? 'GEOFENCE_ACTIVATE' : 'GEOFENCE_DEACTIVATE',
        entityType: 'geofences',
        entityId: confirmGeofence.id,
        oldData: { is_active: confirmGeofence.is_active },
        newData: { is_active: newStatus },
        remark: `Geofence "${confirmGeofence.name || 'Site'}" ${newStatus ? 'activated' : 'deactivated'}`
      })

      setSuccessMsg(
        `Geofence for "${confirmGeofence.project?.name || 'Site'}" ${
          newStatus ? 'activated' : 'deactivated'
        } successfully.`
      )
      setIsConfirmOpen(false)
      setConfirmGeofence(null)
      await fetchData()
    } catch (err) {
      console.error('[Geofences] Status toggle error:', err)
      setErrorMsg((err as Error).message || 'Failed to update geofence status.')
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  // Filtered List
  const filteredGeofences = geofences.filter((geo) => {
    const projectName = geo.project?.name || ''
    const matchesSearch =
      projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (geo.project?.code && geo.project.code.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'active'
        ? geo.is_active
        : !geo.is_active
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-white p-6 border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-sky-50 p-2 text-sky-600">
              <MapPin className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Geofences & Site Boundaries</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Define GPS coordinates and radius boundaries to strictly enforce on-site attendance.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          disabled={projects.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50 transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>New Geofence Boundary</span>
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

      {/* Main Grid: Interactive Map Preview + Geofences List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Map Preview of selected geofence */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Navigation className="h-4 w-4 text-sky-600" />
                Live Map Boundary Preview
              </span>
              {selectedGeofence && (
                <span className="text-[11px] font-semibold text-slate-500">
                  Radius: <b className="text-slate-800">{selectedGeofence.radius_meters}m</b>
                </span>
              )}
            </div>

            {selectedGeofence ? (
              <div className="space-y-3">
                <GeofenceMap
                  latitude={selectedGeofence.latitude}
                  longitude={selectedGeofence.longitude}
                  radius_meters={selectedGeofence.radius_meters}
                  siteName={selectedGeofence.project?.name || 'Selected Site'}
                  height="280px"
                />
                <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 text-xs">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-slate-500 font-medium">Associated Site:</span>
                    <span className="font-bold text-slate-900">
                      {selectedGeofence.project?.name || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-slate-600">
                    <span>Coordinates:</span>
                    <span className="font-mono">
                      {selectedGeofence.latitude.toFixed(5)}, {selectedGeofence.longitude.toFixed(5)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center rounded-xl bg-slate-50 text-center text-xs text-slate-400">
                <MapPin className="h-8 w-8 text-slate-300 mb-2" />
                <span>Select a geofence below to preview its boundary on the map</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Geofences Table & Controls */}
        <div className="lg:col-span-7 space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3 rounded-2xl bg-white p-4 border border-slate-200 shadow-xs">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by project name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                className="rounded-xl border border-slate-200 bg-slate-50/50 py-2 px-3 text-xs font-medium text-slate-700 focus:border-sky-500 focus:bg-white focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
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

          {/* List / Table */}
          {isLoading ? (
            <LoadingSpinner message="Loading geofence boundaries..." />
          ) : errorMsg && geofences.length === 0 ? (
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
          ) : filteredGeofences.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <MapPin className="h-10 w-10 text-slate-400 mb-3" />
              <h3 className="text-sm font-bold text-slate-800">No Geofences Configured</h3>
              <p className="mt-1 text-xs text-slate-500 max-w-sm">
                Geofences restrict attendance to designated site coordinates. Click "+ New Geofence
                Boundary" to set up your first boundary.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="py-3 px-4">Project / Site</th>
                      <th className="py-3 px-3">Radius</th>
                      <th className="py-3 px-3">Coordinates</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredGeofences.map((geo) => (
                      <tr
                        key={geo.id}
                        onClick={() => setSelectedGeofence(geo)}
                        className={`cursor-pointer transition-colors ${
                          selectedGeofence?.id === geo.id
                            ? 'bg-sky-50/60 font-medium text-slate-900'
                            : 'hover:bg-slate-50/60'
                        }`}
                      >
                        <td className="py-3.5 px-4 font-semibold text-slate-900">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-sky-600 shrink-0" />
                            <span>{geo.project?.name || 'Unnamed Site'}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                            {geo.radius_meters}m
                          </span>
                        </td>
                        <td className="py-3.5 px-3 font-mono text-[11px] text-slate-500">
                          {geo.latitude.toFixed(4)}, {geo.longitude.toFixed(4)}
                        </td>
                        <td className="py-3.5 px-3">
                          <StatusBadge status={geo.is_active} />
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div
                            className="flex items-center justify-end gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => setSelectedGeofence(geo)}
                              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-sky-600"
                              title="Preview on map"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleOpenEditModal(geo)}
                              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-sky-600"
                              title="Edit Geofence"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleToggleStatus(geo)}
                              className={`rounded-lg p-1 transition-colors ${
                                geo.is_active
                                  ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600'
                                  : 'text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700'
                              }`}
                              title={geo.is_active ? 'Deactivate Geofence' : 'Activate Geofence'}
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
        </div>
      </div>

      {/* CREATE / EDIT GEOFENCE MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        maxWidth="lg"
        title={editingGeofence ? 'Edit Geofence Boundary' : 'Create New Geofence Boundary'}
        description="Set the project location coordinates and geofence radius on the interactive map."
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Select Project / Site *
            </label>
            <select
              required
              value={formData.project_id}
              onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2.5 px-3.5 text-xs text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
            >
              <option value="" disabled>
                -- Choose Project --
              </option>
              {projects.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.name} {proj.code ? `(${proj.code})` : ''} {proj.is_active ? '' : '[Inactive]'}
                </option>
              ))}
            </select>
          </div>

          {/* Interactive Leaflet Map picker */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Pin Site Location on Map (Click or Drag Marker)
            </label>
            <GeofenceMap
              latitude={formData.latitude}
              longitude={formData.longitude}
              radius_meters={formData.radius_meters}
              interactive={true}
              onLocationChange={(lat, lng) => {
                setFormData((prev) => ({
                  ...prev,
                  latitude: parseFloat(lat.toFixed(6)),
                  longitude: parseFloat(lng.toFixed(6))
                }))
              }}
              height="240px"
              siteName={projects.find((p) => p.id === formData.project_id)?.name || 'New Site'}
            />
          </div>

          {/* Coordinates & Radius Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Latitude
              </label>
              <input
                type="number"
                step="any"
                required
                value={formData.latitude}
                onChange={(e) =>
                  setFormData({ ...formData, latitude: parseFloat(e.target.value) || 0 })
                }
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2 px-3 text-xs font-mono text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Longitude
              </label>
              <input
                type="number"
                step="any"
                required
                value={formData.longitude}
                onChange={(e) =>
                  setFormData({ ...formData, longitude: parseFloat(e.target.value) || 0 })
                }
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2 px-3 text-xs font-mono text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Radius (Meters)
              </label>
              <input
                type="number"
                min="20"
                max="5000"
                step="10"
                required
                value={formData.radius_meters}
                onChange={(e) =>
                  setFormData({ ...formData, radius_meters: parseInt(e.target.value, 10) || 100 })
                }
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 py-2 px-3 text-xs font-mono text-slate-900 focus:border-sky-500 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="geo_is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <label htmlFor="geo_is_active" className="text-xs font-medium text-slate-700 cursor-pointer">
              Geofence boundary is currently active for attendance enforcement
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
                : editingGeofence
                ? 'Update Geofence'
                : 'Create Geofence'}
            </button>
          </div>
        </form>
      </Modal>

      {/* CONFIRM TOGGLE STATUS DIALOG */}
      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirmToggleStatus}
        isLoading={isUpdatingStatus}
        title={confirmGeofence?.is_active ? 'Deactivate Geofence' : 'Activate Geofence'}
        message={
          confirmGeofence?.is_active
            ? `Are you sure you want to deactivate the geofence boundary for "${confirmGeofence?.project?.name || 'this site'}"?`
            : `Are you sure you want to activate the geofence boundary for "${confirmGeofence?.project?.name || 'this site'}"?`
        }
        confirmText={confirmGeofence?.is_active ? 'Deactivate' : 'Activate'}
        isDestructive={Boolean(confirmGeofence?.is_active)}
      />
    </div>
  )
}

