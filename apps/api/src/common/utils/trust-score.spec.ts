import { calculateTrustScore, type TrustScoreInput } from './trust-score';

describe('calculateTrustScore', () => {
  const baseInput: TrustScoreInput = {
    gpsValid: false,
    accuracyMeters: null,
    bssidMatch: false,
    ssidOnlyMatch: false,
    deviceTrusted: false,
    isNewDevice: false,
    isMockLocation: false,
  };

  it('should return 0 when nothing valid', () => {
    const result = calculateTrustScore(baseInput);
    expect(result.score).toBe(0);
    expect(result.method).toBe('none');
    expect(result.trustLevel).toBe('suspicious');
  });

  it('should score GPS + high accuracy at 40', () => {
    const result = calculateTrustScore({ ...baseInput, gpsValid: true, accuracyMeters: 10 });
    expect(result.score).toBe(40);
    expect(result.method).toBe('gps');
  });

  it('should score GPS + medium accuracy at 25', () => {
    const result = calculateTrustScore({ ...baseInput, gpsValid: true, accuracyMeters: 50 });
    expect(result.score).toBe(25);
  });

  it('should score BSSID match at 35', () => {
    const result = calculateTrustScore({ ...baseInput, bssidMatch: true });
    expect(result.score).toBe(35);
    expect(result.method).toBe('wifi');
  });

  it('should score SSID-only at 15', () => {
    const result = calculateTrustScore({ ...baseInput, ssidOnlyMatch: true });
    expect(result.score).toBe(15);
    expect(result.flags).toContain('ssid_only_match');
  });

  it('should give gps_wifi when both valid', () => {
    const result = calculateTrustScore({
      ...baseInput,
      gpsValid: true,
      accuracyMeters: 10,
      bssidMatch: true,
    });
    expect(result.score).toBe(75); // 40 + 35
    expect(result.method).toBe('gps_wifi');
    expect(result.trustLevel).toBe('trusted');
  });

  it('should add device trust bonus', () => {
    const result = calculateTrustScore({
      ...baseInput,
      gpsValid: true,
      accuracyMeters: 10,
      bssidMatch: true,
      deviceTrusted: true,
    });
    expect(result.score).toBe(90); // 40 + 35 + 15
  });

  it('should subtract for new device', () => {
    const result = calculateTrustScore({
      ...baseInput,
      gpsValid: true,
      accuracyMeters: 10,
      isNewDevice: true,
    });
    expect(result.score).toBe(30); // 40 - 10
    expect(result.flags).toContain('device_untrusted');
  });

  it('should heavily penalize mock location', () => {
    const result = calculateTrustScore({
      ...baseInput,
      gpsValid: true,
      accuracyMeters: 10,
      bssidMatch: true,
      isMockLocation: true,
    });
    expect(result.score).toBe(25); // 40 + 35 - 50
    expect(result.flags).toContain('mock_location_detected');
  });

  it('should penalize poor accuracy', () => {
    const result = calculateTrustScore({
      ...baseInput,
      gpsValid: true,
      accuracyMeters: 200,
    });
    // GPS valid but accuracy > 100: no GPS accuracy bonus, -15 for poor accuracy
    expect(result.score).toBe(0); // 0 (no accuracy tier matched) - 15 = -15, clamped to 0
    expect(result.flags).toContain('accuracy_poor');
  });

  it('should clamp score to 0-100', () => {
    const result = calculateTrustScore({
      ...baseInput,
      gpsValid: true,
      accuracyMeters: 10,
      bssidMatch: true,
      deviceTrusted: true,
    });
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('should return review level for mid-range scores', () => {
    const result = calculateTrustScore({
      ...baseInput,
      gpsValid: true,
      accuracyMeters: 50,
      deviceTrusted: true,
    });
    expect(result.score).toBe(40); // 25 + 15
    expect(result.trustLevel).toBe('review');
  });
});
