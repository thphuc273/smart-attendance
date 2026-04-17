import {
  signQrToken,
  verifyQrToken,
  generateHmacSecret,
  generateKioskToken,
} from './qr-token';

const BRANCH = '11111111-1111-1111-1111-111111111111';
const SECRET = 'test-secret-ABCDEFGHIJKLMNOP';

describe('qr-token', () => {
  it('signs then verifies a token within same bucket', () => {
    const now = new Date('2026-04-17T08:00:00Z');
    const signed = signQrToken({ branchId: BRANCH, secret: SECRET, now });
    const result = verifyQrToken({
      token: signed.token,
      secret: SECRET,
      expectedBranchId: BRANCH,
      now,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.branchId).toBe(BRANCH);
      expect(result.nonce).toBe(signed.nonce);
    }
  });

  it('accepts previous bucket (tolerance = 1)', () => {
    const signedAt = new Date('2026-04-17T08:00:00Z');
    const signed = signQrToken({ branchId: BRANCH, secret: SECRET, now: signedAt });
    // 45s later — one bucket newer, still within tolerance
    const later = new Date(signedAt.getTime() + 45 * 1000);
    expect(
      verifyQrToken({ token: signed.token, secret: SECRET, expectedBranchId: BRANCH, now: later })
        .ok,
    ).toBe(true);
  });

  it('rejects token older than tolerance (expired)', () => {
    const signedAt = new Date('2026-04-17T08:00:00Z');
    const signed = signQrToken({ branchId: BRANCH, secret: SECRET, now: signedAt });
    const later = new Date(signedAt.getTime() + 120 * 1000);
    const r = verifyQrToken({
      token: signed.token,
      secret: SECRET,
      expectedBranchId: BRANCH,
      now: later,
    });
    expect(r).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('rejects tampered signature', () => {
    const signed = signQrToken({ branchId: BRANCH, secret: SECRET });
    const tampered = signed.token.slice(0, -4) + 'XXXX';
    expect(
      verifyQrToken({ token: tampered, secret: SECRET, expectedBranchId: BRANCH }).ok,
    ).toBe(false);
  });

  it('rejects token signed with different secret', () => {
    const signed = signQrToken({ branchId: BRANCH, secret: SECRET });
    const r = verifyQrToken({
      token: signed.token,
      secret: 'different-secret-12345678901234',
      expectedBranchId: BRANCH,
    });
    expect(r).toEqual({ ok: false, reason: 'BAD_SIGNATURE' });
  });

  it('rejects mismatched branchId', () => {
    const signed = signQrToken({ branchId: BRANCH, secret: SECRET });
    const r = verifyQrToken({
      token: signed.token,
      secret: SECRET,
      expectedBranchId: '22222222-2222-2222-2222-222222222222',
    });
    expect(r).toEqual({ ok: false, reason: 'BRANCH_MISMATCH' });
  });

  it('rejects malformed token', () => {
    expect(
      verifyQrToken({ token: 'not-a-token', secret: SECRET, expectedBranchId: BRANCH }).ok,
    ).toBe(false);
    expect(
      verifyQrToken({ token: 'a.b', secret: SECRET, expectedBranchId: BRANCH }).ok,
    ).toBe(false);
  });

  it('rejects bad version prefix', () => {
    const signed = signQrToken({ branchId: BRANCH, secret: SECRET });
    const bumped = 'v2.' + signed.token.split('.').slice(1).join('.');
    expect(verifyQrToken({ token: bumped, secret: SECRET, expectedBranchId: BRANCH })).toEqual({
      ok: false,
      reason: 'BAD_VERSION',
    });
  });

  it('generateHmacSecret + generateKioskToken produce distinct non-empty strings', () => {
    expect(generateHmacSecret()).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const k1 = generateKioskToken();
    const k2 = generateKioskToken();
    expect(k1).toMatch(/^kiosk_/);
    expect(k1).not.toBe(k2);
  });
});
