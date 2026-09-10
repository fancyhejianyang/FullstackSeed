import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { KnowledgeAiProvider } from './entities/knowledge-ai-provider.entity';
import { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import type { AiFeatureType } from '../ai-feature-configs/ai-feature-config.constants';
import { LogRecordsService } from '../log-records/log-records.service';
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
  constructor(
    @InjectRepository(KnowledgeAiProvider)
    private readonly providerRepository: Repository<KnowledgeAiProvider>,
    @InjectRepository(AiFeatureConfig)
    private readonly featureConfigRepository: Repository<AiFeatureConfig>,
    private readonly logRecordsService: LogRecordsService,
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
    return {
      list: list.map((item) => this.toView(item)),
      total,
    };
  }

  async findOne(id: number) {
    const provider = await this.providerRepository.findOne({ where: { id } });
    if (!provider) {
      throw new NotFoundException('大模型账号不存在');
    }
    return this.toView(provider);
  }

  create(dto: CreateKnowledgeAiProviderDto) {
    return this.providerRepository
      .save(this.providerRepository.create(this.toEntityPayload(dto, true)))
      .then((provider) => this.toView(provider));
  }

  async update(id: number, dto: UpdateKnowledgeAiProviderDto) {
    const provider = await this.findEntity(id);
    Object.assign(provider, this.toEntityPayload(dto, false));
    const saved = await this.providerRepository.save(provider);
    return this.toView(saved);
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

  async assertModelSupported(payload: {
    id: number;
    model: string;
    featureType: AiFeatureType;
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

  async validateModel(dto: ValidateKnowledgeAiProviderModelDto) {
    const provider = await this.findEntity(dto.id);
    const model = dto.model.trim();
    let currentProvider = provider;
    let disabledConfigCount = 0;
    try {
      const target = this.resolveFeatureTarget(provider, dto.featureType, model);
      const response =
        dto.featureType === 'embedding'
          ? await fetch(target.url, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${target.secretKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ model: target.model, input: ['模型可用性校验'] }),
            })
          : await fetch(target.url, {
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
          errorMessage: '模型不存在、未开通或当前账号不可用，已从账号模型列表移除。',
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

    return {
      providerId: provider.id,
      providerName: provider.name,
      workspaceId: provider.workspaceId ?? null,
      model: this.resolveModel(
        this.joinModelTexts(provider.models, provider.textModels),
        payload.model,
      ),
      url: this.buildChatUrl(provider),
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

    return {
      providerId: provider.id,
      providerName: provider.name,
      workspaceId: provider.workspaceId ?? null,
      model: this.resolveModel(
        this.joinModelTexts(provider.visionModels, provider.models),
        payload.model,
      ),
      url: this.buildChatUrl(provider),
      secretKey: this.normalizeSecretKey(provider.secretKey),
    };
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

    return {
      providerId: provider.id,
      providerName: provider.name,
      workspaceId: provider.workspaceId ?? null,
      model: this.resolveModel(embeddingModels, payload.model),
      url: this.buildEmbeddingUrl(provider),
      secretKey: this.normalizeSecretKey(provider.secretKey),
    };
  }

  private resolveFeatureTarget(
    provider: KnowledgeAiProvider,
    featureType: AiFeatureType,
    model: string,
  ): KnowledgeAiChatTarget {
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
    return {
      providerId: provider.id,
      providerName: provider.name,
      workspaceId: provider.workspaceId ?? null,
      model,
      url:
        featureType === 'embedding'
          ? this.buildEmbeddingUrl(provider)
          : this.buildChatUrl(provider),
      secretKey: this.normalizeSecretKey(provider.secretKey),
    };
  }

  private getFeatureModels(
    provider: KnowledgeAiProvider,
    featureType: AiFeatureType,
  ) {
    if (featureType === 'embedding') return provider.embeddingModels;
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
    provider.visionModels = this.removeModelFromList(provider.visionModels, model);
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
      const response = await fetch(target.url, {
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
          `模型接口调用失败：${response.status} ${errorText}；${this.buildTargetDebugInfo(target)}`,
        );
      }

      const data = (await response.json()) as ChatCompletionResponse;
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
      const response = await fetch(payload.target.url, {
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
      const response = await fetch(payload.target.url, {
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
          `视觉模型 OCR 调用失败：${response.status} ${errorText}；${this.buildTargetDebugInfo(payload.target)}`,
        );
      }

      const data = (await response.json()) as ChatCompletionResponse;
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
    const response = await fetch(target.url, {
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
        `向量模型调用失败：${response.status} ${errorText}；${this.buildTargetDebugInfo(target)}，请确认它是文本向量模型且在当前账号/地域可用`,
      );
    }

    const data = (await response.json()) as EmbeddingResponse;
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
    if (dto.chatApiPath !== undefined || isCreate) {
      payload.chatApiPath = (dto.chatApiPath || 'v1/chat/completions').trim();
    }
    if (dto.secretKey !== undefined) {
      const secretKey = this.normalizeSecretKey(dto.secretKey);
      if (secretKey || isCreate) {
        payload.secretKey = secretKey || null;
      }
    }
    if (dto.models !== undefined || isCreate) {
      payload.models = (dto.models || 'qwen-plus').trim();
    }
    if (dto.textModels !== undefined) {
      payload.textModels = this.toNullableText(dto.textModels);
    }
    if (dto.visionModels !== undefined) {
      payload.visionModels = this.toNullableText(dto.visionModels);
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

  private toView(provider: KnowledgeAiProvider) {
    return {
      id: provider.id,
      name: provider.name,
      apiUrl: provider.apiUrl,
      workspaceId: provider.workspaceId ?? '',
      chatApiPath: provider.chatApiPath,
      models: provider.models ?? '',
      textModels: provider.textModels ?? '',
      visionModels: provider.visionModels ?? '',
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
    const apiUrl = this.applyWorkspaceId(provider).replace(/\/+$/, '');
    const chatPath = provider.chatApiPath || 'v1/chat/completions';
    if (/\/chat\/completions$/.test(apiUrl)) return apiUrl;
    return this.appendApiPath(apiUrl, chatPath);
  }

  private buildEmbeddingUrl(provider: KnowledgeAiProvider) {
    const apiUrl = this.applyWorkspaceId(provider).replace(/\/+$/, '');
    if (/\/embeddings$/.test(apiUrl)) return apiUrl;
    if (/\/chat\/completions$/.test(apiUrl)) {
      return apiUrl.replace(/\/chat\/completions$/, '/embeddings');
    }
    return this.appendApiPath(apiUrl, 'v1/embeddings');
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

  private toSafeThinkingParameters(
    value?: Record<string, unknown> | null,
  ) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(value).filter(
        ([key]) =>
          !['model', 'messages', 'stream', 'stream_options', 'temperature'].includes(
            key.toLowerCase(),
          ),
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
    if (!available.length) return requested || 'qwen-plus';
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
    return (models || 'qwen-plus')
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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const result = this.consumeStreamBlock(block, onDelta, onThinkingDelta);
        answer += result.content;
        usage = result.usage ?? usage;
        if (result.isDone) return { answer, usage };
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      const result = this.consumeStreamBlock(buffer, onDelta, onThinkingDelta);
      answer += result.content;
      usage = result.usage ?? usage;
    }
    return { answer, usage };
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
