import { Test, TestingModule } from '@nestjs/testing';
import { RoleCode } from '@prisma/client';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

describe('DashboardController', () => {
  let controller: DashboardController;
  let dashboard: any;

  beforeEach(async () => {
    dashboard = {
      getAdminOverview: jest.fn().mockResolvedValue({ today: {} }),
      getManagerBranchDashboard: jest.fn().mockResolvedValue({ branch: {} }),
      getAnomalies: jest.fn().mockResolvedValue({ data: {} }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: dashboard }],
    }).compile();

    controller = module.get(DashboardController);
  });

  it('admin/overview delegates to service', async () => {
    await controller.getAdminOverview();
    expect(dashboard.getAdminOverview).toHaveBeenCalled();
  });

  it('manager dashboard treats admin role as super-admin', async () => {
    const user = { id: 'u1', roles: [RoleCode.admin] } as any;
    await controller.getManagerDashboard(user, 'branch-1');
    expect(dashboard.getManagerBranchDashboard).toHaveBeenCalledWith('branch-1', 'u1', true);
  });

  it('manager dashboard treats manager-only role as non-super-admin', async () => {
    const user = { id: 'u1', roles: [RoleCode.manager] } as any;
    await controller.getManagerDashboard(user, 'branch-1');
    expect(dashboard.getManagerBranchDashboard).toHaveBeenCalledWith('branch-1', 'u1', false);
  });

  it('anomalies endpoint passes role scope to service', async () => {
    const user = { id: 'u1', roles: [RoleCode.manager] } as any;
    await controller.getAnomalies(user);
    expect(dashboard.getAnomalies).toHaveBeenCalledWith('u1', false);
  });
});
