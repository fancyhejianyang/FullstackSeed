import { Repository } from 'typeorm';
import { AiFeatureConfigsService } from '../ai-feature-configs/ai-feature-configs.service';
import { KnowledgeBaseCategory } from '../knowledge-bases/entities/knowledge-base-category.entity';
import { KnowledgeBase } from '../knowledge-bases/entities/knowledge-base.entity';
import { KnowledgeRetrievalConfig } from './entities/knowledge-retrieval-config.entity';
import { KnowledgeRetrievalConfigsService } from './knowledge-retrieval-configs.service';

describe('KnowledgeRetrievalConfigsService', () => {
  it('enables reranking and selects the active chat config by default', async () => {
    const create = jest.fn(
      (payload: Partial<KnowledgeRetrievalConfig>) => payload,
    );
    const save = jest.fn((payload: Partial<KnowledgeRetrievalConfig>) =>
      Promise.resolve(payload),
    );
    const service = new KnowledgeRetrievalConfigsService(
      { create, save } as unknown as Repository<KnowledgeRetrievalConfig>,
      {} as Repository<KnowledgeBase>,
      {} as Repository<KnowledgeBaseCategory>,
      {
        findEnabledByFeature: jest.fn().mockResolvedValue({
          id: 3,
          name: '默认聊天配置',
        }),
      } as unknown as AiFeatureConfigsService,
    );

    const result = await service.create({ name: '默认检索配置' });

    expect(result.enableRerank).toBe(true);
    expect(result.rerankAiFeatureConfigId).toBe(3);
    expect(result.rerankAiFeatureConfigName).toBe('默认聊天配置');
    expect(save).toHaveBeenCalledTimes(1);
  });
});
