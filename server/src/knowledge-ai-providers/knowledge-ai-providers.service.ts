import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { KnowledgeAiProvider } from './entities/knowledge-ai-provider.entity';
import {
  CreateKnowledgeAiProviderDto,
  QueryKnowledgeAiProviderDto,
  TestKnowledgeAiProviderDto,
  UpdateKnowledgeAiProviderDto,
} from './dto/knowledge-ai-provider.dto';

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string;
    };
  }>;
}

export interface KnowledgeAiChatCallPayload {
  id?: number;
  model?: string;
  question: string;
  systemPrompt?: string;
}

export interface KnowledgeAiChatCallResult {
  isSuccess: boolean;
  providerId: number;
  providerName: string;
  model: string;
  answer: string;
  errorMessage: string | null;
  elapsedMilliseconds: number;
}

@Injectable()
export class KnowledgeAiProvidersService {
  constructor(
    @InjectRepository(KnowledgeAiProvider)
    private readonly providerRepository: Repository<KnowledgeAiProvider>,
  ) {}

  async findAll(query: QueryKnowledgeAiProviderDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const keyword = query.keyword?.trim();
    const where = keyword
      ? [
          { name: Like(`%${keyword}%`) },
          { apiUrl: Like(`%${keyword}%`) },
          { description: Like(`%${keyword}%`) },
        ]
      : {};
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

  async callChat(
    payload: KnowledgeAiChatCallPayload,
  ): Promise<KnowledgeAiChatCallResult> {
    const startedAt = Date.now();
    let providerId = payload.id ?? 0;
    let providerName = '';
    let model = payload.model ?? '';
    try {
      const provider = payload.id
        ? await this.findEntity(payload.id)
        : await this.findEnabledEntity();
      providerId = provider.id;
      providerName = provider.name;
      if (!provider.isEnabled) {
        throw new BadRequestException('该大模型账号未启用');
      }
      if (!provider.secretKey) {
        throw new BadRequestException('该大模型账号未配置密钥');
      }

      model = this.resolveModel(provider.models, payload.model);
      const response = await fetch(this.buildChatUrl(provider), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: payload.systemPrompt?.trim()
                || '你是通用测试助手。请用简洁、准确的中文回答用户问题。',
            },
            {
              role: 'user',
              content: payload.question,
            },
          ],
          temperature: 0.2,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new BadRequestException(
          `模型接口调用失败：${response.status} ${errorText}`,
        );
      }

      const data = (await response.json()) as ChatCompletionResponse;
      const answer = data.choices?.[0]?.message?.content ?? '';
      if (!answer) {
        throw new BadRequestException('模型接口响应缺少 choices[0].message.content');
      }

      return {
        isSuccess: true,
        providerId,
        providerName,
        model,
        answer,
        errorMessage: null,
        elapsedMilliseconds: Date.now() - startedAt,
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
      };
    }
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
      throw new BadRequestException('当前存在多个已启用的大模型账号，请仅保留一个启用');
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
    if (dto.chatApiPath !== undefined || isCreate) {
      payload.chatApiPath = (dto.chatApiPath || 'v1/chat/completions').trim();
    }
    if (dto.secretKey !== undefined) {
      const secretKey = dto.secretKey.trim();
      if (secretKey || isCreate) {
        payload.secretKey = secretKey || null;
      }
    }
    if (dto.models !== undefined || isCreate) {
      payload.models = (dto.models || 'qwen-plus').trim();
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
      chatApiPath: provider.chatApiPath,
      models: provider.models ?? '',
      isEnabled: !!provider.isEnabled,
      description: provider.description ?? '',
      secretKeySet: !!provider.secretKey,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }

  private buildChatUrl(provider: KnowledgeAiProvider) {
    return `${provider.apiUrl.replace(/\/+$/, '')}/${(
      provider.chatApiPath || 'v1/chat/completions'
    ).replace(/^\/+/, '')}`;
  }

  private resolveModel(models: string | null, requested?: string) {
    const available = this.parseModels(models);
    if (!available.length) return requested || 'qwen-plus';
    if (!requested) return available[0].code;
    if (available.some((item) => item.code === requested)) return requested;
    throw new BadRequestException('调用模型不在该账号模型列表中');
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
}
