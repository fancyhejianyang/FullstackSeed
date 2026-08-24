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

    const embeddingFeatureConfig =
      await this.aiFeatureConfigsService.findEnabledByFeature('embedding');
    if (!embeddingFeatureConfig) {
      throw new BadRequestException(
        '请先在 AI 功能配置中创建并启用“向量化”配置，选择大模型账号和支持 embeddings 的向量模型',
      );
    }
    if (!embeddingFeatureConfig.providerId || !embeddingFeatureConfig.model) {
      throw new BadRequestException(
        `AI 功能配置“${embeddingFeatureConfig.name}”缺少大模型账号或向量模型`,
      );
    }

    const target = await this.providersService.resolveEmbeddingTarget({
      id: embeddingFeatureConfig.providerId,
      model: embeddingFeatureConfig.model,
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
