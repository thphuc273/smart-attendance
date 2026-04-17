import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateNotificationInput) {
    return this.prisma.notification.create({ data: input });
  }

  createMany(inputs: CreateNotificationInput[]) {
    if (inputs.length === 0) return Promise.resolve({ count: 0 });
    return this.prisma.notification.createMany({ data: inputs });
  }

  async list(userId: string, dto: ListNotificationsDto) {
    const where: Prisma.NotificationWhereInput = { userId };
    if (dto.unread_only) where.readAt = null;

    const [total, unread, items] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (dto.page - 1) * dto.limit,
        take: dto.limit,
      }),
    ]);

    return {
      items: items.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        data: n.data,
        read_at: n.readAt,
        created_at: n.createdAt,
      })),
      meta: {
        total,
        unread,
        page: dto.page,
        limit: dto.limit,
        total_pages: Math.ceil(total / dto.limit) || 1,
      },
    };
  }

  async markRead(userId: string, id: string) {
    const found = await this.prisma.notification.findUnique({ where: { id } });
    if (!found || found.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }
    if (found.readAt) return found;
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
