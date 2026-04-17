/**
 * Zero-tap eligibility guard — pure function.
 *
 * A zero-tap check-in may only proceed if ALL 5 conditions hold:
 *   1. Branch policy enabled
 *   2. Device consent given + not revoked
 *   3. Device trusted + successful manual check-in quota met
 *   4. Trigger time inside branch window
 *   5. Cooldown elapsed since last zero-tap trigger
 *
 * Trigger is rejected with a precise reason so the client can explain.
 */

export interface ZeroTapGuardInput {
  triggerAt: Date;
  branchPolicy: {
    enabled: boolean;
    windowStart: string; // "HH:MM"
    windowEnd: string; // "HH:MM"
    cooldownSeconds: number;
    minManualCheckinsToEnable: number;
  } | null;
  device: {
    isTrusted: boolean;
    zeroTapEnabled: boolean;
    zeroTapConsentAt: Date | null;
    zeroTapRevokedAt: Date | null;
    zeroTapLastTriggerAt: Date | null;
    successfulCheckinCount: number;
  };
  /**
   * Time-of-day for the trigger in branch timezone.
   * Caller is responsible for localising (VN = UTC+7 in this project).
   */
  localHHMM: string;
}

export type ZeroTapGuardReason =
  | 'POLICY_DISABLED'
  | 'NO_CONSENT'
  | 'CONSENT_REVOKED'
  | 'DEVICE_NOT_TRUSTED'
  | 'INSUFFICIENT_MANUAL_CHECKINS'
  | 'OUT_OF_WINDOW'
  | 'COOLDOWN_NOT_ELAPSED';

export type ZeroTapGuardResult =
  | { ok: true }
  | { ok: false; reason: ZeroTapGuardReason };

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  return h * 60 + m;
}

export function checkZeroTapEligibility(input: ZeroTapGuardInput): ZeroTapGuardResult {
  const { branchPolicy, device, triggerAt, localHHMM } = input;

  if (!branchPolicy || !branchPolicy.enabled) {
    return { ok: false, reason: 'POLICY_DISABLED' };
  }

  if (!device.zeroTapEnabled || !device.zeroTapConsentAt) {
    return { ok: false, reason: 'NO_CONSENT' };
  }

  if (device.zeroTapRevokedAt) {
    return { ok: false, reason: 'CONSENT_REVOKED' };
  }

  if (!device.isTrusted) {
    return { ok: false, reason: 'DEVICE_NOT_TRUSTED' };
  }

  if (device.successfulCheckinCount < branchPolicy.minManualCheckinsToEnable) {
    return { ok: false, reason: 'INSUFFICIENT_MANUAL_CHECKINS' };
  }

  const nowMin = hhmmToMinutes(localHHMM);
  const startMin = hhmmToMinutes(branchPolicy.windowStart);
  const endMin = hhmmToMinutes(branchPolicy.windowEnd);
  if (nowMin < startMin || nowMin > endMin) {
    return { ok: false, reason: 'OUT_OF_WINDOW' };
  }

  if (device.zeroTapLastTriggerAt) {
    const elapsedSec = (triggerAt.getTime() - device.zeroTapLastTriggerAt.getTime()) / 1000;
    if (elapsedSec < branchPolicy.cooldownSeconds) {
      return { ok: false, reason: 'COOLDOWN_NOT_ELAPSED' };
    }
  }

  return { ok: true };
}
