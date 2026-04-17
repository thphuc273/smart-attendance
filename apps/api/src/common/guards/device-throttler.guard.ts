import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Throttler variant that keys requests by device_fingerprint (falls back to
 * authenticated user id, then IP). Used on zero-tap endpoints where spec §11
 * calls for "3 per minute per device", not per IP.
 */
@Injectable()
export class DeviceThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const fp =
      req?.body?.device_fingerprint ??
      req?.headers?.['x-device-fingerprint'];
    if (typeof fp === 'string' && fp.length > 0) return `dev:${fp}`;
    if (req?.user?.id) return `uid:${req.user.id}`;
    return `ip:${req.ip ?? 'unknown'}`;
  }
}
