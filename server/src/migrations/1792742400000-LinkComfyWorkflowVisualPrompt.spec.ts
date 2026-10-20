import { getMetadataArgsStorage } from 'typeorm';
import { ComfyWorkflow } from '../comfyui/entities/comfy-workflow.entity';
import { LinkComfyWorkflowVisualPrompt1792742400000 } from './1792742400000-LinkComfyWorkflowVisualPrompt';

describe('ComfyUI 工作流视觉提示词模板绑定迁移', () => {
  it('幂等补充工作流模板绑定字段', async () => {
    const runner = {
      hasColumn: jest.fn().mockResolvedValue(false),
      addColumn: jest.fn(),
    };
    await new LinkComfyWorkflowVisualPrompt1792742400000().up(runner as never);
    expect(runner.addColumn).toHaveBeenCalledTimes(1);
    expect(runner.addColumn).toHaveBeenCalledWith(
      'comfy_workflows',
      expect.objectContaining({
        name: 'visualPromptTemplateId',
        type: 'int',
        isNullable: true,
      }),
    );
  });

  it('实体包含模板绑定字段', () => {
    expect(
      getMetadataArgsStorage().columns.some(
        (column) =>
          column.target === ComfyWorkflow &&
          column.propertyName === 'visualPromptTemplateId',
      ),
    ).toBe(true);
  });
});
