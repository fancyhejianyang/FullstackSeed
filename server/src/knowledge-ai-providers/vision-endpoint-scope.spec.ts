import type { Repository } from 'typeorm';
import type { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import type { LogRecordsService } from '../log-records/log-records.service';
import { ModelEndpoint } from '../model-endpoints/entities/model-endpoint.entity';
import type { PlatformType } from '../model-endpoints/model-endpoint.constants';
import { ModelEndpointsService } from '../model-endpoints/model-endpoints.service';
import { KnowledgeAiProvider } from './entities/knowledge-ai-provider.entity';
import { KnowledgeAiProvidersService } from './knowledge-ai-providers.service';

const platforms = [
  ['阿里百炼', 'aliyunBailian', 'https://dashscope.aliyuncs.com'],
  ['腾讯 TokenHub', 'tencentTokenhub', 'https://tokenhub.tencentmaas.com/v1'],
  ['自定义平台', 'custom', 'https://gateway.example/proxy/v1'],
] as const;
const model = 'selected-vision-model';
const dedicatedPath = '/vendor/model-specific/vision';

function harness(platformType: PlatformType, apiUrl: string) {
  const rows: ModelEndpoint[] = [];
  const endpointRepository = {
    findOne: jest.fn(({ where }: { where: Partial<ModelEndpoint> }) =>
      Promise.resolve(
        rows.find(
          (row) =>
            !row.deletedAt &&
            Object.entries(where).every(
              ([key, value]) => row[key as keyof ModelEndpoint] === value,
            ),
        ) ?? null,
      ),
    ),
  };
  const endpoints = new ModelEndpointsService(
    endpointRepository as unknown as Repository<ModelEndpoint>,
  );
  const provider = Object.assign(new KnowledgeAiProvider(), {
    id: 1,
    name: '识图账号',
    apiUrl,
    isEnabled: true,
    secretKey: 'test-key-not-for-network',
    models: 'chat-model',
    textModels: 'chat-model',
    visionModels: model,
    embeddingModels: 'text-embedding-model',
  });
  const providers = new KnowledgeAiProvidersService(
    {
      findOne: jest.fn().mockResolvedValue(provider),
    } as unknown as Repository<KnowledgeAiProvider>,
    {} as Repository<AiFeatureConfig>,
    {} as LogRecordsService,
    endpoints,
  );
  const addVisionCard = (isActive = true) => {
    const card = Object.assign(new ModelEndpoint(), {
      id: 11,
      platformType,
      modelCode: model,
      modelName: '模型专用识图接口',
      functionType: 'vision',
      protocol: 'openaiChat',
      apiPath: dedicatedPath,
      taskApiPath: '',
      executionMode: 'sync',
      isActive,
    });
    rows.push(card);
    return card;
  };
  return { providers, provider, addVisionCard, endpointRepository };
}

function entrypoints(providers: KnowledgeAiProvidersService) {
  return [
    () =>
      providers.inspectFeatureEndpoint({
        id: 1,
        model,
        featureType: 'ocr',
      }),
    () =>
      providers.resolveFeatureTestTarget({
        id: 1,
        model,
        featureType: 'ocr',
      }),
    () => providers.resolveVisionTarget({ id: 1, model }),
    () => providers.resolveAgentMediaTarget(1, model, 'vision'),
  ];
}

describe('识图必须使用模型专用接口卡片', () => {
  it.each(platforms)(
    '%s 的编辑检查、功能测试、OCR 和 Agent 均拒绝无专用卡识图',
    async (_label, platformType, apiUrl) => {
      const { providers, endpointRepository } = harness(platformType, apiUrl);
      for (const resolve of entrypoints(providers)) {
        await expect(resolve()).rejects.toThrow('识别图片');
      }
      expect(endpointRepository.findOne).toHaveBeenCalledTimes(4);
      expect(endpointRepository.findOne).toHaveBeenLastCalledWith({
        where: { platformType, modelCode: model, functionType: 'vision' },
      });
    },
  );

  it.each(platforms)(
    '%s 的四个识图入口使用启用的专用卡路径而非 Chat 标准路径',
    async (_label, platformType, apiUrl) => {
      const { providers, addVisionCard } = harness(platformType, apiUrl);
      addVisionCard();
      const url = new URL(apiUrl).origin + dedicatedPath;
      for (const resolve of entrypoints(providers)) {
        await expect(resolve()).resolves.toMatchObject({ url });
      }
      await expect(
        providers.inspectFeatureEndpoint({
          id: 1,
          model,
          featureType: 'ocr',
        }),
      ).resolves.toMatchObject({
        functionType: 'vision',
        source: 'configured',
      });
      await expect(
        providers.resolveFeatureTestTarget({
          id: 1,
          model,
          featureType: 'ocr',
        }),
      ).resolves.toMatchObject({
        functionType: 'vision',
        source: 'configured',
      });
    },
  );

  it.each(platforms)(
    '%s 的专用识图卡停用后所有入口均拒绝且不回退',
    async (_label, platformType, apiUrl) => {
      const { providers, addVisionCard } = harness(platformType, apiUrl);
      addVisionCard(false);
      for (const resolve of entrypoints(providers)) {
        await expect(resolve()).rejects.toThrow('调用接口已停用');
      }
      await expect(providers.resolveEndpointTestTarget(11, 1)).rejects.toThrow(
        '调用接口已停用',
      );
    },
  );

  it.each(platforms)(
    '%s 的识图专用卡调试不要求先登记目录，Agent 正式调用仍要求 visionModels',
    async (_label, platformType, apiUrl) => {
      const { providers, provider, addVisionCard } = harness(
        platformType,
        apiUrl,
      );
      addVisionCard();
      provider.models = '';
      provider.textModels = '';
      provider.visionModels = '';
      await expect(
        providers.resolveEndpointTestTarget(11, 1),
      ).resolves.toMatchObject({
        model,
        functionType: 'vision',
        url: new URL(apiUrl).origin + dedicatedPath,
      });
      await expect(
        providers.resolveAgentMediaTarget(1, model, 'vision'),
      ).rejects.toThrow('对应媒体模型目录');
      provider.visionModels = 'another-vision-model';
      await expect(
        providers.resolveAgentMediaTarget(1, model, 'vision'),
      ).rejects.toThrow('不在该账号媒体模型列表');
      provider.visionModels = model;
      await expect(
        providers.resolveAgentMediaTarget(1, model, 'vision'),
      ).resolves.toMatchObject({
        model,
        url: new URL(apiUrl).origin + dedicatedPath,
      });
    },
  );

  it('保留 OCR 对旧 models 目录的兼容，但仍必须有识图专用卡且不能借给 Agent 媒体目录', async () => {
    const { providers, provider, addVisionCard } = harness(
      'aliyunBailian',
      'https://dashscope.aliyuncs.com',
    );
    provider.models = model;
    provider.visionModels = '';
    await expect(
      providers.resolveVisionTarget({ id: 1, model }),
    ).rejects.toThrow('识别图片');
    addVisionCard();
    const url = 'https://dashscope.aliyuncs.com' + dedicatedPath;
    // 前三个入口沿用 OCR 旧目录；第四个 Agent 入口必须使用显式媒体目录。
    for (const resolve of entrypoints(providers).slice(0, 3)) {
      await expect(resolve()).resolves.toMatchObject({ url });
    }
    await expect(
      providers.resolveAgentMediaTarget(1, model, 'vision'),
    ).rejects.toThrow('对应媒体模型目录');
  });
});
