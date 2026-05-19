import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Throttler variant for zero-tap endpoints (spec §11: "3 per minute per
 * device"). Keys by the authenticated user id first — `device_fingerprint`
 * is client-supplied and can be rotated on every request to slip the limit,
 * so it must never take precedence over a trusted identity.
 */
@Injectable()
export class DeviceThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    if (req?.user?.id) return `uid:${req.user.id}`;
    const fp =
      req?.body?.device_fingerprint ??
      req?.headers?.['x-device-fingerprint'];
    if (typeof fp === 'string' && fp.length > 0) return `dev:${fp}`;
    return `ip:${req.ip ?? 'unknown'}`;
  }
}
