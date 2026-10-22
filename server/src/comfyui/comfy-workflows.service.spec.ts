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

  it('允许主提示词独立绑定且负向提示词可缺省', () => {
    expect(() =>
      validate([
        {
          key: 'mainPrompt',
          label: '主提示词',
          type: 'textarea',
          nodeId: '1',
          inputKey: 'text',
          semanticRole: 'mainPrompt',
        },
      ]),
    ).not.toThrow();
  });

  it('拒绝同时绑定主提示词与正向提示词', () => {
    expect(() =>
      validate([
        {
          key: 'mainPrompt',
          label: '主提示词',
          type: 'textarea',
          nodeId: '1',
          inputKey: 'text',
          semanticRole: 'mainPrompt',
        },
        {
          key: 'positivePrompt',
          label: '正向提示词',
          type: 'textarea',
          nodeId: '2',
          inputKey: 'text',
          semanticRole: 'positivePrompt',
        },
      ]),
    ).toThrow('主提示词与正向提示词只能选择一种');
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

describe('ComfyUI API 工作流格式校验', () => {
  const service = new ComfyWorkflowsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const parse = (value: Record<string, unknown>) =>
    (
      service as unknown as {
        parseAndValidateGraph: (source: string) => Record<string, unknown>;
      }
    ).parseAndValidateGraph(JSON.stringify(value));

  it('允许 ComfyUI 子图生成的冒号分隔层级节点 ID', () => {
    const graph = {
      '13': {
        class_type: 'ResolutionSelector',
        inputs: { aspect_ratio: '1:1' },
      },
      '459:451': {
        class_type: 'UNETLoader',
        inputs: { unet_name: 'qwen_image.safetensors' },
      },
      '459:457:2': {
        class_type: 'SaveImage',
        inputs: { images: ['459:451', 0] },
      },
    };

    expect(parse(graph)).toEqual(graph);
  });

  it.each(['node', '459::451', '459:node', '459/451'])(
    '继续拒绝非法 API 节点 ID：%s',
    (nodeId) => {
      expect(() =>
        parse({
          [nodeId]: { class_type: 'SaveImage', inputs: {} },
        }),
      ).toThrow('仅支持 ComfyUI API 格式工作流');
    },
  );
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
      {} as never,
    );
    jest
      .spyOn(service, 'findOne')
      .mockResolvedValue({ id: 9 } as ComfyWorkflow);

    await service.create(
      {
        name: '测试工作流',
        connectionId: 1,
        outputType: 'image',
        apiWorkflow: JSON.stringify({
          '1': { class_type: 'SaveImage', inputs: { images: ['2', 0] } },
        }),
        inputBindings: [],
        outputNodeIds: ['1'],
        isEnabled: true,
      },
      1,
    );

    expect(manager.getRepository).toHaveBeenCalledWith(ComfyWorkflowVersion);
    const versionValue = versionRepository.create.mock.calls[0]?.[0];
    expect(versionValue).toMatchObject({
      workflowId: 9,
      inputBindings: [],
      outputNodeIds: ['1'],
    });
    expect(versionValue?.apiWorkflow).toContain('SaveImage');
  });

  it('保存前提取原始提示词并绑定总结记录，工作流版本完整保留原提示词', async () => {
    const workflowRepository = {
      create: jest.fn((value: Record<string, unknown>) => value),
      save: jest.fn((value: Record<string, unknown>) =>
        Promise.resolve({ ...value, id: 12 }),
      ),
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
    const visualPromptTemplates = {
      syncFromComfyWorkflow: jest.fn().mockResolvedValue({ id: 21 }),
    };
    const service = new ComfyWorkflowsService(
      {
        manager: {
          transaction: jest.fn(
            (callback: (value: typeof manager) => Promise<number>) =>
              callback(manager),
          ),
        },
      } as never,
      {} as never,
      { exists: jest.fn().mockResolvedValue(true) } as never,
      {} as never,
      visualPromptTemplates as never,
    );
    jest
      .spyOn(service, 'findOne')
      .mockResolvedValue({ id: 12 } as ComfyWorkflow);

    await service.create(
      {
        name: '示例工作流',
        connectionId: 1,
        outputType: 'image',
        targetModel: 'flux-dev',
        apiWorkflow: JSON.stringify({
          '1': {
            class_type: 'CLIPTextEncode',
            inputs: { text: 'cinematic cat' },
          },
          '2': {
            class_type: 'CLIPTextEncode',
            inputs: { text: 'blur, watermark' },
          },
          '3': { class_type: 'SaveImage', inputs: { images: ['4', 0] } },
        }),
        inputBindings: [
          {
            key: 'positivePrompt',
            label: '正向提示词',
            type: 'textarea',
            nodeId: '1',
            inputKey: 'text',
            semanticRole: 'positivePrompt',
          },
          {
            key: 'negativePrompt',
            label: '负向提示词',
            type: 'textarea',
            nodeId: '2',
            inputKey: 'text',
            semanticRole: 'negativePrompt',
          },
        ],
        outputNodeIds: ['3'],
      },
      7,
    );

    expect(visualPromptTemplates.syncFromComfyWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowName: '示例工作流',
        targetModel: 'flux-dev',
        positivePrompt: 'cinematic cat',
        negativePrompt: 'blur, watermark',
      }),
      7,
      manager,
    );
    expect(workflowRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ visualPromptTemplateId: 21 }),
    );
    const versionValue = versionRepository.create.mock.calls[0]?.[0];
    const graph = JSON.parse(String(versionValue?.apiWorkflow)) as Record<
      string,
      { inputs: Record<string, unknown> }
    >;
    expect(graph['1'].inputs.text).toBe('cinematic cat');
    expect(graph['2'].inputs.text).toBe('blur, watermark');
  });
});

