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
