import { Repository } from 'typeorm';
import { AiFeatureConfigsService } from '../ai-feature-configs/ai-feature-configs.service';
import { AiWorkflowsService } from '../ai-workflows/ai-workflows.service';
import { KnowledgeBaseCategory } from '../knowledge-bases/entities/knowledge-base-category.entity';
import { KnowledgeBase } from '../knowledge-bases/entities/knowledge-base.entity';
import { KnowledgeRetrievalConfig } from './entities/knowledge-retrieval-config.entity';
import { KnowledgeRetrievalConfigsService } from './knowledge-retrieval-configs.service';
import {
  getAiWorkflowDerivedFlags,
  getAiWorkflowExecutionPlan,
  normalizeAiWorkflowDefinition,
  validateAiWorkflowDefinition,
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
      {} as AiWorkflowsService,
    );

    const result = await service.create({ name: '默认检索配置' });

    expect(result.enableRerank).toBe(true);
    expect(result.sessionContextTimeoutMinutes).toBe(15);
    expect(result.rerankAiFeatureConfigId).toBe(3);
    expect(result.rerankAiFeatureConfigName).toBe('默认 LLM 重排配置');
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('uses the selected standalone workflow instead of replacing it with legacy flags', async () => {
    const create = jest.fn(
      (payload: Partial<KnowledgeRetrievalConfig>) => payload,
    );
    const service = new KnowledgeRetrievalConfigsService(
      { create, save: jest.fn((payload) => Promise.resolve(payload)) } as unknown as Repository<KnowledgeRetrievalConfig>,
      {} as Repository<KnowledgeBase>,
      {} as Repository<KnowledgeBaseCategory>,
      {} as AiFeatureConfigsService,
      {
        findUsable: jest.fn().mockResolvedValue({
          id: 8,
          name: '业务数据优先',
          workflowDefinition: {
            version: 2,
            nodes: [
              { id: 'preflight', type: 'preflight', enabled: true },
              { id: 'answer', type: 'answer', enabled: true },
            ],
            edges: [
              {
                id: 'direct-answer',
                source: 'preflight',
                target: 'answer',
                condition: 'always',
              },
            ],
          },
        }),
      } as unknown as AiWorkflowsService,
    );

    const result = await service.create({
      name: '业务客服检索配置',
      workflowId: 8,
    });

    expect(result).toEqual(
      expect.objectContaining({
        workflowId: 8,
        workflowName: '业务数据优先',
        enableKnowledgeRetrieval: false,
        enableRerank: false,
      }),
    );
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

    expect(definition.version).toBe(2);
    expect(definition.nodes).toHaveLength(8);
    expect(definition.edges.length).toBeGreaterThan(0);
    expect(getAiWorkflowDerivedFlags(definition)).toEqual(
      expect.objectContaining({
        enableKnowledgeRetrieval: false,
        enableRerank: false,
      }),
    );
  });

  it('derives execution stages from editable non-match branches', () => {
    const plan = getAiWorkflowExecutionPlan({
      version: 2,
      nodes: [
        { id: 'node-preflight', type: 'preflight', enabled: true },
        { id: 'node-standardQa', type: 'standardQa', enabled: true },
        { id: 'node-answer', type: 'answer', enabled: true },
      ],
      edges: [
        {
          id: 'preflight-to-qa',
          source: 'node-preflight',
          target: 'node-standardQa',
          condition: 'always',
        },
        {
          id: 'qa-hit-answer',
          source: 'node-standardQa',
          target: 'node-answer',
          condition: 'matched',
        },
        {
          id: 'qa-miss-answer',
          source: 'node-standardQa',
          target: 'node-answer',
          condition: 'unmatched',
        },
      ],
    });

    expect(plan).toEqual(
      expect.objectContaining({
        enableOriginalStandardQa: true,
        enableColloquial: false,
        enableKnowledgeRetrieval: false,
        enableRerank: false,
      }),
    );
  });

  it('rejects a workflow graph without a reachable answer node', () => {
    const definition = normalizeAiWorkflowDefinition({
      version: 2,
      nodes: [
        { id: 'node-preflight', type: 'preflight', enabled: true },
        { id: 'node-standardQa', type: 'standardQa', enabled: true },
        { id: 'node-answer', type: 'answer', enabled: true },
      ],
      edges: [
        {
          id: 'preflight-to-qa',
          source: 'node-preflight',
          target: 'node-standardQa',
          condition: 'always',
        },
      ],
    });

    expect(validateAiWorkflowDefinition(definition)).toContain(
      '工作流必须存在从输入清洗到回答生成的可达路径',
    );
  });

  it('keeps a v2 draft limited to the input-cleaning entry node', () => {
    const definition = normalizeAiWorkflowDefinition({
      version: 2,
      nodes: [{ id: 'node-preflight', type: 'preflight', enabled: true }],
      edges: [],
    });

    expect(definition.nodes).toEqual([
      expect.objectContaining({ id: 'node-preflight', type: 'preflight' }),
    ]);
    expect(validateAiWorkflowDefinition(definition)).toContain(
      '工作流必须包含输入清洗与回答生成节点',
    );
  });

  it('preserves optional edge ports used by the workflow canvas', () => {
    const definition = normalizeAiWorkflowDefinition({
      version: 2,
      nodes: [
        { id: 'node-preflight', type: 'preflight', enabled: true },
        { id: 'node-standardQa', type: 'standardQa', enabled: true },
      ],
      edges: [
        {
          id: 'preflight-to-qa',
          source: 'node-preflight',
          target: 'node-standardQa',
          condition: 'always',
          sourcePort: 'bottom',
          targetPort: 'top',
        },
      ],
    });

    expect(definition.edges[0]).toEqual(
      expect.objectContaining({ sourcePort: 'bottom', targetPort: 'top' }),
    );
  });

  it('preserves multiple node instances of the same type and enables a reachable instance', () => {
    const definition = normalizeAiWorkflowDefinition({
      version: 2,
      nodes: [
        { id: 'node-preflight', type: 'preflight', enabled: true },
        {
          id: 'node-retrieval-disabled',
          type: 'knowledgeRetrieval',
          enabled: false,
        },
        {
          id: 'node-retrieval-active',
          type: 'knowledgeRetrieval',
          enabled: true,
        },
        { id: 'node-answer', type: 'answer', enabled: true },
      ],
      edges: [
        {
          id: 'preflight-to-active-retrieval',
          source: 'node-preflight',
          target: 'node-retrieval-active',
          condition: 'always',
        },
        {
          id: 'active-retrieval-to-answer',
          source: 'node-retrieval-active',
          target: 'node-answer',
          condition: 'always',
        },
      ],
    });

    expect(
      definition.nodes.filter((node) => node.type === 'knowledgeRetrieval'),
    ).toHaveLength(2);
    expect(getAiWorkflowExecutionPlan(definition).enableKnowledgeRetrieval).toBe(
      true,
    );
  });
});
