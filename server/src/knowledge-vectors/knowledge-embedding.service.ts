import { BadRequestException, Injectable } from '@nestjs/common';
import { AiFeatureConfigsService } from '../ai-feature-configs/ai-feature-configs.service';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';

@Injectable()
export class KnowledgeEmbeddingService {
  constructor(
    private readonly aiFeatureConfigsService: AiFeatureConfigsService,
    private readonly providersService: KnowledgeAiProvidersService,
  ) {}

  async embedDocuments(texts: string[]) {
    const normalized = texts.map((item) => item.trim()).filter(Boolean);
    if (!normalized.length) return [];

    const config =
      await this.aiFeatureConfigsService.findEnabledByFeature('embedding');
    if (!config) {
      throw new BadRequestException('请先配置并启用向量模型功能配置');
    }
    if (!config.providerId || !config.model) {
      throw new BadRequestException('向量模型功能配置缺少大模型账号或模型');
    }

    const target = await this.providersService.resolveEmbeddingTarget({
      id: config.providerId,
      model: config.model,
    });
    return this.providersService.callEmbedding({
      target,
      input: normalized,
    });
  }

  async embedQuery(text: string) {
    const [embedding] = await this.embedDocuments([text]);
    if (!embedding?.length) {
      throw new BadRequestException('向量模型未返回检索向量');
    }
    return embedding;
  }
}
