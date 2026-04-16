/**
 * Trust Score calculator — pure function.
 * Based on spec §5.2 scoring rules (10 factors + auto-reject).
 *
 * Input signals → weighted score 0-100 + risk flags + validation method.
 */

export type ValidationMethod = 'gps' | 'wifi' | 'gps_wifi' | 'none';
export type TrustLevel = 'trusted' | 'review' | 'suspicious';

export interface TrustScoreInput {
  /** GPS within geofence? */
  gpsValid: boolean;
  /** GPS accuracy in meters (null if unavailable) */
  accuracyMeters: number | null;
  /** BSSID matches whitelist? */
  bssidMatch: boolean;
  /** SSID matches but BSSID doesn't? */
  ssidOnlyMatch: boolean;
  /** Device is_trusted flag */
  deviceTrusted: boolean;
  /** First time seeing this device? */
  isNewDevice: boolean;
  /** Client reports mock location flag */
  isMockLocation: boolean;
  /** Speed from previous event exceeds physically plausible threshold */
  impossibleTravel?: boolean;
  /** Request IP suggests VPN / datacenter / public proxy */
  vpnSuspected?: boolean;
}

export interface TrustScoreResult {
  score: number;
  flags: string[];
  method: ValidationMethod;
  trustLevel: TrustLevel;
}

export function calculateTrustScore(input: TrustScoreInput): TrustScoreResult {
  let score = 0;
  const flags: string[] = [];

  // ── GPS scoring ──
  if (input.gpsValid) {
    if (input.accuracyMeters !== null && input.accuracyMeters <= 20) {
      score += 40;
    } else if (input.accuracyMeters !== null && input.accuracyMeters <= 100) {
      score += 25;
    }
  }

  // ── WiFi scoring ──
  if (input.bssidMatch) {
    score += 35;
  } else if (input.ssidOnlyMatch) {
    score += 15;
    flags.push('ssid_only_match');
  }

  // ── Device trust ──
  if (input.deviceTrusted) {
    score += 15;
  }
  if (input.isNewDevice) {
    score -= 10;
    flags.push('device_untrusted');
  }

  // ── Risk penalties ──
  if (input.isMockLocation) {
    score -= 50;
    flags.push('mock_location_detected');
  }

  if (input.accuracyMeters !== null && input.accuracyMeters > 100) {
    score -= 15;
    flags.push('accuracy_poor');
  }

  if (input.impossibleTravel) {
    score -= 30;
    flags.push('impossible_travel');
  }

  if (input.vpnSuspected) {
    score -= 10;
    flags.push('vpn_suspected');
  }

  // ── Determine validation method ──
  let method: ValidationMethod = 'none';
  if (input.gpsValid && (input.bssidMatch || input.ssidOnlyMatch)) {
    method = 'gps_wifi';
  } else if (input.gpsValid) {
    method = 'gps';
  } else if (input.bssidMatch || input.ssidOnlyMatch) {
    method = 'wifi';
  }

  // ── Clamp score ──
  score = Math.max(0, Math.min(100, score));

  // If neither GPS nor WiFi valid → auto 0
  if (!input.gpsValid && !input.bssidMatch && !input.ssidOnlyMatch) {
    score = 0;
  }

  // ── Trust level ──
  let trustLevel: TrustLevel;
  if (score >= 70) {
    trustLevel = 'trusted';
  } else if (score >= 40) {
    trustLevel = 'review';
  } else {
    trustLevel = 'suspicious';
  }

  return { score, flags, method, trustLevel };
}
