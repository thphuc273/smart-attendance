import { ChatContextBuilder, ChatIdentity } from './chat-context.builder';

const builder = new ChatContextBuilder();

function identity(overrides: Partial<ChatIdentity> = {}): ChatIdentity {
  return {
    scope: 'employee',
    userFullName: 'Nguyễn Văn A',
    employeeCode: 'EMP001',
    primaryBranchName: 'HCM-Q1',
    vnToday: '2026-04-18',
    ...overrides,
  };
}

describe('ChatContextBuilder — identity prompt', () => {
  it('always includes FinOS HR Assistant framing + today VN date + tool-calling rule', () => {
    const out = builder.buildSystemPrompt(identity());
    expect(out).toContain('FinOS HR Assistant');
    expect(out).toContain('2026-04-18');
    expect(out).toContain('BẮT BUỘC gọi tool');
    expect(out).toContain('KHÔNG bịa số');
  });

  it('employee scope → declares scope EMPLOYEE + directs to get_my_* tools', () => {
    const out = builder.buildSystemPrompt(identity({ scope: 'employee' }));
    expect(out).toContain('Vai trò: EMPLOYEE');
    expect(out).toContain('Phạm vi dữ liệu: CHÍNH BẠN');
    expect(out).toContain('get_my_*');
  });

  it('manager scope → lists managed branches with ids so the model can pass branch_id', () => {
    const out = builder.buildSystemPrompt(
      identity({
        scope: 'manager',
        managedBranches: [
          { id: 'b1', name: 'HCM-Q1' },
          { id: 'b2', name: 'HCM-Q3' },
        ],
      }),
    );
    expect(out).toContain('Vai trò: MANAGER');
    expect(out).toContain('HCM-Q1 (b1)');
    expect(out).toContain('HCM-Q3 (b2)');
    expect(out).toContain('get_branch_*');
  });

  it('manager scope without managed branches → shows "(chưa gán)"', () => {
    const out = builder.buildSystemPrompt(identity({ scope: 'manager', managedBranches: [] }));
    expect(out).toContain('(chưa gán)');
  });

  it('admin scope → declares TOÀN HỆ THỐNG + mentions system + compare tools', () => {
    const out = builder.buildSystemPrompt(identity({ scope: 'admin' }));
    expect(out).toContain('Vai trò: ADMIN');
    expect(out).toContain('TOÀN HỆ THỐNG');
    expect(out).toContain('get_system_overview');
    expect(out).toContain('compare_branches');
  });

  it('omits optional identity fields when missing', () => {
    const out = builder.buildSystemPrompt(
      identity({ employeeCode: undefined, primaryBranchName: null }),
    );
    expect(out).not.toContain('Mã NV:');
    expect(out).not.toContain('Chi nhánh chính:');
  });
});
