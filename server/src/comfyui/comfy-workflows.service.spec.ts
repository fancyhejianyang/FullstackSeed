import { BadRequestException } from '@nestjs/common';
import { ComfyWorkflowsService } from './comfy-workflows.service';
import {
  ComfyWorkflow,
  type ComfyInputBinding,
} from './entities/comfy-workflow.entity';
import { ComfyWorkflowVersion } from './entities/comfy-workflow-version.entity';

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

describe('ComfyUI 工作流版本快照保存', () => {
  it('不依赖主记录保存后回传 select:false 的 apiWorkflow', async () => {
    const workflowRepository = {
      create: jest.fn((value: Record<string, unknown>) => value),
      save: jest.fn((value: Record<string, unknown>) => {
        const saved = { ...value };
        delete saved.apiWorkflow;
        return Promise.resolve({ ...saved, id: 9 });
      }),
    };
    const versionRepository = {
      create: jest.fn((value: Record<string, unknown>) => value),
      save: jest.fn((value: Record<string, unknown>) => Promise.resolve(value)),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === ComfyWorkflow ? workflowRepository : versionRepository,
      ),
    };
    const workflows = {
      manager: {
        transaction: jest.fn(
          (callback: (value: typeof manager) => Promise<number>) =>
            callback(manager),
        ),
      },
    };
    const service = new ComfyWorkflowsService(
      workflows as never,
      {} as never,
      { exists: jest.fn().mockResolvedValue(true) } as never,
      {} as never,
    );
    jest
      .spyOn(service, 'findOne')
      .mockResolvedValue({ id: 9 } as ComfyWorkflow);

    await service.create({
      name: '测试工作流',
      connectionId: 1,
      outputType: 'image',
      apiWorkflow: JSON.stringify({
        '1': { class_type: 'SaveImage', inputs: { images: ['2', 0] } },
      }),
      inputBindings: [],
      outputNodeIds: ['1'],
      isPublished: true,
      isEnabled: true,
    });

    expect(manager.getRepository).toHaveBeenCalledWith(ComfyWorkflowVersion);
    const versionValue = versionRepository.create.mock.calls[0]?.[0];
    expect(versionValue).toMatchObject({
      workflowId: 9,
      inputBindings: [],
      outputNodeIds: ['1'],
    });
    expect(versionValue?.apiWorkflow).toContain('SaveImage');
  });
});
