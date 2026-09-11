import { Repository } from 'typeorm';
import { AiFeatureConfigsService } from '../ai-feature-configs/ai-feature-configs.service';
import { KnowledgeBaseCategory } from '../knowledge-bases/entities/knowledge-base-category.entity';
import { KnowledgeBase } from '../knowledge-bases/entities/knowledge-base.entity';
import { KnowledgeRetrievalConfig } from './entities/knowledge-retrieval-config.entity';
import { KnowledgeRetrievalConfigsService } from './knowledge-retrieval-configs.service';
import {
  getAiWorkflowDerivedFlags,
  normalizeAiWorkflowDefinition,
} from './workflow-definition';

describe('KnowledgeRetrievalConfigsService', () => {
  it('enables reranking and selects the active LLM rerank config by default', async () => {
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
          name: '默认 LLM 重排配置',
        }),
      } as unknown as AiFeatureConfigsService,
    );

    const result = await service.create({ name: '默认检索配置' });

    expect(result.enableRerank).toBe(true);
    expect(result.sessionContextTimeoutMinutes).toBe(15);
    expect(result.rerankAiFeatureConfigId).toBe(3);
    expect(result.rerankAiFeatureConfigName).toBe('默认 LLM 重排配置');
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('normalizes the workflow and prevents reranking without knowledge retrieval', () => {
    const definition = normalizeAiWorkflowDefinition(
      {
        version: 1,
        steps: [
          {
            id: 'knowledgeRetrieval',
            type: 'knowledgeRetrieval',
            enabled: false,
          },
          { id: 'rerank', type: 'rerank', enabled: true },
        ],
      },
      { enableRerank: true },
    );

    expect(definition.steps).toHaveLength(8);
    expect(getAiWorkflowDerivedFlags(definition)).toEqual(
      expect.objectContaining({
        enableKnowledgeRetrieval: false,
        enableRerank: false,
      }),
    );
  });
});
