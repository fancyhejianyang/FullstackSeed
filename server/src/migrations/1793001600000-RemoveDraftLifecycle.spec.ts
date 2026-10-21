import { getMetadataArgsStorage } from 'typeorm';
import { AgentExecution } from '../agent-apps/entities/agent-execution.entity';
import { AgentPendingAction } from '../agent-apps/entities/agent-pending-action.entity';
import { ComfyWorkflow } from '../comfyui/entities/comfy-workflow.entity';
import { DashboardConfig } from '../dashboard/entities/dashboard-config.entity';
import { Demo } from '../demo/entities/demo.entity';
import { KnowledgeStandardQa } from '../knowledge-standard-qas/entities/knowledge-standard-qa.entity';
import { RemoveDraftLifecycle1793001600000 } from './1793001600000-RemoveDraftLifecycle';

describe('移除业务资源草稿生命周期迁移', () => {
  it('迁移 Agent 待确认操作表、执行关联字段和消息类型', async () => {
    const tables = new Set([
      'agent_drafts',
      'agent_pending_actions',
      'agent_executions',
      'agent_messages',
      'menus',
    ]);
    const runner = {
      hasTable: jest.fn((table: string) => Promise.resolve(tables.has(table))),
      hasColumn: jest.fn((table: string, column: string) =>
        Promise.resolve(table === 'agent_executions' && column === 'draftId'),
      ),
      renameTable: jest.fn(),
      renameColumn: jest.fn(),
      getTable: jest.fn().mockResolvedValue({
        indices: [{ name: 'IDX_agent_drafts_session_status' }],
      }),
      dropIndex: jest.fn(),
      createIndex: jest.fn(),
      query: jest.fn(),
    };

    await new RemoveDraftLifecycle1793001600000().up(runner as never);

    expect(runner.renameTable).toHaveBeenCalledWith(
      'agent_drafts',
      'agent_pending_actions',
    );
    expect(runner.renameColumn).toHaveBeenCalledWith(
      'agent_executions',
      'draftId',
      'pendingActionId',
    );
    expect(runner.query).toHaveBeenCalledWith(
      expect.stringContaining("`messageType` = 'pending_action'"),
    );
    expect(runner.query).toHaveBeenCalledWith(
      expect.stringContaining("'/collaboration-center/approvals'"),
    );
  });

  it('实体只暴露启用字段或真实待确认操作语义', () => {
    const metadata = getMetadataArgsStorage();
    const properties = (target: Function) =>
      metadata.columns
        .filter((column) => column.target === target)
        .map((column) => column.propertyName);

    expect(properties(DashboardConfig)).toEqual(
      expect.arrayContaining(['revision', 'widgets']),
    );
    expect(properties(DashboardConfig)).not.toEqual(
      expect.arrayContaining(['draft', 'published', 'publishedVersion']),
    );
    expect(properties(ComfyWorkflow)).toContain('isEnabled');
    expect(properties(ComfyWorkflow)).not.toContain('isPublished');
    expect(properties(KnowledgeStandardQa)).toContain('isActive');
    expect(properties(KnowledgeStandardQa)).not.toContain('status');
    expect(properties(Demo)).toContain('isActive');
    expect(properties(Demo)).not.toContain('status');
    expect(properties(AgentExecution)).toContain('pendingActionId');
    expect(
      metadata.tables.find((table) => table.target === AgentPendingAction)
        ?.name,
    ).toBe('agent_pending_actions');
  });
});
