/**
 * Geolocation & Geofence Utility Functions
 * Uses the Haversine formula to calculate accurate geodesic distance in meters.
 */

export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000 // Earth radius in meters
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function isWithinGeofence(
  userLat: number,
  userLon: number,
  geofenceLat: number,
  geofenceLon: number,
  radiusMeters: number
): { isInside: boolean; distanceMeters: number } {
  const distance = calculateHaversineDistance(userLat, userLon, geofenceLat, geofenceLon)
  return {
    isInside: distance <= radiusMeters,
    distanceMeters: Math.round(distance)
  }
}

export function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)}m`
  }
  return `${(distanceMeters / 1000).toFixed(2)}km`
}

