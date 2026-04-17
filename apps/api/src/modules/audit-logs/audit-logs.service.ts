import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(dto: ListAuditLogsDto) {
    const where: Prisma.AuditLogWhereInput = {};
    if (dto.action) where.action = dto.action;
    if (dto.entity_type) where.entityType = dto.entity_type;
    if (dto.user_id) where.userId = dto.user_id;
    if (dto.date_from || dto.date_to) {
      where.createdAt = {};
      if (dto.date_from) where.createdAt.gte = new Date(dto.date_from);
      if (dto.date_to) {
        const to = new Date(dto.date_to);
        to.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }

    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, email: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (dto.page - 1) * dto.limit,
        take: dto.limit,
      }),
    ]);

    return {
      items: items.map((log) => ({
        id: log.id,
        action: log.action,
        entity_type: log.entityType,
        entity_id: log.entityId,
        before: log.before,
        after: log.after,
        ip_address: log.ipAddress,
        user_agent: log.userAgent,
        created_at: log.createdAt,
        user: log.user
          ? { id: log.user.id, email: log.user.email, full_name: log.user.fullName }
          : null,
      })),
      meta: {
        total,
        page: dto.page,
        limit: dto.limit,
        total_pages: Math.ceil(total / dto.limit) || 1,
      },
    };
  }
}
