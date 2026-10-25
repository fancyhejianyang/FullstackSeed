import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AsyncLocalStorage } from 'node:async_hooks';
import { In, Like, Repository } from 'typeorm';
import { KnowledgeAiProvider } from './entities/knowledge-ai-provider.entity';
import { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import type {
  AiModelFeatureType,
  AiWebSearchMode,
} from '../ai-feature-configs/ai-feature-config.constants';
import { bailianResponsesUrl } from './knowledge-web-search.utils';
import { LogRecordsService } from '../log-records/log-records.service';
import { ModelEndpointsService } from '../model-endpoints/model-endpoints.service';
import {
  detectModelPlatform,
  FUNCTION_LABELS,
  mediaProtocol,
  type ModelFunction,
  protocolTaskMethod,
  modelCategory,
} from '../model-endpoints/model-endpoint.constants';
import type { ModelEndpoint } from '../model-endpoints/entities/model-endpoint.entity';
import { builtinModelEndpointPath } from '../model-endpoints/model-endpoint.builtins';
import { modelBillingErrorMessage } from '../common/ai/model-provider-error';
import {
  CreateKnowledgeAiProviderDto,
  QueryKnowledgeAiProviderDto,
  TestKnowledgeAiProviderDto,
  UpdateKnowledgeAiProviderDto,
  ValidateKnowledgeAiProviderModelDto,
} from './dto/knowledge-ai-provider.dto';

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      role?: string;
      content?: unknown;
      reasoning_content?: unknown;
    };
    delta?: {
      content?: unknown;
    };
    text?: unknown;
  }>;
  output_text?: unknown;
  output?: unknown;
  text?: unknown;
  answer?: unknown;
  usage?: unknown;
}

interface ChatCompletionStreamResponse {
  choices?: Array<{
    delta?: {
      content?: unknown;
      reasoning_content?: unknown;
      reasoning?: unknown;
    };
    message?: {
      content?: unknown;
      reasoning_content?: unknown;
      reasoning?: unknown;
    };
  }>;
  usage?: unknown;
}

interface EmbeddingResponse {
  data?: Array<{
    embedding?: unknown;
  }>;
  embeddings?: unknown;
  output?: unknown;
}

interface EmbeddingRequestBody {
  model: string;
  input: string[];
  dimensions?: number;
  encoding_format?: 'float';
}

export interface KnowledgeAiChatMessagePayload {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface KnowledgeAiChatCallPayload {
  id?: number;
  model?: string;
  question: string;
  systemPrompt?: string;
  messages?: KnowledgeAiChatMessagePayload[];
  /**
   * 仅供服务端内部调用覆盖默认采样温度。检索重排需要可复现结果，
   * 因此会显式传入 0；普通聊天仍保持原来的 0.2。
   */
  temperature?: number;
  /**
   * 仅由聊天 AI 功能配置提供的供应商特有 Think 参数。
   * 核心请求字段仍由服务端固定生成，不能被该对象覆盖。
   */
  thinkingParameters?: Record<string, unknown> | null;
}

export interface KnowledgeAiChatTargetPayload {
  id?: number;
  model?: string;
}

export interface ModelEndpointTestAccount {
  id: number;
  name: string;
  models?: Array<{ code: string; name: string }>;
  apiPath?: string;
}

export interface KnowledgeAiWebSearchTarget {
  model: string;
  functionType: 'webSearch';
  protocol: 'openaiResponses' | 'openaiChatSearch';
  executionMode: 'sync';
  taskMethod: 'GET';
  url: string;
  taskUrlTemplate: null;
  secretKey: string;
  functionLabel: string;
  source: 'configured' | 'builtin' | 'standard';
  ruleName: string;
}

export interface KnowledgeAiChatTarget {
  providerId: number;
  providerName: string;
  workspaceId: string | null;
  model: string;
  url: string;
  secretKey: string;
}

export interface KnowledgeAiChatStreamPayload {
  target: KnowledgeAiChatTarget;
  messages: KnowledgeAiChatMessagePayload[];
  temperature?: number;
  thinkingParameters?: Record<string, unknown> | null;
  onDelta: (content: string) => void;
  onThinkingDelta?: (content: string) => void;
}

export interface KnowledgeAiVisionOcrPayload {
  target: KnowledgeAiChatTarget;
  imageDataUrls: string[];
  systemPrompt?: string | null;
  temperature?: number;
  responseFormat?: string | null;
}

export interface KnowledgeAiEmbeddingPayload {
  target: KnowledgeAiChatTarget;
  input: string | string[];
  embeddingDimension?: number | null;
}

export interface KnowledgeAiChatCallResult {
  isSuccess: boolean;
  providerId: number;
  providerName: string;
  model: string;
  answer: string;
  errorMessage: string | null;
  elapsedMilliseconds: number;
  usage: KnowledgeAiTokenUsage | null;
}

export interface KnowledgeAiTokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

@Injectable()
export class KnowledgeAiProvidersService {
  private readonly executionSignal = new AsyncLocalStorage<AbortSignal>();

  /** 一轮问答中的提词、检索辅助和生成共用取消信号，不影响其它并发会话。 */
  withExecutionSignal<T>(
    signal: AbortSignal,
    run: () => Promise<T>,
  ): Promise<T> {
    const parentSignal = this.executionSignal.getStore();
    const composedSignal = parentSignal
      ? AbortSignal.any([parentSignal, signal])
      : signal;
    return this.executionSignal.run(composedSignal, run);
  }

  private fetchWithExecution(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const signal = this.executionSignal.getStore();
    signal?.throwIfAborted();
    return fetch(url, { ...init, ...(signal ? { signal } : {}) });
  }

  constructor(
    @InjectRepository(KnowledgeAiProvider)
    private readonly providerRepository: Repository<KnowledgeAiProvider>,
    @InjectRepository(AiFeatureConfig)
    private readonly featureConfigRepository: Repository<AiFeatureConfig>,
    private readonly logRecordsService: LogRecordsService,
    @Optional() private readonly endpoints?: ModelEndpointsService,
  ) {}

  async findAll(query: QueryKnowledgeAiProviderDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const keyword = query.keyword?.trim();
    const baseWhere =
      query.isEnabled !== undefined ? { isEnabled: query.isEnabled } : {};
    const where = keyword
      ? [
          { ...baseWhere, name: Like(`%${keyword}%`) },
          { ...baseWhere, apiUrl: Like(`%${keyword}%`) },
          { ...baseWhere, workspaceId: Like(`%${keyword}%`) },
          { ...baseWhere, description: Like(`%${keyword}%`) },
        ]
      : baseWhere;
    const [list, total] = await this.providerRepository.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const imageRoutes = (await this.endpoints?.imageRoutes()) ?? [];
    return {
      list: list.map((item) => this.toView(item, imageRoutes)),
      total,
    };
  }

  async findOne(id: number) {
    const provider = await this.providerRepository.findOne({ where: { id } });
    if (!provider) {
      throw new NotFoundException('大模型账号不存在');
    }
    return this.toView(provider, (await this.endpoints?.imageRoutes()) ?? []);
  }

  create(dto: CreateKnowledgeAiProviderDto) {
    return this.providerRepository
      .save(this.providerRepository.create(this.toEntityPayload(dto, true)))
      .then((provider) => this.toView(provider));
  }

