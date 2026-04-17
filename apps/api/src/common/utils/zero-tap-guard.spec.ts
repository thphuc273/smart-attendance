import { checkZeroTapEligibility, type ZeroTapGuardInput } from './zero-tap-guard';

function baseInput(overrides: Partial<ZeroTapGuardInput> = {}): ZeroTapGuardInput {
  return {
    triggerAt: new Date('2026-04-17T08:00:00Z'),
    localHHMM: '08:00',
    branchPolicy: {
      enabled: true,
      windowStart: '07:30',
      windowEnd: '09:30',
      cooldownSeconds: 600,
      minManualCheckinsToEnable: 2,
    },
    device: {
      isTrusted: true,
      zeroTapEnabled: true,
      zeroTapConsentAt: new Date('2026-04-01T00:00:00Z'),
      zeroTapRevokedAt: null,
      zeroTapLastTriggerAt: null,
      successfulCheckinCount: 5,
    },
    ...overrides,
  };
}

describe('checkZeroTapEligibility', () => {
  it('passes when all conditions hold', () => {
    expect(checkZeroTapEligibility(baseInput())).toEqual({ ok: true });
  });

  it('fails when branchPolicy is null', () => {
    expect(checkZeroTapEligibility(baseInput({ branchPolicy: null }))).toEqual({
      ok: false,
      reason: 'POLICY_DISABLED',
    });
  });

  it('fails when branch policy disabled', () => {
    const input = baseInput();
    input.branchPolicy!.enabled = false;
    expect(checkZeroTapEligibility(input).ok).toBe(false);
  });

  it('fails when device has not consented', () => {
    const r = checkZeroTapEligibility(
      baseInput({
        device: {
          ...baseInput().device,
          zeroTapEnabled: false,
          zeroTapConsentAt: null,
        },
      }),
    );
    expect(r).toEqual({ ok: false, reason: 'NO_CONSENT' });
  });

  it('fails when consent revoked', () => {
    const r = checkZeroTapEligibility(
      baseInput({
        device: {
          ...baseInput().device,
          zeroTapRevokedAt: new Date('2026-04-10T00:00:00Z'),
        },
      }),
    );
    expect(r).toEqual({ ok: false, reason: 'CONSENT_REVOKED' });
  });

  it('fails when device not trusted', () => {
    const r = checkZeroTapEligibility(
      baseInput({ device: { ...baseInput().device, isTrusted: false } }),
    );
    expect(r).toEqual({ ok: false, reason: 'DEVICE_NOT_TRUSTED' });
  });

  it('fails when successful manual check-ins below threshold', () => {
    const r = checkZeroTapEligibility(
      baseInput({ device: { ...baseInput().device, successfulCheckinCount: 1 } }),
    );
    expect(r).toEqual({ ok: false, reason: 'INSUFFICIENT_MANUAL_CHECKINS' });
  });

  it('fails when before window', () => {
    expect(checkZeroTapEligibility(baseInput({ localHHMM: '07:00' }))).toEqual({
      ok: false,
      reason: 'OUT_OF_WINDOW',
    });
  });

  it('fails when after window', () => {
    expect(checkZeroTapEligibility(baseInput({ localHHMM: '10:00' }))).toEqual({
      ok: false,
      reason: 'OUT_OF_WINDOW',
    });
  });

  it('fails when cooldown has not elapsed', () => {
    const now = new Date('2026-04-17T08:00:00Z');
    const r = checkZeroTapEligibility(
      baseInput({
        triggerAt: now,
        device: {
          ...baseInput().device,
          zeroTapLastTriggerAt: new Date(now.getTime() - 60 * 1000), // 60s ago < 600s
        },
      }),
    );
    expect(r).toEqual({ ok: false, reason: 'COOLDOWN_NOT_ELAPSED' });
  });

  it('passes when cooldown has elapsed', () => {
    const now = new Date('2026-04-17T08:00:00Z');
    const r = checkZeroTapEligibility(
      baseInput({
        triggerAt: now,
        device: {
          ...baseInput().device,
          zeroTapLastTriggerAt: new Date(now.getTime() - 700 * 1000),
        },
      }),
    );
    expect(r).toEqual({ ok: true });
  });

  it('boundary: exactly windowStart passes', () => {
    expect(checkZeroTapEligibility(baseInput({ localHHMM: '07:30' })).ok).toBe(true);
  });

  it('boundary: exactly windowEnd passes', () => {
    expect(checkZeroTapEligibility(baseInput({ localHHMM: '09:30' })).ok).toBe(true);
  });

  it('precedence: POLICY_DISABLED beats NO_CONSENT', () => {
    const input = baseInput();
    input.branchPolicy!.enabled = false;
    input.device.zeroTapEnabled = false;
    expect(checkZeroTapEligibility(input).ok).toBe(false);
    expect((checkZeroTapEligibility(input) as { reason: string }).reason).toBe('POLICY_DISABLED');
  });

  it('precedence: CONSENT_REVOKED beats DEVICE_NOT_TRUSTED', () => {
    const r = checkZeroTapEligibility(
      baseInput({
        device: {
          ...baseInput().device,
          isTrusted: false,
          zeroTapRevokedAt: new Date('2026-04-10T00:00:00Z'),
        },
      }),
    );
    expect((r as { reason: string }).reason).toBe('CONSENT_REVOKED');
  });
});
