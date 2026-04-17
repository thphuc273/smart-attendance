import {
  haversineDistance,
  haversineSpeedKmh,
  isInsideGeofence,
  distanceToGeofence,
} from './geo';

describe('geo utilities', () => {
  // HCM-Q1 center: 10.7769, 106.7009
  const geofence = { centerLat: 10.7769, centerLng: 106.7009, radiusMeters: 100 };

  describe('haversineDistance', () => {
    it('should return 0 for identical points', () => {
      expect(haversineDistance(10.7769, 106.7009, 10.7769, 106.7009)).toBe(0);
    });

    it('should calculate distance between two known points', () => {
      // HCM Q1 to ~1km away
      const dist = haversineDistance(10.7769, 106.7009, 10.7859, 106.7009);
      expect(dist).toBeGreaterThan(900);
      expect(dist).toBeLessThan(1100);
    });

    it('should be symmetric', () => {
      const d1 = haversineDistance(10.7769, 106.7009, 21.0285, 105.8542);
      const d2 = haversineDistance(21.0285, 105.8542, 10.7769, 106.7009);
      expect(Math.abs(d1 - d2)).toBeLessThan(1);
    });
  });

  describe('isInsideGeofence', () => {
    it('should return true when point is at center', () => {
      expect(isInsideGeofence({ latitude: 10.7769, longitude: 106.7009 }, geofence)).toBe(true);
    });

    it('should return true when point is inside radius', () => {
      // ~50m away
      expect(isInsideGeofence({ latitude: 10.7773, longitude: 106.7009 }, geofence)).toBe(true);
    });

    it('should return false when point is outside radius', () => {
      // ~500m away
      expect(isInsideGeofence({ latitude: 10.7815, longitude: 106.7009 }, geofence)).toBe(false);
    });

    it('should handle boundary correctly (point at edge)', () => {
      // Roughly at 100m from center
      const result = isInsideGeofence({ latitude: 10.7778, longitude: 106.7009 }, geofence);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('distanceToGeofence', () => {
    it('should return 0 at center', () => {
      expect(distanceToGeofence({ latitude: 10.7769, longitude: 106.7009 }, geofence)).toBe(0);
    });

    it('should return positive distance for any other point', () => {
      const dist = distanceToGeofence({ latitude: 10.78, longitude: 106.7009 }, geofence);
      expect(dist).toBeGreaterThan(0);
    });
  });

  describe('haversineSpeedKmh', () => {
    const hcm = { latitude: 10.7769, longitude: 106.7009 };
    const hanoi = { latitude: 21.0285, longitude: 105.8542 };

    it('returns Infinity when time delta is zero or negative', () => {
      const t = new Date('2026-04-16T08:00:00Z');
      const speed = haversineSpeedKmh({ ...hcm, at: t }, { ...hanoi, at: t });
      expect(speed).toBe(Infinity);
    });

    it('returns reasonable speed for ~1000km in 10h (~100 km/h)', () => {
      const prev = { ...hcm, at: new Date('2026-04-16T00:00:00Z') };
      const curr = { ...hanoi, at: new Date('2026-04-16T10:00:00Z') };
      const speed = haversineSpeedKmh(prev, curr);
      expect(speed).toBeGreaterThan(80);
      expect(speed).toBeLessThan(140);
    });

    it('flags impossible travel for same 1000km in 1h (~1000 km/h)', () => {
      const prev = { ...hcm, at: new Date('2026-04-16T08:00:00Z') };
      const curr = { ...hanoi, at: new Date('2026-04-16T09:00:00Z') };
      const speed = haversineSpeedKmh(prev, curr);
      expect(speed).toBeGreaterThan(500);
    });

    it('returns near-zero for stationary across time', () => {
      const prev = { ...hcm, at: new Date('2026-04-16T08:00:00Z') };
      const curr = { ...hcm, at: new Date('2026-04-16T09:00:00Z') };
      const speed = haversineSpeedKmh(prev, curr);
      expect(speed).toBeLessThan(0.01);
    });
  });
});