  async update(id: number, dto: UpdateKnowledgeAiProviderDto) {
    await this.findEntity(id);
    const patch = this.toEntityPayload(dto, false);
    // 不保存查询时的整份旧实体，避免覆盖并发退役清理后的模型目录。
    if (Object.keys(patch).length)
      await this.providerRepository.update({ id }, patch);
    return this.toView(await this.findEntity(id));
  }

  async remove(id: number) {
    await this.findEntity(id);
    await this.providerRepository.softDelete(id);
    return { id };
  }

  async batchRemove(ids: number[]) {
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) return { ids: [] };
    const count = await this.providerRepository.count({
      where: { id: In(uniqueIds) },
    });
    if (count !== uniqueIds.length) {
      throw new NotFoundException('部分大模型账号不存在');
    }
    await this.providerRepository.softDelete(uniqueIds);
    return { ids: uniqueIds };
  }

  async test(dto: TestKnowledgeAiProviderDto) {
    return this.callChat(dto);
  }

  /** 仅由已验证的官方退役响应调用；行锁内局部更新，避免覆盖同时编辑的账号信息。 */
  async removeRetiredModel(payload: {
    providerId: number;
    model: string;
    url: string;
    secretKey: string;
  }): Promise<boolean> {
    const requested = new URL(payload.url);
    if (
      requested.protocol !== 'https:' ||
      detectModelPlatform(payload.url) === 'custom'
    )
      return false;
    return this.providerRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(KnowledgeAiProvider);
      const provider = await repository.findOne({
        where: { id: payload.providerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !provider ||
        !provider.isEnabled ||
        new URL(this.applyWorkspaceId(provider)).origin !== requested.origin ||
        this.normalizeSecretKey(provider.secretKey) !== payload.secretKey
      )
        return false;
      const patch: Partial<KnowledgeAiProvider> = {};
      const fields = [
        'models',
        'textModels',
        'visionModels',
        'imageGenerationModels',
        'videoGenerationModels',
        'embeddingModels',
      ] as const;
      for (const field of fields) {
        const value = provider[field];
        if (
          value
            ?.split(/\r?\n/)
            .some((line) => line.split('#')[0].trim() === payload.model)
        )
          patch[field] = this.removeModelFromList(value, payload.model);
      }
      if (Object.keys(patch).length)
        await repository.update({ id: provider.id }, patch);
      return true;
    });
  }

  async assertModelSupported(payload: {
    id: number;
    model: string;
    featureType: AiModelFeatureType;
  }) {
    const provider = await this.findEntity(payload.id);
    const model = payload.model.trim();
    const available = this.parseModels(
      this.getFeatureModels(provider, payload.featureType),
    );
    if (!available.some((item) => item.code === model)) {
      throw new BadRequestException(
        '所选模型不在当前大模型账号对应类型的模型列表中',
      );
    }
  }

  /** 编辑器只检查配置；不请求供应商、不修改账号目录或关联功能。 */
  async inspectFeatureEndpoint(payload: {
    id: number;
    model: string;
    featureType: AiModelFeatureType;
  }) {
    const provider = await this.findEntity(payload.id);
    const { endpoint, url, functionType } = await this.resolveFeatureEndpoint(
      provider,
      payload.featureType,
      payload.model.trim(),
    );
    return {
      functionType,
      functionLabel: FUNCTION_LABELS[functionType],
      source:
        endpoint?.source ??
        (endpoint ? ('configured' as const) : ('standard' as const)),
      ruleName:
        endpoint?.source === 'builtin'
          ? endpoint.modelName
          : endpoint
            ? `模型专用 · ${payload.model.trim()}（${FUNCTION_LABELS[functionType]}）`
            : '自定义平台标准接口',
      url,
    };
  }

  /** 功能编辑器测试与正式业务使用相同的目录、停用状态和模型功能解析。 */
  async resolveFeatureTestTarget(payload: {
    id: number;
    model: string;
    featureType: AiModelFeatureType;
  }) {
    const provider = await this.findEntity(payload.id);
    const model = payload.model.trim();
    if (!model || /[\s*?]/.test(model))
      throw new BadRequestException('请选择具体测试模型');
    const { endpoint, url, functionType } = await this.resolveFeatureEndpoint(
      provider,
      payload.featureType,
      model,
    );
    return {
      model,
      functionType,
      protocol:
        endpoint?.protocol ??
        (functionType === 'embedding'
          ? ('openaiEmbedding' as const)
          : ('openaiChat' as const)),
      executionMode: endpoint?.executionMode ?? ('sync' as const),
      taskMethod: endpoint
        ? protocolTaskMethod(endpoint.protocol)
        : ('GET' as const),
      url,
      taskUrlTemplate:
        endpoint?.taskApiPath && this.endpoints
          ? this.endpoints.buildUrl(
              this.applyWorkspaceId(provider),
              endpoint.taskApiPath,
            )
          : null,
      secretKey: this.normalizeSecretKey(provider.secretKey),
      functionLabel: FUNCTION_LABELS[functionType],
      source: endpoint?.source ?? ('standard' as const),
      ruleName:
        endpoint?.source === 'builtin'
          ? endpoint.modelName
          : endpoint
            ? `模型专用 · ${model}（${FUNCTION_LABELS[functionType]}）`
            : '自定义平台标准接口',
    };
  }

