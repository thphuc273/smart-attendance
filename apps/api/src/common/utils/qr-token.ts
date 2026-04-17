import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * QR kiosk token — HMAC-SHA256, time-bucketed (30s default).
 *
 * Payload: `${branchId}.${bucket}.${nonce}` signed with per-branch secret.
 * Token format (URL-safe base64): `v1.${payload}.${sig}`.
 *
 * Rotation: the kiosk regenerates every 25s (< bucket) so displayed QR is
 * never stale. Verify accepts current bucket + previous bucket (clock skew).
 */

const BUCKET_SECONDS_DEFAULT = 30;
const VERSION = 'v1';

function currentBucket(ms: number, bucketSec: number): number {
  return Math.floor(ms / 1000 / bucketSec);
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = 4 - (s.length % 4);
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + (pad === 4 ? '' : '='.repeat(pad));
  return Buffer.from(b64, 'base64');
}

function sign(payload: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(payload).digest());
}

export interface SignedQrToken {
  token: string;
  bucket: number;
  nonce: string;
  expiresAt: Date;
}

export function signQrToken(params: {
  branchId: string;
  secret: string;
  now?: Date;
  bucketSeconds?: number;
}): SignedQrToken {
  const bucketSec = params.bucketSeconds ?? BUCKET_SECONDS_DEFAULT;
  const nowMs = (params.now ?? new Date()).getTime();
  const bucket = currentBucket(nowMs, bucketSec);
  const nonce = b64url(randomBytes(9)); // 12 char
  const payload = `${params.branchId}.${bucket}.${nonce}`;
  const sig = sign(payload, params.secret);
  const token = `${VERSION}.${b64url(Buffer.from(payload, 'utf8'))}.${sig}`;
  const expiresAt = new Date((bucket + 1) * bucketSec * 1000);
  return { token, bucket, nonce, expiresAt };
}

export type QrVerifyResult =
  | { ok: true; branchId: string; nonce: string; bucket: number }
  | {
      ok: false;
      reason: 'MALFORMED' | 'BAD_VERSION' | 'BAD_SIGNATURE' | 'EXPIRED' | 'BRANCH_MISMATCH';
    };

export function verifyQrToken(params: {
  token: string;
  secret: string;
  expectedBranchId: string;
  now?: Date;
  bucketSeconds?: number;
  /** Allow N previous buckets (clock skew). Default 1 = token valid for ~60s. */
  toleranceBuckets?: number;
}): QrVerifyResult {
  const bucketSec = params.bucketSeconds ?? BUCKET_SECONDS_DEFAULT;
  const tolerance = params.toleranceBuckets ?? 1;

  const parts = params.token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'MALFORMED' };
  const [ver, payloadB64, sigGiven] = parts;
  if (ver !== VERSION) return { ok: false, reason: 'BAD_VERSION' };

  let payload: string;
  try {
    payload = b64urlDecode(payloadB64).toString('utf8');
  } catch {
    return { ok: false, reason: 'MALFORMED' };
  }

  const payloadParts = payload.split('.');
  if (payloadParts.length !== 3) return { ok: false, reason: 'MALFORMED' };
  const [branchId, bucketStr, nonce] = payloadParts;
  if (branchId !== params.expectedBranchId) return { ok: false, reason: 'BRANCH_MISMATCH' };

  const bucket = parseInt(bucketStr, 10);
  if (!Number.isFinite(bucket)) return { ok: false, reason: 'MALFORMED' };

  const expected = sign(payload, params.secret);
  const a = Buffer.from(sigGiven);
  const b = Buffer.from(expected);
  // Constant-time compare: pad shorter buffer so length difference doesn't short-circuit.
  if (a.length !== b.length) return { ok: false, reason: 'BAD_SIGNATURE' };
  if (!timingSafeEqual(a, b)) return { ok: false, reason: 'BAD_SIGNATURE' };

  const nowMs = (params.now ?? new Date()).getTime();
  const currentB = currentBucket(nowMs, bucketSec);
  const delta = currentB - bucket;
  if (delta < 0 || delta > tolerance) {
    return { ok: false, reason: 'EXPIRED' };
  }

  return { ok: true, branchId, nonce, bucket };
}

/** Generate an HMAC secret to store in branch_qr_secrets.hmac_secret. */
export function generateHmacSecret(): string {
  return b64url(randomBytes(32));
}

/** Generate a kiosk token (the credential the kiosk hardware uses to hit the API). */
export function generateKioskToken(): string {
  return `kiosk_${b64url(randomBytes(24))}`;
}
