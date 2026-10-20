import { getMetadataArgsStorage, Table } from 'typeorm';
import { VisualPromptTask } from '../visual-prompt-templates/entities/visual-prompt-task.entity';
import { AddVisualPromptTasks1792828800000 } from './1792828800000-AddVisualPromptTasks';

describe('视觉提示词异步任务迁移', () => {
  it('幂等创建任务表和请求、活跃任务、队列索引', async () => {
    const createTable = jest.fn<void, [Table]>();
    const runner = {
      hasTable: jest.fn().mockResolvedValue(false),
      createTable,
    };
    await new AddVisualPromptTasks1792828800000().up(runner as never);
    const table = createTable.mock.calls[0]?.[0];
    expect(table).toBeDefined();
    if (!table) throw new Error('未创建视觉提示词任务表');
    expect(table.name).toBe('visual_prompt_tasks');
    expect(table.indices.map((index) => index.name)).toEqual(
      expect.arrayContaining([
        'UQ_visual_prompt_task_request',
        'UQ_visual_prompt_task_active',
        'IDX_visual_prompt_task_queue',
      ]),
    );
  });

  it('实体注册视觉提示词任务表', () => {
    expect(
      getMetadataArgsStorage().tables.some(
        (table) =>
          table.target === VisualPromptTask &&
          table.name === 'visual_prompt_tasks',
      ),
    ).toBe(true);
  });
});
