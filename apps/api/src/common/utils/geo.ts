/**
 * Geolocation utility functions — pure, no side effects.
 * Used for geofence validation during check-in/check-out.
 */

const EARTH_RADIUS_METERS = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Haversine formula — great-circle distance between two points on Earth.
 * @returns distance in meters
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface Geofence {
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
}

/**
 * Check if a point is inside a circular geofence.
 */
export function isInsideGeofence(point: GeoPoint, geofence: Geofence): boolean {
  const distance = haversineDistance(
    point.latitude,
    point.longitude,
    geofence.centerLat,
    geofence.centerLng,
  );
  return distance <= geofence.radiusMeters;
}

/**
 * Calculate distance from point to nearest geofence center.
 * @returns distance in meters
 */
export function distanceToGeofence(point: GeoPoint, geofence: Geofence): number {
  return haversineDistance(
    point.latitude,
    point.longitude,
    geofence.centerLat,
    geofence.centerLng,
  );
}
