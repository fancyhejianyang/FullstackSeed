import { BadRequestException, Injectable } from '@nestjs/common';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import { VectorConfigsService } from '../vector-configs/vector-configs.service';

@Injectable()
export class KnowledgeEmbeddingService {
  constructor(
    private readonly vectorConfigsService: VectorConfigsService,
    private readonly providersService: KnowledgeAiProvidersService,
  ) {}

  async embedDocuments(texts: string[]) {
    const normalized = texts.map((item) => item.trim()).filter(Boolean);
    if (!normalized.length) return [];

    const vectorConfig = await this.vectorConfigsService.findUsableConfig();
    if (!vectorConfig.providerId || !vectorConfig.model) {
      throw new BadRequestException(
        '请先在向量化配置中选择大模型账号和支持 embeddings 的向量模型',
      );
    }

    const target = await this.providersService.resolveEmbeddingTarget({
      id: vectorConfig.providerId,
      model: vectorConfig.model,
    });
    const embeddings = await this.providersService.callEmbedding({
      target,
      input: normalized,
      embeddingDimension: vectorConfig.embeddingDimension,
    });
    this.assertEmbeddingDimensions({
      embeddings,
      expectedDimension: vectorConfig.embeddingDimension,
      providerName: target.providerName,
      model: target.model,
    });
    return embeddings;
  }

  async embedQuery(text: string) {
    const [embedding] = await this.embedDocuments([text]);
    if (!embedding?.length) {
      throw new BadRequestException('向量模型未返回检索向量');
    }
    return embedding;
  }

  private assertEmbeddingDimensions(options: {
    embeddings: number[][];
    expectedDimension: number;
    providerName: string;
    model: string;
  }) {
    const actualDimensions = Array.from(
      new Set(options.embeddings.map((embedding) => embedding.length)),
    );
    if (actualDimensions.length !== 1 || !actualDimensions[0]) {
      throw new BadRequestException(
        `向量模型响应维度不一致：账号 ${options.providerName}，模型 ${options.model}，实际维度 ${actualDimensions.join(', ') || '空'}，请检查模型返回格式`,
      );
    }

    const actualDimension = actualDimensions[0];
    if (actualDimension === options.expectedDimension) return;

    throw new BadRequestException(
      `向量维度不匹配：向量化配置为 ${options.expectedDimension} 维，但账号 ${options.providerName} 的模型 ${options.model} 实际返回 ${actualDimension} 维。请将配置维度改为 ${actualDimension}；如果 Chroma 集合已按旧维度创建，请更换集合名称或清理旧集合后重新索引`,
    );
  }
}
