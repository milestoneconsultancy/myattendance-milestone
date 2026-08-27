import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix standard Leaflet icon paths in Vite bundlers
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
})
L.Marker.prototype.options.icon = DefaultIcon

interface GeofenceMapProps {
  latitude: number
  longitude: number
  radius?: number // in meters (legacy)
  radius_meters?: number // in meters (canonical production field)
  interactive?: boolean
  onLocationChange?: (lat: number, lng: number) => void
  onRadiusChange?: (radius: number) => void
  height?: string
  siteName?: string
}

export const GeofenceMap: React.FC<GeofenceMapProps> = ({
  latitude,
  longitude,
  radius,
  radius_meters,
  interactive = false,
  onLocationChange,
  height = '360px',
  siteName = 'Site Location'
}) => {
  const currentRadius = radius_meters ?? radius ?? 150
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const circleRef = useRef<L.Circle | null>(null)

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return

    const initialLat = latitude || 19.076 // Default Maharashtra / Mumbai
    const initialLng = longitude || 72.8777

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: 16,
      zoomControl: true
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map)

    // Add Marker
    const marker = L.marker([initialLat, initialLng], {
      draggable: interactive
    }).addTo(map)

    marker.bindPopup(`<b>${siteName}</b><br>Lat: ${initialLat.toFixed(5)}, Lon: ${initialLng.toFixed(5)}`)

    if (interactive && onLocationChange) {
      marker.on('dragend', (e) => {
        const markerPos = e.target.getLatLng()
        onLocationChange(markerPos.lat, markerPos.lng)
      })

      map.on('click', (e: L.LeafletMouseEvent) => {
        marker.setLatLng(e.latlng)
        circle?.setLatLng(e.latlng)
        onLocationChange(e.latlng.lat, e.latlng.lng)
      })
    }

    // Add Geofence Circle Overlay
    const circle = L.circle([initialLat, initialLng], {
      color: '#0284c7',
      fillColor: '#38bdf8',
      fillOpacity: 0.25,
      radius: currentRadius,
      weight: 2
    }).addTo(map)

    mapInstanceRef.current = map
    markerRef.current = marker
    circleRef.current = circle

    return () => {
      map.remove()
      mapInstanceRef.current = null
      markerRef.current = null
      circleRef.current = null
    }
  }, []) // Mount once

  // Update center & marker position when props change
  useEffect(() => {
    if (!mapInstanceRef.current || !markerRef.current || !circleRef.current) return
    if (latitude && longitude) {
      const newPos = L.latLng(latitude, longitude)
      markerRef.current.setLatLng(newPos)
      circleRef.current.setLatLng(newPos)
      mapInstanceRef.current.panTo(newPos)
      markerRef.current.setPopupContent(`<b>${siteName}</b><br>Lat: ${latitude.toFixed(5)}, Lon: ${longitude.toFixed(5)}`)
    }
  }, [latitude, longitude, siteName])

  // Update circle radius when radius prop changes
  useEffect(() => {
    if (circleRef.current && currentRadius) {
      circleRef.current.setRadius(currentRadius)
    }
  }, [currentRadius])

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 shadow-inner bg-slate-100">
      <div ref={mapContainerRef} style={{ height, width: '100%' }} className="z-10" />
      {interactive && (
        <div className="absolute bottom-3 left-3 z-20 rounded-xl bg-white/95 px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-md backdrop-blur-xs border border-slate-200">
          📍 Click map or drag marker to set site location
        </div>
      )}
    </div>
  )
}