  /** 联网配置、真实测试与热点采集共用此解析，不从普通模型名称推断联网能力。 */
  async resolveWebSearchTarget(payload: {
    id: number;
    model: string;
    webSearchMode: AiWebSearchMode;
  }): Promise<KnowledgeAiWebSearchTarget> {
    const provider = await this.findEntity(payload.id);
    const secretKey = this.normalizeSecretKey(provider.secretKey);
    if (!provider.isEnabled || !secretKey)
      throw new BadRequestException('联网搜索账号未启用或未配置密钥');
    const model = payload.model.trim();
    if (!model || /[\s*?]/.test(model))
      throw new BadRequestException('联网搜索请选择具体模型');
    const available = this.parseModels(
      this.getFeatureModels(provider, 'topicDiscovery'),
    );
    if (!available.some((item) => item.code === model))
      throw new BadRequestException(
        '联网搜索模型未登记在账号普通文本模型目录中',
      );
    const platform = detectModelPlatform(provider.apiUrl);
    if (payload.webSearchMode === 'bailianResponses') {
      if (platform !== 'aliyunBailian')
        throw new BadRequestException('百炼联网方式不适用于当前账号平台');
      const target = await this.resolveFeatureTestTarget({
        id: payload.id,
        model,
        featureType: 'topicDiscovery',
      });
      let url: string;
      try {
        url = bailianResponsesUrl(target.url);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : '百炼联网搜索地址不可用',
        );
      }
      return {
        ...target,
        functionType: 'webSearch',
        protocol: 'openaiResponses',
        executionMode: 'sync',
        taskMethod: 'GET',
        taskUrlTemplate: null,
        url,
        secretKey,
        functionLabel: '联网搜索',
        ruleName: `${target.ruleName} · 百炼 Responses 联网搜索`,
      };
    }
    if (payload.webSearchMode !== 'tokenhubSearch')
      throw new BadRequestException('请选择已接入的原生联网搜索方式');
    if (platform !== 'tencentTokenhub')
      throw new BadRequestException('腾讯原生联网方式不适用于当前账号平台');
    const base = new URL(this.applyWorkspaceId(provider));
    if (
      base.protocol !== 'https:' ||
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      (base.port && base.port !== '443')
    )
      throw new BadRequestException(
        '腾讯联网搜索仅支持官方 HTTPS 标准端口地址',
      );
    const { endpoint, url } = await this.resolveFunctionEndpoint(
      provider,
      model,
      'webSearch',
    );
    if (
      !endpoint ||
      endpoint.source !== 'configured' ||
      !endpoint.isActive ||
      endpoint.functionType !== 'webSearch' ||
      endpoint.executionMode !== 'sync' ||
      !['openaiResponses', 'openaiChatSearch'].includes(endpoint.protocol)
    )
      throw new BadRequestException('当前模型的联网接口协议配置不受支持');
    const resolved = new URL(url);
    if (
      resolved.origin !== base.origin ||
      resolved.protocol !== 'https:' ||
      detectModelPlatform(url) !== 'tencentTokenhub'
    )
      throw new BadRequestException(
        '联网搜索接口必须与当前腾讯账号官方地址同源',
      );
    return {
      model,
      functionType: 'webSearch',
      protocol: endpoint.protocol as KnowledgeAiWebSearchTarget['protocol'],
      executionMode: 'sync',
      taskMethod: 'GET',
      taskUrlTemplate: null,
      url,
      secretKey,
      functionLabel: '联网搜索',
      source: 'configured',
      ruleName: `模型专用 · ${model}（联网搜索）`,
    };
  }

  async endpointTestAccounts(
    endpointId: number,
  ): Promise<ModelEndpointTestAccount[]> {
    const endpoint = await this.endpoints?.findOne(endpointId);
    if (!endpoint) throw new NotFoundException('模型调用接口不存在');
    const providers = await this.providerRepository.find({
      where: { isEnabled: true },
      order: { id: 'DESC' },
    });
    const builtin = endpoint.source === 'builtin';
    const overrides = builtin
      ? new Set(
          (
            await this.endpoints!.overriddenModels(
              endpoint.platformType,
              endpoint.functionType,
            )
          ).map((item) => item.modelCode),
        )
      : new Set<string>();
    return providers.flatMap((provider) => {
      if (
        !provider.isEnabled ||
        !this.normalizeSecretKey(provider.secretKey) ||
        detectModelPlatform(provider.apiUrl) !== endpoint.platformType
      )
        return [];
      if (builtin) {
        const models = this.endpointCatalog(provider, endpoint.functionType);
        const available = models.filter((item) => !overrides.has(item.code));
        return available.length
          ? [
              {
                id: provider.id,
                name: provider.name,
                models: available,
                apiPath: builtinModelEndpointPath(provider.apiUrl, endpoint),
              },
            ]
          : [];
      }
      // 专用卡片用于核实尚未登记的模型，开通情况由实际测试确认。
      return [{ id: provider.id, name: provider.name }];
    });
  }

  /** 测试只使用指定的已保存卡片，不接受客户端地址、密钥或其它模型。 */
  async resolveEndpointTestTarget(
    endpointId: number,
    providerId: number,
    selectedModel?: string,
  ) {
    const route = await this.endpoints?.findOne(endpointId);
    if (!route) throw new NotFoundException('模型调用接口不存在');
    const provider = await this.findEntity(providerId);
    if (detectModelPlatform(provider.apiUrl) !== route.platformType)
      throw new BadRequestException('测试账号与接口卡片的平台不一致');
    if (!provider.isEnabled || !this.normalizeSecretKey(provider.secretKey))
      throw new BadRequestException('测试账号未启用或未配置密钥');
    const model =
      route.source === 'builtin' ? selectedModel?.trim() : route.modelCode;
    if (!model || /[\s*?]/.test(model))
      throw new BadRequestException('请选择账号能力目录中的具体测试模型');
    if (
      route.source !== 'builtin' &&
      selectedModel &&
      selectedModel !== route.modelCode
    )
      throw new BadRequestException('专用卡片不能更换测试模型');
    if (
      route.source === 'builtin' &&
      !this.endpointCatalog(provider, route.functionType).some(
        (item) => item.code === model,
      )
    )
      throw new BadRequestException('测试模型未登记在账号对应能力目录中');
    const { endpoint, url } = await this.resolveFunctionEndpoint(
      provider,
      model,
      route.functionType,
    );
    if (!endpoint || endpoint.id !== endpointId)
      throw new BadRequestException(
        '该模型的实际匹配规则已变化或存在专用卡片，请到对应模型专用卡片测试',
      );
    return {
      model,
      functionType: endpoint.functionType,
      protocol: endpoint.protocol,
      executionMode: endpoint.executionMode,
      taskMethod: protocolTaskMethod(endpoint.protocol),
      url,
      taskUrlTemplate:
        endpoint.taskApiPath && this.endpoints
          ? this.endpoints.buildUrl(
              this.applyWorkspaceId(provider),
              endpoint.taskApiPath,
            )
          : null,
      secretKey: this.normalizeSecretKey(provider.secretKey),
    };
  }

  private endpointFeatureType(
    functionType: ModelFunction,
  ): AiModelFeatureType | null {
    const category = modelCategory(functionType);
    if (category === 'language' || category === 'search') return 'chat';
    if (category === 'understanding') return 'ocr';
    if (category === 'embedding') return 'embedding';
    if (category === 'image') return 'imageGeneration';
    if (category === 'video') return 'videoGeneration';
    // 新的 3D/语音仅开放卡片调试；账号尚无此类业务目录，以同平台认证和真实测试核实开通情况。
    return null;
  }

  private endpointCatalog(
    provider: KnowledgeAiProvider,
    functionType: ModelFunction,
  ) {
    const featureType = this.endpointFeatureType(functionType);
    const catalog =
      functionType === 'vision'
        ? provider.visionModels
        : featureType
          ? this.getFeatureModels(provider, featureType)
          : null;
    return catalog?.trim() ? this.parseModels(catalog) : [];
  }

  async validateModel(dto: ValidateKnowledgeAiProviderModelDto) {
    if (
      dto.featureType === 'imageGeneration' ||
      dto.featureType === 'videoGeneration'
    ) {
      throw new BadRequestException(
        '图片/视频生成模型不会通过文本接口自动校验，请在素材管理中明确发起实际生成',
      );
    }

    const provider = await this.findEntity(dto.id);
    const model = dto.model.trim();
    let currentProvider = provider;
    let disabledConfigCount = 0;
    try {
      const target = await this.resolveFeatureTarget(
        provider,
        dto.featureType,
        model,
      );
      const response =
        dto.featureType === 'embedding'
          ? await this.fetchWithExecution(target.url, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${target.secretKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: target.model,
                input: ['模型可用性校验'],
              }),
            })
          : await this.fetchWithExecution(target.url, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${target.secretKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(
                this.buildChatRequestBody({
                  model: target.model,
                  messages: [{ role: 'user', content: '请仅回复 OK。' }],
                  temperature: 0,
                }),
              ),
            });
      if (response.ok) {
        return {
          isAvailable: true,
          model,
          removed: false,
          disabledConfigCount,
          errorMessage: null,
          provider: this.toView(currentProvider),
        };
      }

      const errorMessage = await response.text();
      const billingMessage = modelBillingErrorMessage(errorMessage);
      if (billingMessage)
        return {
          isAvailable: false,
          model,
          removed: false,
          disabledConfigCount,
          errorMessage: billingMessage,
          provider: this.toView(currentProvider),
        };
      if (this.isMissingModelError(response.status, errorMessage)) {
        currentProvider = await this.removeMissingModel(provider, model);
        const result = await this.featureConfigRepository.update(
          { providerId: provider.id, model },
          { isEnabled: false },
        );
        disabledConfigCount = result.affected ?? 0;
        return {
          isAvailable: false,
          model,
          removed: true,
          disabledConfigCount,
          errorMessage:
            '模型不存在、未开通或当前账号不可用，已从账号模型列表移除。',
          provider: this.toView(currentProvider),
        };
      }

      return {
        isAvailable: false,
        model,
        removed: false,
        disabledConfigCount,
        errorMessage: `模型校验失败：${response.status} ${errorMessage.slice(0, 300)}`,
        provider: this.toView(currentProvider),
      };
    } catch (error) {
      return {
        isAvailable: false,
        model,
        removed: false,
        disabledConfigCount,
        errorMessage: error instanceof Error ? error.message : '模型校验失败',
        provider: this.toView(currentProvider),
      };
    }
  }

  async resolveChatTarget(
    payload: KnowledgeAiChatTargetPayload,
  ): Promise<KnowledgeAiChatTarget> {
    const provider = payload.id
      ? await this.findEntity(payload.id)
      : await this.findEnabledEntity();
    if (!provider.isEnabled) {
      throw new BadRequestException('该大模型账号未启用');
    }
    if (!provider.secretKey) {
      throw new BadRequestException('该大模型账号未配置密钥');
    }

    const model = this.resolveModel(
      this.joinModelTexts(provider.models, provider.textModels),
      payload.model,
    );
    return {
      providerId: provider.id,
      providerName: provider.name,
      workspaceId: provider.workspaceId ?? null,
      model,
      url: (await this.resolveFunctionEndpoint(provider, model, 'chat')).url,
      secretKey: this.normalizeSecretKey(provider.secretKey),
    };
  }

  async resolveVisionTarget(
    payload: KnowledgeAiChatTargetPayload,
  ): Promise<KnowledgeAiChatTarget> {
    const provider = payload.id
      ? await this.findEntity(payload.id)
      : await this.findEnabledEntity();
    if (!provider.isEnabled) {
      throw new BadRequestException('该大模型账号未启用');
    }
    if (!provider.secretKey) {
      throw new BadRequestException('该大模型账号未配置密钥');
    }

    const model = this.resolveModel(
      this.joinModelTexts(provider.visionModels, provider.models),
      payload.model,
    );
    return {
      providerId: provider.id,
      providerName: provider.name,
      workspaceId: provider.workspaceId ?? null,
      model,
      url: (await this.resolveFunctionEndpoint(provider, model, 'vision')).url,
      secretKey: this.normalizeSecretKey(provider.secretKey),
    };
  }

  /** 内容封面只使用同账号的生图目录；无配置时不发起任何计费调用。 */
  async resolveContentCoverTarget(providerId: number) {
    const provider = await this.findEntity(providerId);
    if (!provider.imageGenerationModels?.trim()) return null;
    const model = this.parseModels(provider.imageGenerationModels)[0]?.code;
    if (!model) return null;
    if (
      !(await this.endpoints?.resolve(
        detectModelPlatform(provider.apiUrl),
        model,
        'textToImage',
      ))
    )
      return null;
    return this.resolveMediaTarget(providerId, model, 'imageGeneration');
  }

  async resolveAgentMediaTarget(
    providerId: number,
    model: string,
    kind: 'vision' | 'imageGeneration' | 'videoGeneration',
  ) {
    return this.resolveMediaTarget(providerId, model, kind);
  }

  /** 媒体引用必须在专用目录内，不能回退到通用/文本模型。 */
  async resolveMediaTarget(
    providerId: number,
    model: string,
    kind: 'vision' | 'imageGeneration' | 'videoGeneration',
    functionType?: ModelFunction,
  ) {
    const provider = await this.findEntity(providerId);
    if (!provider.isEnabled || !provider.secretKey) {
      throw new BadRequestException('媒体模型账号未启用或未配置密钥');
    }
    const catalog =
      kind === 'vision'
        ? provider.visionModels
        : kind === 'videoGeneration'
          ? provider.videoGenerationModels
          : provider.imageGenerationModels;
    if (!catalog?.trim())
      throw new BadRequestException('账号未配置对应媒体模型目录');
    // 媒体目录为空/格式不合法时不得套用通用模型的默认回退。
    if (!this.parseModels(catalog).some((item) => item.code === model)) {
      throw new BadRequestException('调用模型不在该账号媒体模型列表中');
    }
    const selected = model;
    const operation =
      functionType ??
      (kind === 'vision'
        ? 'vision'
        : kind === 'imageGeneration'
          ? 'textToImage'
          : 'textToVideo');
    const allowed =
      kind === 'vision'
        ? ['vision']
        : kind === 'imageGeneration'
          ? ['textToImage', 'imageToImage']
          : [
              'textToVideo',
              'imageToVideo',
              'referenceToVideo',
              'startEndToVideo',
            ];
    if (!allowed.includes(operation))
      throw new BadRequestException('模型功能场景与能力目录不匹配');
    const { endpoint, url } = await this.resolveFunctionEndpoint(
      provider,
      selected,
      operation,
    );
    return {
      providerId: provider.id,
      providerName: provider.name,
      model: selected,
      url,
      secretKey: this.normalizeSecretKey(provider.secretKey),
      protocol: endpoint
        ? mediaProtocol(endpoint.protocol)
        : ('openai' as const),
      executionMode: endpoint?.executionMode ?? ('sync' as const),
      taskUrlTemplate:
        endpoint?.taskApiPath && this.endpoints
          ? this.endpoints.buildUrl(
              this.applyWorkspaceId(provider),
              endpoint.taskApiPath,
            )
          : null,
    };
  }

  private async resolveFunctionEndpoint(
    provider: KnowledgeAiProvider,
    model: string,
    functionType: ModelFunction,
  ) {
    const endpoint = await this.endpoints?.resolve(
      detectModelPlatform(provider.apiUrl),
      model,
      functionType,
    );
    if (
      endpoint?.source === 'builtin' &&
      !this.endpointCatalog(provider, functionType).some(
        (item) => item.code === model,
      )
    )
      throw new BadRequestException(
        '所选模型未登记在账号对应功能目录中，不能使用系统通用规则',
      );
    if (!endpoint && !['chat', 'vision', 'embedding'].includes(functionType))
      throw new BadRequestException(
        `模型 ${model} 缺少“${FUNCTION_LABELS[functionType]}”调用接口，请在第三方配置 → 模型厂商调用接口中配置`,
      );
    const url =
      endpoint && this.endpoints
        ? this.endpoints.buildUrl(
            this.applyWorkspaceId(provider),
            endpoint.source === 'builtin'
              ? builtinModelEndpointPath(provider.apiUrl, endpoint)
              : endpoint.apiPath,
          )
        : functionType === 'embedding'
          ? this.buildEmbeddingUrl(provider)
          : this.buildChatUrl(provider);
    return { endpoint, url };
  }

  async resolveEmbeddingTarget(
    payload: KnowledgeAiChatTargetPayload,
  ): Promise<KnowledgeAiChatTarget> {
    const provider = payload.id
      ? await this.findEntity(payload.id)
      : await this.findEnabledEntity();
    if (!provider.isEnabled) {
      throw new BadRequestException('该大模型账号未启用');
    }
    if (!provider.secretKey) {
      throw new BadRequestException('该大模型账号未配置密钥');
    }
    const embeddingModels = provider.embeddingModels?.trim();
    if (!embeddingModels) {
      throw new BadRequestException('该大模型账号未配置向量模型列表');
    }

    const model = this.resolveModel(embeddingModels, payload.model);
    return {
      providerId: provider.id,
      providerName: provider.name,
      workspaceId: provider.workspaceId ?? null,
      model,
      url: (await this.resolveFunctionEndpoint(provider, model, 'embedding'))
        .url,
      secretKey: this.normalizeSecretKey(provider.secretKey),
    };
  }

  private async resolveFeatureTarget(
    provider: KnowledgeAiProvider,
    featureType: AiModelFeatureType,
    model: string,
  ): Promise<KnowledgeAiChatTarget> {
    const { url } = await this.resolveFeatureEndpoint(
      provider,
      featureType,
      model,
    );
    return {
      providerId: provider.id,
      providerName: provider.name,
      workspaceId: provider.workspaceId ?? null,
      model,
      url,
      secretKey: this.normalizeSecretKey(provider.secretKey),
    };
  }

  private async resolveFeatureEndpoint(
    provider: KnowledgeAiProvider,
    featureType: AiModelFeatureType,
    model: string,
  ) {
    if (!provider.isEnabled) {
      throw new BadRequestException('该大模型账号未启用');
    }
    if (!provider.secretKey) {
      throw new BadRequestException('该大模型账号未配置密钥');
    }
    const available = this.parseModels(
      this.getFeatureModels(provider, featureType),
    );
    if (!available.some((item) => item.code === model)) {
      throw new BadRequestException(
        '所选模型不在当前大模型账号对应类型的模型列表中',
      );
    }
    const functionType: ModelFunction =
      featureType === 'imageGeneration'
        ? 'textToImage'
        : featureType === 'videoGeneration'
          ? 'textToVideo'
          : featureType === 'embedding'
            ? 'embedding'
            : featureType === 'ocr'
              ? 'vision'
              : 'chat';
    return {
      ...(await this.resolveFunctionEndpoint(provider, model, functionType)),
      functionType,
    };
  }

  private getFeatureModels(
    provider: KnowledgeAiProvider,
    featureType: AiModelFeatureType,
  ) {
    if (featureType === 'embedding') return provider.embeddingModels;
    if (featureType === 'imageGeneration')
      return provider.imageGenerationModels;
    if (featureType === 'videoGeneration')
      return provider.videoGenerationModels;
    if (featureType === 'ocr') {
      return this.joinModelTexts(provider.visionModels, provider.models);
    }
    return this.joinModelTexts(provider.models, provider.textModels);
  }

  private async removeMissingModel(
    provider: KnowledgeAiProvider,
    model: string,
  ) {
    provider.models = this.removeModelFromList(provider.models, model);
    provider.textModels = this.removeModelFromList(provider.textModels, model);
    provider.visionModels = this.removeModelFromList(
      provider.visionModels,
      model,
    );
    provider.imageGenerationModels = this.removeModelFromList(
      provider.imageGenerationModels,
      model,
    );
    provider.videoGenerationModels = this.removeModelFromList(
      provider.videoGenerationModels,
      model,
    );
    provider.embeddingModels = this.removeModelFromList(
      provider.embeddingModels,
      model,
    );
    return this.providerRepository.save(provider);
  }

  private removeModelFromList(models: string | null, model: string) {
    const remaining = (models || '')
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => item.split('#')[0].trim() !== model)
      .join('\n');
    return remaining || null;
  }

  private isMissingModelError(status: number, message: string) {
    const normalized = message.replace(/\s+/g, ' ').trim();
    return (
      status >= 400 &&
      /(?:model|模型).{0,50}(?:not found|does not exist|not exist|不存在|未找到|无效|不可用|unsupported)|(?:not found|不存在|未找到).{0,50}(?:model|模型)/i.test(
        normalized,
      )
    );
  }

  async callChat(
    payload: KnowledgeAiChatCallPayload,
  ): Promise<KnowledgeAiChatCallResult> {
    const startedAt = Date.now();
    let providerId = payload.id ?? 0;
    let providerName = '';
    let model = payload.model ?? '';
    try {
      const target = await this.resolveChatTarget(payload);
      providerId = target.providerId;
      providerName = target.providerName;
      model = target.model;
      const response = await this.fetchWithExecution(target.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${target.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          this.buildChatRequestBody({
            model,
            messages: payload.messages?.length
              ? payload.messages
              : this.buildQuestionMessages(payload),
            temperature: this.resolveTemperature(payload.temperature),
            thinkingParameters: payload.thinkingParameters,
          }),
        ),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new BadRequestException(
          modelBillingErrorMessage(errorText) ??
            `模型接口调用失败：${response.status} ${errorText}；${this.buildTargetDebugInfo(target)}`,
        );
      }

      const data = (await response.json()) as ChatCompletionResponse;
      const billingMessage = modelBillingErrorMessage(data);
      if (billingMessage) throw new BadRequestException(billingMessage);
      const answer = this.extractResponseContent(data);
      if (!answer) {
        throw new BadRequestException(
          '模型接口响应缺少 choices[0].message.content',
        );
      }

      return {
        isSuccess: true,
        providerId,
        providerName,
        model,
        answer,
        errorMessage: null,
        elapsedMilliseconds: Date.now() - startedAt,
        usage: this.extractTokenUsage(data),
      };
    } catch (error) {
      return {
        isSuccess: false,
        providerId,
        providerName,
        model,
        answer: '',
        errorMessage:
          error instanceof Error ? error.message : '模型接口调用失败',
        elapsedMilliseconds: Date.now() - startedAt,
        usage: null,
      };
    }
  }

  async callChatStream(
    payload: KnowledgeAiChatStreamPayload,
  ): Promise<KnowledgeAiChatCallResult> {
    const startedAt = Date.now();
    let answer = '';
    try {
      const response = await this.fetchWithExecution(payload.target.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${payload.target.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          this.buildChatRequestBody({
            model: payload.target.model,
            messages: payload.messages,
            temperature: this.resolveTemperature(payload.temperature),
            stream: true,
            thinkingParameters: payload.thinkingParameters,
          }),
        ),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new BadRequestException(
          modelBillingErrorMessage(errorText) ??
            `模型接口调用失败：${response.status} ${errorText}；${this.buildTargetDebugInfo(payload.target)}`,
        );
      }
      if (!response.body) {
        throw new BadRequestException('模型接口未返回流式响应内容');
      }

      const streamResult = await this.readChatStream(
        response.body,
        payload.onDelta,
        payload.onThinkingDelta,
      );
      answer = streamResult.answer;

      return {
        isSuccess: true,
        providerId: payload.target.providerId,
        providerName: payload.target.providerName,
        model: payload.target.model,
        answer,
        errorMessage: null,
        elapsedMilliseconds: Date.now() - startedAt,
        usage: streamResult.usage,
      };
    } catch (error) {
      return {
        isSuccess: false,
        providerId: payload.target.providerId,
        providerName: payload.target.providerName,
        model: payload.target.model,
        answer,
        errorMessage:
          error instanceof Error ? error.message : '模型接口流式调用失败',
        elapsedMilliseconds: Date.now() - startedAt,
        usage: null,
      };
    }
  }

  async callVisionOcr(
    payload: KnowledgeAiVisionOcrPayload,
  ): Promise<KnowledgeAiChatCallResult> {
    const startedAt = Date.now();
    try {
      const response = await this.fetchWithExecution(payload.target.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${payload.target.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: payload.target.model,
          messages: this.buildVisionOcrMessages(payload),
          temperature: this.resolveTemperature(payload.temperature),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new BadRequestException(
          modelBillingErrorMessage(errorText) ??
            `视觉模型 OCR 调用失败：${response.status} ${errorText}；${this.buildTargetDebugInfo(payload.target)}`,
        );
      }

      const data = (await response.json()) as ChatCompletionResponse;
      const billingMessage = modelBillingErrorMessage(data);
      if (billingMessage) throw new BadRequestException(billingMessage);
      const answer = this.extractResponseContent(data);
      if (!answer) {
        throw new BadRequestException(
          `视觉模型 OCR 响应缺少识别内容：${this.stringifyForError(data)}`,
        );
      }
      await this.recordAiModelCall('visionOcr', {
        target: payload.target,
        isSuccess: true,
        elapsedMilliseconds: Date.now() - startedAt,
        inputCount: payload.imageDataUrls.length,
      });

      return {
        isSuccess: true,
        providerId: payload.target.providerId,
        providerName: payload.target.providerName,
        model: payload.target.model,
        answer,
        errorMessage: null,
        elapsedMilliseconds: Date.now() - startedAt,
        usage: this.extractTokenUsage(data),
      };
    } catch (error) {
      await this.recordAiModelCall('visionOcr', {
        target: payload.target,
        isSuccess: false,
        elapsedMilliseconds: Date.now() - startedAt,
        inputCount: payload.imageDataUrls.length,
        errorMessage:
          error instanceof Error ? error.message : '视觉模型 OCR 调用失败',
      });
      return {
        isSuccess: false,
        providerId: payload.target.providerId,
        providerName: payload.target.providerName,
        model: payload.target.model,
        answer: '',
        errorMessage:
          error instanceof Error ? error.message : '视觉模型 OCR 调用失败',
        elapsedMilliseconds: Date.now() - startedAt,
        usage: null,
      };
    }
  }

  async callEmbedding(
    payload: KnowledgeAiEmbeddingPayload,
  ): Promise<number[][]> {
    const startedAt = Date.now();
    const input = Array.isArray(payload.input)
      ? payload.input
      : [payload.input];
    try {
      const batchSize = this.resolveEmbeddingBatchSize(payload.target);
      const embeddings: number[][] = [];
      for (const batch of this.chunkArray(input, batchSize)) {
        embeddings.push(
          ...(await this.callEmbeddingBatch(
            payload.target,
            batch,
            payload.embeddingDimension,
          )),
        );
      }
      await this.recordAiModelCall('embedding', {
        target: payload.target,
        isSuccess: true,
        elapsedMilliseconds: Date.now() - startedAt,
        inputCount: input.length,
        embeddingDimension: payload.embeddingDimension ?? null,
      });
      return embeddings;
    } catch (error) {
      await this.recordAiModelCall('embedding', {
        target: payload.target,
        isSuccess: false,
        elapsedMilliseconds: Date.now() - startedAt,
        inputCount: input.length,
        embeddingDimension: payload.embeddingDimension ?? null,
        errorMessage:
          error instanceof Error ? error.message : '向量模型调用失败',
      });
      throw error;
    }
  }

  private async callEmbeddingBatch(
    target: KnowledgeAiChatTarget,
    input: string[],
    embeddingDimension?: number | null,
  ): Promise<number[][]> {
    const response = await this.fetchWithExecution(target.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${target.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        this.buildEmbeddingRequestBody(target, input, embeddingDimension),
      ),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(
        modelBillingErrorMessage(errorText) ??
          `向量模型调用失败：${response.status} ${errorText}；${this.buildTargetDebugInfo(target)}，请确认它是文本向量模型且在当前账号/地域可用`,
      );
    }

    const data = (await response.json()) as EmbeddingResponse;
    const billingMessage = modelBillingErrorMessage(data);
    if (billingMessage) throw new BadRequestException(billingMessage);
    const embeddings = this.extractEmbeddings(data);
    if (embeddings.length !== input.length) {
      throw new BadRequestException(
        `向量模型响应数量不匹配：${this.stringifyForError(data)}`,
      );
    }
    return embeddings;
  }

  private buildEmbeddingRequestBody(
    target: KnowledgeAiChatTarget,
    input: string[],
    embeddingDimension?: number | null,
  ): EmbeddingRequestBody {
    const body: EmbeddingRequestBody = {
      model: target.model,
      input,
    };
    if (this.shouldUseAliyunTextEmbeddingOptions(target)) {
      body.dimensions = this.resolveEmbeddingDimension(embeddingDimension);
      body.encoding_format = 'float';
    }
    return body;
  }

  private resolveEmbeddingDimension(value?: number | null) {
    const dimension = Number(value);
    return Number.isFinite(dimension) && dimension > 0
      ? Math.trunc(dimension)
      : 768;
  }

  private shouldUseAliyunTextEmbeddingOptions(target: KnowledgeAiChatTarget) {
    if (!/aliyuncs|dashscope/i.test(target.url)) return false;
    return /^(qwen3\.7-text-embedding|text-embedding-v3|text-embedding-v4)$/i.test(
      target.model.trim(),
    );
  }

  private resolveEmbeddingBatchSize(target: KnowledgeAiChatTarget) {
    return /dashscope|aliyuncs/i.test(target.url) ? 10 : 50;
  }

  private async recordAiModelCall(
    action: 'visionOcr' | 'embedding',
    payload: {
      target: KnowledgeAiChatTarget;
      isSuccess: boolean;
      elapsedMilliseconds: number;
      inputCount: number;
      embeddingDimension?: number | null;
      errorMessage?: string | null;
    },
  ) {
    const actionLabel = action === 'embedding' ? '向量化' : '视觉 OCR';
    await this.logRecordsService
      .recordInternalAction({
        moduleId: 'ai-model-calls',
        action,
        recordId: payload.target.providerId,
        summary: `${payload.target.providerName} / ${payload.target.model}：${actionLabel}${payload.isSuccess ? '成功' : '失败'}`,
        isSuccess: payload.isSuccess,
        errorMessage: payload.errorMessage ?? null,
        afterData: {
          providerId: payload.target.providerId,
          providerName: payload.target.providerName,
          workspaceId: payload.target.workspaceId,
          model: payload.target.model,
          url: payload.target.url,
          inputCount: payload.inputCount,
          embeddingDimension: payload.embeddingDimension ?? null,
          elapsedMilliseconds: payload.elapsedMilliseconds,
        },
      })
      .catch(() => undefined);
  }

  private chunkArray<T>(items: T[], size: number) {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }

  private buildTargetDebugInfo(target: KnowledgeAiChatTarget) {
    return [
      `账号ID ${target.providerId}`,
      `账号 ${target.providerName}`,
      `业务空间 ${target.workspaceId || '-'}`,
      `模型 ${target.model}`,
      `请求地址 ${target.url}`,
      `密钥 ${this.maskSecretKey(target.secretKey)}`,
    ].join('，');
  }

  private maskSecretKey(secretKey: string | null | undefined) {
    const text = secretKey?.trim() ?? '';
    if (!text) return '未配置';
    const suffix = text.length > 4 ? text.slice(-4) : text;
    return `已配置，长度 ${text.length}，尾号 ${suffix}`;
  }

  private maskSecretKeyForView(secretKey: string | null | undefined) {
    const text = this.normalizeSecretKey(secretKey);
    if (!text) return '';
    const suffix = text.length > 4 ? text.slice(-4) : text;
    return `${'*'.repeat(Math.max(8, text.length - suffix.length))}${suffix}`;
  }

  private async findEntity(id: number) {
    const provider = await this.providerRepository.findOne({ where: { id } });
    if (!provider) {
      throw new NotFoundException('大模型账号不存在');
    }
    return provider;
  }

  private async findEnabledEntity() {
    const providers = await this.providerRepository.find({
      where: { isEnabled: true },
      order: { id: 'DESC' },
    });
    if (!providers.length) {
      throw new BadRequestException('未找到已启用的大模型账号');
    }
    if (providers.length > 1) {
      throw new BadRequestException(
        '当前存在多个已启用的大模型账号，请仅保留一个启用',
      );
    }
    return providers[0];
  }

  private toEntityPayload(
    dto: CreateKnowledgeAiProviderDto | UpdateKnowledgeAiProviderDto,
    isCreate: boolean,
  ): Partial<KnowledgeAiProvider> {
    const payload: Partial<KnowledgeAiProvider> = {};
    if (dto.name !== undefined) payload.name = dto.name.trim();
    if (dto.apiUrl !== undefined) payload.apiUrl = dto.apiUrl.trim();
    if (dto.workspaceId !== undefined) {
      payload.workspaceId = dto.workspaceId.trim() || null;
    }
    if (dto.secretKey !== undefined) {
      const secretKey = this.normalizeSecretKey(dto.secretKey);
      if (secretKey || isCreate) {
        payload.secretKey = secretKey || null;
      }
    }
    if (dto.models !== undefined || isCreate) {
      payload.models =
        dto.models === undefined ? 'qwen-plus' : (dto.models ?? '').trim();
    }
    if (dto.textModels !== undefined) {
      payload.textModels = this.toNullableText(dto.textModels);
    }
    if (dto.visionModels !== undefined) {
      payload.visionModels = this.toNullableText(dto.visionModels);
    }
    if (dto.imageGenerationModels !== undefined) {
      payload.imageGenerationModels = this.toNullableText(
        dto.imageGenerationModels,
      );
    }
    if (dto.videoGenerationModels !== undefined) {
      payload.videoGenerationModels = this.toNullableText(
        dto.videoGenerationModels,
      );
    }
    if (dto.embeddingModels !== undefined) {
      payload.embeddingModels = this.toNullableText(dto.embeddingModels);
    }
    if (dto.isEnabled !== undefined || isCreate) {
      payload.isEnabled = dto.isEnabled ?? true;
    }
    if (dto.description !== undefined) {
      payload.description = dto.description.trim();
    }
    return payload;
  }

  private toView(
    provider: KnowledgeAiProvider,
    imageRoutes: ModelEndpoint[] = [],
  ) {
    const platformType = detectModelPlatform(provider.apiUrl);
    const imageEndpointModels = this.parseModels(provider.imageGenerationModels)
      .filter(({ code }) => {
        const route = imageRoutes.find(
          (item) =>
            item.platformType === platformType && item.modelCode === code,
        );
        return !!route?.isActive;
      })
      .map(({ code }) => code);
    return {
      id: provider.id,
      name: provider.name,
      apiUrl: provider.apiUrl,
      platformType,
      imageEndpointModels,
      workspaceId: provider.workspaceId ?? '',
      models: provider.models ?? '',
      textModels: provider.textModels ?? '',
      visionModels: provider.visionModels ?? '',
      imageGenerationModels: provider.imageGenerationModels ?? '',
      videoGenerationModels: provider.videoGenerationModels ?? '',
      embeddingModels: provider.embeddingModels ?? '',
      isEnabled: !!provider.isEnabled,
      description: provider.description ?? '',
      secretKeySet: !!provider.secretKey,
      secretKeyMasked: this.maskSecretKeyForView(provider.secretKey),
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }

  private buildChatUrl(provider: KnowledgeAiProvider) {
    return this.buildStandardUrl(provider, 'chat/completions');
  }

  private buildEmbeddingUrl(provider: KnowledgeAiProvider) {
    return this.buildStandardUrl(provider, 'embeddings');
  }

  /** 标准协议缺省值只用于普通调用/识图/向量化，绝不推测生图或视频路径。 */
  private buildStandardUrl(
    provider: KnowledgeAiProvider,
    resource: 'chat/completions' | 'embeddings',
  ) {
    let base = this.applyWorkspaceId(provider).replace(/\/+$/, '');
    if (/\/(?:chat\/completions|embeddings)$/.test(base)) {
      return base.replace(
        /\/(?:chat\/completions|embeddings)$/,
        `/${resource}`,
      );
    }
    const url = new URL(base);
    if (
      detectModelPlatform(base) === 'aliyunBailian' &&
      ['/', '/api/v1'].includes(url.pathname)
    )
      base = `${url.origin}/compatible-mode/v1`;
    return this.appendApiPath(base, `v1/${resource}`);
  }

  private appendApiPath(baseUrl: string, path: string) {
    const base = baseUrl.replace(/\/+$/, '');
    let cleanPath = path.replace(/^\/+/, '');
    if (/\/v1$/i.test(base) && /^v1\//i.test(cleanPath)) {
      cleanPath = cleanPath.replace(/^v1\/+/i, '');
    }
    return `${base}/${cleanPath}`;
  }

  private applyWorkspaceId(provider: KnowledgeAiProvider) {
    const workspaceId = provider.workspaceId?.trim();
    if (!workspaceId) return provider.apiUrl;
    try {
      const url = new URL(provider.apiUrl);
      if (/\.maas\.aliyuncs\.com$/i.test(url.hostname)) {
        const parts = url.hostname.split('.');
        parts[0] = workspaceId;
        url.hostname = parts.join('.');
        return url.toString().replace(/\/+$/, '');
      }
    } catch {
      return provider.apiUrl;
    }
    return provider.apiUrl;
  }

  private buildQuestionMessages(
    payload: KnowledgeAiChatCallPayload,
  ): KnowledgeAiChatMessagePayload[] {
    return [
      {
        role: 'system',
        content:
          payload.systemPrompt?.trim() ||
          '你是通用测试助手。请用简洁、准确的中文回答用户问题。',
      },
      {
        role: 'user',
        content: payload.question,
      },
    ];
  }

  private buildChatRequestBody(payload: {
    model: string;
    messages: KnowledgeAiChatMessagePayload[];
    temperature: number;
    stream?: boolean;
    thinkingParameters?: Record<string, unknown> | null;
  }) {
    return {
      ...this.toSafeThinkingParameters(payload.thinkingParameters),
      model: payload.model,
      messages: payload.messages,
      temperature: payload.temperature,
      ...(payload.stream
        ? { stream: true, stream_options: { include_usage: true } }
        : {}),
    };
  }

  private toSafeThinkingParameters(value?: Record<string, unknown> | null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(value).filter(
        ([key]) =>
          ![
            'model',
            'messages',
            'stream',
            'stream_options',
            'temperature',
          ].includes(key.toLowerCase()),
      ),
    );
  }

  private resolveTemperature(value?: number) {
    if (!Number.isFinite(value)) return 0.2;
    return Math.min(2, Math.max(0, Number(value)));
  }

  private buildVisionOcrMessages(payload: KnowledgeAiVisionOcrPayload) {
    const prompt =
      payload.systemPrompt?.trim() ||
      '你是 OCR 文档识别助手。请识别图片中的全部文字，保持原文顺序，适合保存为知识库正文。';
    const formatMap: Record<string, string> = {
      text: '纯文本',
      markdown: 'Markdown',
      json: 'JSON',
    };
    const responseFormat =
      formatMap[payload.responseFormat || 'markdown'] || 'Markdown';
    return [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              prompt,
              `返回格式：${responseFormat}`,
              '请识别以下图片中的文字。只返回识别结果，不要添加解释。',
              '如果返回 Markdown，可保留标题、列表和表格结构。',
            ]
              .filter(Boolean)
              .join('\n'),
          },
          ...payload.imageDataUrls.map((url) => ({
            type: 'image_url',
            image_url: { url },
          })),
        ],
      },
    ];
  }

  private resolveModel(models: string | null, requested?: string) {
    const available = this.parseModels(models);
    if (!available.length)
      throw new BadRequestException('账号未配置可用模型，请先配置对应模型目录');
    if (!requested) return available[0].code;
    if (available.some((item) => item.code === requested)) return requested;
    throw new BadRequestException('调用模型不在该账号模型列表中');
  }

  private extractResponseContent(data: ChatCompletionResponse) {
    const firstChoice = data.choices?.[0];
    const output = this.asRecord(data.output);
    const outputChoices = Array.isArray(output?.choices)
      ? output.choices
      : undefined;
    const outputFirstChoice = this.asRecord(outputChoices?.[0]);
    const outputMessage = this.asRecord(outputFirstChoice?.message);

    return (
      this.readMessageContent(firstChoice?.message?.content) ||
      this.readMessageContent(firstChoice?.delta?.content) ||
      this.readMessageContent(firstChoice?.text) ||
      this.readMessageContent(data.output_text) ||
      this.readMessageContent(outputMessage?.content) ||
      this.readMessageContent(outputFirstChoice?.text) ||
      this.readMessageContent(output?.text) ||
      this.readMessageContent(data.text) ||
      this.readMessageContent(data.answer) ||
      ''
    );
  }

  private readMessageContent(content?: unknown): string {
    if (!content) return '';
    if (typeof content === 'string') return content.trim();
    if (typeof content === 'number' || typeof content === 'boolean') {
      return String(content);
    }
    return content
      ? Array.isArray(content)
        ? content
            .map((item) => this.readMessageContent(item))
            .filter(Boolean)
            .join('')
        : this.readObjectContent(content)
      : '';
  }

  private readObjectContent(content: unknown) {
    const record = this.asRecord(content);
    if (!record) return '';
    return (
      this.readMessageContent(record.text) ||
      this.readMessageContent(record.content) ||
      this.readMessageContent(record.value) ||
      ''
    ).trim();
  }

  private extractEmbeddings(data: EmbeddingResponse): number[][] {
    const direct = this.toEmbeddingList(data.embeddings);
    if (direct.length) return direct;

    const rows = Array.isArray(data.data) ? data.data : [];
    const embeddings = rows
      .map((item) => this.toEmbedding(item.embedding))
      .filter((item): item is number[] => Boolean(item?.length));
    if (embeddings.length) return embeddings;

    const output = this.asRecord(data.output);
    return this.toEmbeddingList(output?.embeddings);
  }

  private toEmbeddingList(value: unknown) {
    return Array.isArray(value)
      ? value
          .map((item) => this.toEmbedding(item))
          .filter((item): item is number[] => Boolean(item?.length))
      : [];
  }

  private toEmbedding(value: unknown) {
    if (!Array.isArray(value)) return null;
    const vector = value.map((item) => Number(item));
    return vector.every((item) => Number.isFinite(item)) ? vector : null;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;
  }

  private stringifyForError(value: unknown) {
    try {
      return JSON.stringify(value).slice(0, 1000);
    } catch {
      return '响应无法序列化';
    }
  }

  private parseModels(models: string | null) {
    return (models || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [code, name] = line.split('#');
        return {
          code: code.trim(),
          name: (name || code).trim(),
        };
      })
      .filter((item) => item.code);
  }

  private joinModelTexts(...values: Array<string | null | undefined>) {
    return values
      .map((item) => item?.trim())
      .filter(Boolean)
      .join('\n');
  }

  private toNullableText(value?: string) {
    const text = value?.trim() ?? '';
    return text || null;
  }

  private normalizeSecretKey(value?: string | null) {
    return (value ?? '')
      .trim()
      .replace(/^authorization\s*:\s*/i, '')
      .replace(/^bearer\s+/i, '')
      .trim();
  }

  private async readChatStream(
    body: ReadableStream<Uint8Array>,
    onDelta: (content: string) => void,
    onThinkingDelta?: (content: string) => void,
  ) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';
    let usage: KnowledgeAiTokenUsage | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          const result = this.consumeStreamBlock(
            block,
            onDelta,
            onThinkingDelta,
          );
          answer += result.content;
          usage = result.usage ?? usage;
          if (result.isDone) return { answer, usage };
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        const result = this.consumeStreamBlock(
          buffer,
          onDelta,
          onThinkingDelta,
        );
        answer += result.content;
        usage = result.usage ?? usage;
      }
      return { answer, usage };
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }

  private consumeStreamBlock(
    block: string,
    onDelta: (content: string) => void,
    onThinkingDelta?: (content: string) => void,
  ) {
    let content = '';
    let thinkingContent = '';
    let usage: KnowledgeAiTokenUsage | null = null;
    for (const line of block.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data) continue;
      if (data === '[DONE]') {
        return { content, thinkingContent, isDone: true, usage };
      }

      const parsed = JSON.parse(data) as ChatCompletionStreamResponse;
      const billingMessage = modelBillingErrorMessage(parsed);
      if (billingMessage) throw new BadRequestException(billingMessage);
      usage = this.extractTokenUsage(parsed) ?? usage;
      const choice = parsed.choices?.[0];
      const delta = this.readMessageContent(
        choice?.delta?.content ?? choice?.message?.content,
      );
      const reasoning = this.readMessageContent(
        choice?.delta?.reasoning_content ??
          choice?.delta?.reasoning ??
          choice?.message?.reasoning_content ??
          choice?.message?.reasoning,
      );
      if (reasoning) {
        thinkingContent += reasoning;
        onThinkingDelta?.(reasoning);
      }
      if (delta) {
        content += delta;
        onDelta(delta);
      }
    }
    return { content, thinkingContent, isDone: false, usage };
  }

  private extractTokenUsage(data: { usage?: unknown; output?: unknown }) {
    const output = this.asRecord(data.output);
    const usage = this.asRecord(data.usage) ?? this.asRecord(output?.usage);
    if (!usage) return null;
    const promptTokens = this.toTokenCount(
      usage.prompt_tokens ??
        usage.promptTokens ??
        usage.input_tokens ??
        usage.inputTokens,
    );
    const completionTokens = this.toTokenCount(
      usage.completion_tokens ??
        usage.completionTokens ??
        usage.output_tokens ??
        usage.outputTokens,
    );
    const totalTokens =
      this.toTokenCount(usage.total_tokens ?? usage.totalTokens) ??
      (promptTokens !== null && completionTokens !== null
        ? promptTokens + completionTokens
        : null);
    return promptTokens !== null ||
      completionTokens !== null ||
      totalTokens !== null
      ? { promptTokens, completionTokens, totalTokens }
      : null;
  }

  private toTokenCount(value: unknown) {
    const count = Number(value);
    return Number.isFinite(count) && count >= 0 ? Math.trunc(count) : null;
  }
}
