import { Controller, Sse, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Observable, filter, interval, map, merge } from 'rxjs';
import { RoleCode } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { LiveBusService } from './live-bus.service';

@ApiTags('live')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class LiveController {
  constructor(private readonly bus: LiveBusService) {}

  @Sse('live')
  live(@CurrentUser() user: AuthenticatedUser): Observable<MessageEvent<unknown>> {
    const isAdmin = user.roles.includes(RoleCode.admin);
    const allowedBranches = new Set(user.managedBranchIds);

    const events$ = this.bus.stream().pipe(
      filter((ev) => isAdmin || allowedBranches.has(ev.branch_id)),
      map((ev) => ({ data: ev, type: 'attendance' }) as MessageEvent),
    );
    const heartbeat$ = interval(15_000).pipe(
      map(() => ({ data: { heartbeat: Date.now() }, type: 'heartbeat' }) as MessageEvent),
    );
    return merge(events$, heartbeat$);
  }
}
