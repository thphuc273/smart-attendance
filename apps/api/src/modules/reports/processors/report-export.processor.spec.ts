import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { ReportExportProcessor, type ReportExportJobData } from './report-export.processor';
import { PrismaService } from '../../prisma/prisma.service';

describe('ReportExportProcessor', () => {
  let processor: ReportExportProcessor;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      reportExport: {
        update: jest.fn().mockResolvedValue(null),
      },
      attendanceSession: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportExportProcessor, { provide: PrismaService, useValue: prisma }],
    }).compile();

    processor = module.get(ReportExportProcessor);
  });

  const fakeJob = (data: ReportExportJobData) =>
    ({ id: 'job-1', data } as unknown as Job<ReportExportJobData>);

  it('builds CSV with BOM + header and stores it on the report_exports row', async () => {
    prisma.attendanceSession.findMany.mockResolvedValueOnce([
      {
        workDate: new Date('2026-04-15T00:00:00Z'),
        checkInAt: new Date('2026-04-15T01:05:00Z'),
        checkOutAt: new Date('2026-04-15T10:00:00Z'),
        status: 'on_time',
        workedMinutes: 535,
        overtimeMinutes: 0,
        lateMinutes: 0,
        trustScore: 85,
        branch: { name: 'HCM-Q1' },
        employee: { employeeCode: 'EMP001', user: { fullName: 'Nguyễn Văn A' } },
      },
    ]);

    await processor.process(
      fakeJob({
        reportExportId: 're-1',
        type: 'attendance_csv',
        branch_id: 'branch-1',
        date_from: '2026-04-01',
        date_to: '2026-04-30',
      }),
    );

    // First call marks as processing
    expect(prisma.reportExport.update).toHaveBeenNthCalledWith(1, {
      where: { id: 're-1' },
      data: { status: 'processing' },
    });
    // Second call stores the completed CSV
    const completeCall = prisma.reportExport.update.mock.calls[1][0];
    expect(completeCall.where).toEqual({ id: 're-1' });
    expect(completeCall.data.status).toBe('completed');
    expect(completeCall.data.rowCount).toBe(1);
    // BOM \uFEFF present
    expect(completeCall.data.fileContent.charCodeAt(0)).toBe(0xfeff);
    // Header row
    expect(completeCall.data.fileContent).toContain('employee_code');
    expect(completeCall.data.fileContent).toContain('EMP001');
    expect(completeCall.data.fileContent).toContain('Nguyễn Văn A');
  });

  it('marks as failed if the query throws', async () => {
    prisma.attendanceSession.findMany.mockRejectedValueOnce(new Error('DB down'));

    await expect(
      processor.process(
        fakeJob({
          reportExportId: 're-2',
          type: 'attendance_csv',
          branch_id: 'branch-1',
          date_from: '2026-04-01',
          date_to: '2026-04-30',
        }),
      ),
    ).rejects.toThrow('DB down');

    const failedCall = prisma.reportExport.update.mock.calls[1][0];
    expect(failedCall.data.status).toBe('failed');
    expect(failedCall.data.errorMessage).toBe('DB down');
  });
});
