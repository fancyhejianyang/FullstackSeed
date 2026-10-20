import { getMetadataArgsStorage } from 'typeorm';
import { ComfyWorkflow } from '../comfyui/entities/comfy-workflow.entity';
import { ComfyWorkflowVersion } from '../comfyui/entities/comfy-workflow-version.entity';
import { VisualPromptTemplate } from '../visual-prompt-templates/entities/visual-prompt-template.entity';
import { AddVisualPromptTemplates1792656000000 } from './1792656000000-AddVisualPromptTemplates';

describe('视觉提示词与 ComfyUI 模型字段迁移', () => {
  it('幂等创建模板表并补充两个目标模型字段', async () => {
    const runner = {
      hasTable: jest.fn().mockResolvedValue(false),
      createTable: jest.fn(),
      hasColumn: jest.fn().mockResolvedValue(false),
      addColumn: jest.fn(),
    };
    await new AddVisualPromptTemplates1792656000000().up(runner as never);
    expect(runner.createTable).toHaveBeenCalledTimes(1);
    expect(runner.addColumn).toHaveBeenCalledTimes(2);
  });

  it('实体字段与迁移一致', () => {
    const columns = getMetadataArgsStorage().columns;
    for (const [target, property] of [
      [VisualPromptTemplate, 'targetModel'],
      [VisualPromptTemplate, 'negativeTemplate'],
      [ComfyWorkflow, 'targetModel'],
      [ComfyWorkflowVersion, 'targetModel'],
    ] as const) {
      expect(
        columns.some(
          (column) =>
            column.target === target && column.propertyName === property,
        ),
      ).toBe(true);
    }
  });
});
