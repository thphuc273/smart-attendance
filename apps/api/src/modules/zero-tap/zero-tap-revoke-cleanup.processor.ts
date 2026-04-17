import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_ZERO_TAP_REVOKE_CLEANUP } from '../queue/queue.constants';

const REVOKE_COOLDOWN_DAYS = 7;

/**
 * Daily cron — re-enable zero-tap consent on devices whose auto-revoke
 * (mock_location_detected / attestation_failed) has cooled off for 7 days.
 * Admin-revoked (admin_disabled / user_opt_out) remain revoked until user re-opts.
 */
@Processor(QUEUE_ZERO_TAP_REVOKE_CLEANUP)
export class ZeroTapRevokeCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(ZeroTapRevokeCleanupProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(_job: Job): Promise<{ restored: number }> {
    const cutoff = new Date(Date.now() - REVOKE_COOLDOWN_DAYS * 24 * 3600 * 1000);
    const res = await this.prisma.employeeDevice.updateMany({
      where: {
        zeroTapEnabled: false,
        zeroTapRevokedAt: { lte: cutoff, not: null },
        zeroTapRevokeReason: { in: ['mock_location_detected', 'attestation_failed'] },
      },
      data: {
        zeroTapRevokedAt: null,
        zeroTapRevokeReason: null,
      },
    });
    this.logger.log(`Restored ${res.count} zero-tap device(s) after ${REVOKE_COOLDOWN_DAYS}d cooldown`);
    return { restored: res.count };
  }
}