describe('ComfyUI 工作流可用状态', () => {
  it('可从已保存工作流自动生成提示词总结草稿', async () => {
    const service = new ComfyWorkflowsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 8,
      name: '商品图工作流',
      outputType: 'image',
      targetModel: 'flux-dev',
      visualPromptTemplateId: 12,
      apiWorkflow: JSON.stringify({
        '1': {
          class_type: 'CLIPTextEncode',
          inputs: { text: 'product photography, soft light' },
        },
        '2': {
          class_type: 'CLIPTextEncode',
          inputs: { text: 'blur, watermark' },
        },
      }),
      inputBindings: [
        {
          key: 'positivePrompt',
          label: '正向提示词',
          type: 'textarea',
          nodeId: '1',
          inputKey: 'text',
          semanticRole: 'positivePrompt',
        },
        {
          key: 'negativePrompt',
          label: '负向提示词',
          type: 'textarea',
          nodeId: '2',
          inputKey: 'text',
          semanticRole: 'negativePrompt',
        },
      ],
    } as ComfyWorkflow);

    await expect(service.promptSummaryDraft(8)).resolves.toMatchObject({
      workflowId: 8,
      visualPromptTemplateId: 12,
      name: '商品图工作流 · 提示词总结',
      mediaType: 'image',
      targetModel: 'flux-dev',
      sourcePrompt: 'product photography, soft light',
      sourceNegativePrompt: 'blur, watermark',
    });
  });

  it('可按目标模型模糊过滤工作流', async () => {
    const queryBuilder = {
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const service = new ComfyWorkflowsService(
      { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.findAll({ targetModel: ' z_image_turbo ', page: 1 });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'workflow.targetModel LIKE :targetModel',
      { targetModel: '%z_image_turbo%' },
    );
  });

  it('启用的工作流会出现在创作选项中', async () => {
    const queryBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 1,
          name: '本机工作流',
          connectionId: 2,
          outputType: 'image',
          targetModel: null,
          description: null,
          version: 1,
          inputBindings: [],
          apiWorkflow: JSON.stringify({
            '1': { class_type: 'SaveImage', inputs: { images: ['2', 0] } },
            '2': {
              class_type: 'CustomPromptNode',
              inputs: { prompt: 'ordinary prompt' },
            },
          }),
          isEnabled: true,
        },
      ]),
    };
    const workflows = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const service = new ComfyWorkflowsService(
      workflows as never,
      {} as never,
      { find: jest.fn().mockResolvedValue([{ id: 2 }]) } as never,
      {} as never,
      {} as never,
    );

    const options = await service.options();
    expect(options).toHaveLength(1);
    expect(options[0]?.id).toBe(1);
    expect(options[0]?.name).toBe('本机工作流');
    expect(options[0]?.inputBindings).toEqual([
      expect.objectContaining({ semanticRole: 'mainPrompt' }),
    ]);
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'workflow.isEnabled = :isEnabled',
      { isEnabled: true },
    );
  });

  it('任务执行只校验工作流是否启用', async () => {
    const versions = {
      findOne: jest.fn().mockResolvedValue({
        id: 3,
        workflowId: 1,
        apiWorkflow: JSON.stringify({
          '1': { class_type: 'SaveImage', inputs: { images: ['2', 0] } },
        }),
        inputBindings: [],
      }),
    };
    const service = new ComfyWorkflowsService(
      {} as never,
      versions as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 1,
      version: 2,
      isEnabled: true,
    } as ComfyWorkflow);

    const result = await service.getRunnableVersion(1);
    expect(result.workflow.id).toBe(1);
    expect(result.version.id).toBe(3);
  });

  it('创作提示词直接使用工作流绑定模板和目标模型', async () => {
    const visualPromptTemplates = {
      submitBoundComposition: jest.fn().mockResolvedValue({
        id: 31,
        status: 'pending',
      }),
    };
    const service = new ComfyWorkflowsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      visualPromptTemplates as never,
    );
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 1,
      isEnabled: true,
      targetModel: 'flux-dev',
      visualPromptTemplateId: 21,
      inputBindings: [
        {
          key: 'motion',
          semanticRole: 'videoMotion',
        },
        {
          key: 'camera',
          semanticRole: 'cameraMotion',
        },
      ],
    } as ComfyWorkflow);

    const result = await service.composePrompt(
      1,
      { idea: '雨夜城市街道', requestId: 'compose-request' },
      7,
    );

    expect(visualPromptTemplates.submitBoundComposition).toHaveBeenCalledWith(
      21,
      {
        idea: '雨夜城市街道',
        targetModel: 'flux-dev',
        requestedOutputs: ['videoMotion', 'cameraMotion'],
      },
      7,
      1,
      'compose-request',
    );
    expect(result.status).toBe('pending');
  });
});
