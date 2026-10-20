import { BadRequestException } from '@nestjs/common';
import { ComfyWorkflowsService } from './comfy-workflows.service';
import type { ComfyInputBinding } from './entities/comfy-workflow.entity';

describe('ComfyUI 工作流提示词语义绑定', () => {
  const service = new ComfyWorkflowsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const validate = (bindings: ComfyInputBinding[]): void =>
    (
      service as unknown as {
        validateBindings: (
          graph: Record<
            string,
            { class_type: string; inputs: Record<string, unknown> }
          >,
          bindings: ComfyInputBinding[],
          outputNodeIds: string[],
        ) => void;
      }
    ).validateBindings(
      {
        '1': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
        '2': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
        '3': { class_type: 'KSampler', inputs: { seed: 1 } },
      },
      bindings,
      [],
    );

  it('允许分别绑定一个正向和一个负向提示词', () => {
    expect(() =>
      validate([
        {
          key: 'positive',
          label: '正向',
          type: 'textarea',
          nodeId: '1',
          inputKey: 'text',
          semanticRole: 'positivePrompt',
        },
        {
          key: 'negative',
          label: '负向',
          type: 'textarea',
          nodeId: '2',
          inputKey: 'text',
          semanticRole: 'negativePrompt',
        },
      ]),
    ).not.toThrow();
  });

  it('拒绝重复的正向提示词语义绑定', () => {
    expect(() =>
      validate([
        {
          key: 'positiveA',
          label: '正向一',
          type: 'textarea',
          nodeId: '1',
          inputKey: 'text',
          semanticRole: 'positivePrompt',
        },
        {
          key: 'positiveB',
          label: '正向二',
          type: 'text',
          nodeId: '2',
          inputKey: 'text',
          semanticRole: 'positivePrompt',
        },
      ]),
    ).toThrow(BadRequestException);
  });

  it('拒绝数字参数承担负向提示词语义', () => {
    expect(() =>
      validate([
        {
          key: 'seed',
          label: '随机种子',
          type: 'seed',
          nodeId: '3',
          inputKey: 'seed',
          semanticRole: 'negativePrompt',
        },
      ]),
    ).toThrow('语义角色仅支持文本类型');
  });
});
