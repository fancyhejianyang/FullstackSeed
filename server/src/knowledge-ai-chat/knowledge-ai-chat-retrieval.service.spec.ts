import { Repository } from 'typeorm';
import { AiFeatureConfigsService } from '../ai-feature-configs/ai-feature-configs.service';
import { KnowledgeBaseChunk } from '../knowledge-bases/entities/knowledge-base-chunk.entity';
import { KnowledgeBaseDocument } from '../knowledge-bases/entities/knowledge-base-document.entity';
import { KnowledgeBase } from '../knowledge-bases/entities/knowledge-base.entity';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import { KnowledgeRetrievalConfig } from '../knowledge-retrieval-configs/entities/knowledge-retrieval-config.entity';
import { KnowledgeRetrievalConfigsService } from '../knowledge-retrieval-configs/knowledge-retrieval-configs.service';
import { KnowledgeEmbeddingService } from '../knowledge-vectors/knowledge-embedding.service';
import { KnowledgeVectorService } from '../knowledge-vectors/knowledge-vector.service';
import {
  KnowledgeAiChatRetrievalService,
  type KnowledgeRetrievalOptions,
} from './knowledge-ai-chat-retrieval.service';

interface Candidate {
  key: string;
  chunkId: number | null;
  title: string;
  content: string;
  knowledgeBaseId: number;
  knowledgeBaseName: string;
  sourceName: string;
  hitKeywords: string;
  colloquialDescription: string;
  matchPriority: number;
  score: number;
}

interface RetrievalInternals {
  buildRetrievalPlan: (
    question: string,
    bases: KnowledgeBase[],
    options: KnowledgeRetrievalOptions,
  ) => {
    query: string;
    queryRewritten: boolean;
    routedKnowledgeBaseIds: number[];
    activeKnowledgeBaseId: number | null;
    inventoryQuery: boolean;
  };
  fuseCandidates: (
    textCandidates: Candidate[],
    vectorCandidates: Candidate[],
    options: { textWeight: number; vectorWeight: number; rrfK: number },
  ) => Array<Candidate & { textScore: number; vectorScore: number }>;
  parseRerankScores: (value: string) => Map<string, number>;
  buildSearchTerms: (question: string) => string[];
  scoreTextCandidate: (
    candidate: Omit<Candidate, 'score'>,
    question: string,
  ) => number;
  selectContextCandidates: (
    candidates: Array<
      Candidate & {
        textScore: number;
        vectorScore: number;
        rerankScore: number | null;
      }
    >,
    topK: number,
  ) => Candidate[];
  rerankCandidates: (
    question: string,
    candidates: Array<
      Candidate & {
        textScore: number;
        vectorScore: number;
        rerankScore: number | null;
      }
    >,
    config: KnowledgeRetrievalConfig,
  ) => Promise<{
    candidates: Array<Candidate & { rerankScore: number | null }>;
    applied: boolean;
  }>;
}

describe('KnowledgeAiChatRetrievalService', () => {
  let internals: RetrievalInternals;
  let providerCall: jest.Mock;

  beforeEach(() => {
    providerCall = jest.fn();
    const service = new KnowledgeAiChatRetrievalService(
      {} as Repository<KnowledgeBase>,
      {} as Repository<KnowledgeBaseDocument>,
      {} as Repository<KnowledgeBaseChunk>,
      {} as KnowledgeRetrievalConfigsService,
      {} as KnowledgeEmbeddingService,
      {} as KnowledgeVectorService,
      {
        findUsableChatConfig: jest
          .fn()
          .mockResolvedValue({ providerId: 3, model: 'rerank-model' }),
        findEnabledByFeature: jest.fn().mockResolvedValue({
          id: 3,
          name: '默认聊天配置',
          providerId: 3,
          model: 'rerank-model',
        }),
      } as unknown as AiFeatureConfigsService,
      { callChat: providerCall } as unknown as KnowledgeAiProvidersService,
    );
    internals = service as unknown as RetrievalInternals;
  });

  it('keeps an implicit follow-up in the active knowledge base', () => {
    const plan = internals.buildRetrievalPlan(
      '该校的师资团队怎么样？',
      [
        buildBase(1, '中国科学院大学'),
        buildBase(2, '深圳大学', {
          hitKeywords: '师资、团队',
          colloquialDescription: '教师团队',
          description: '学校师资团队介绍',
        }),
      ],
      {
        hasHistory: true,
        previousQuery: '中国科学院大学的学校简介',
        preferredKnowledgeBaseId: 1,
      },
    );

    expect(plan.queryRewritten).toBe(true);
    expect(plan.query).toContain('中国科学院大学');
    expect(plan.query).toContain('该校的师资团队怎么样');
    expect(plan.routedKnowledgeBaseIds).toEqual([1]);
  });

  it('switches away from the active knowledge base for an explicit new topic', () => {
    const plan = internals.buildRetrievalPlan(
      '深圳大学的兵役政策是什么？',
      [buildBase(1, '中国科学院大学'), buildBase(2, '深圳大学')],
      {
        hasHistory: true,
        previousQuery: '中国科学院大学的学校简介',
        preferredKnowledgeBaseId: 1,
      },
    );

    expect(plan.queryRewritten).toBe(false);
    expect(plan.routedKnowledgeBaseIds).toEqual([2]);
    expect(plan.activeKnowledgeBaseId).toBe(2);
  });

  it('recognizes a shortened university name regardless of database order', () => {
    const plan = internals.buildRetrievalPlan(
      '深圳大学入学材料有哪些？',
      [
        buildBase(10, '吉林长春理工大学入学手册', {
          hitKeywords: '长春理工大学入学',
        }),
        buildBase(11, '南京审计大学入学手册'),
        buildBase(12, '深圳大学学生入学手册'),
      ],
      {},
    );

    expect(plan.routedKnowledgeBaseIds).toEqual([12]);
    expect(plan.activeKnowledgeBaseId).toBe(12);
  });

  it('does not lock a session for generic terms shared by many bases', () => {
    const plan = internals.buildRetrievalPlan(
      '大学入学手册',
      [
        buildBase(10, '吉林长春理工大学入学手册'),
        buildBase(11, '南京审计大学入学手册'),
        buildBase(12, '深圳大学学生入学手册'),
      ],
      {},
    );

    expect(plan.routedKnowledgeBaseIds).toEqual([10, 11, 12]);
    expect(plan.activeKnowledgeBaseId).toBeNull();
  });

  it('routes knowledge-base inventory questions to the configured scope', () => {
    const plan = internals.buildRetrievalPlan(
      '其他的大学入学手册有哪些？',
      [
        buildBase(10, '吉林长春理工大学入学手册'),
        buildBase(11, '南京审计大学入学手册'),
        buildBase(12, '深圳大学学生入学手册'),
      ],
      { hasHistory: true, preferredKnowledgeBaseId: 11 },
    );

    expect(plan.inventoryQuery).toBe(true);
    expect(plan.routedKnowledgeBaseIds).toEqual([10, 11, 12]);
    expect(plan.activeKnowledgeBaseId).toBeNull();
  });

  it('keeps fused scores normalized and preserves component scores', () => {
    const textCandidate = buildCandidate(0.8);
    const vectorCandidate = buildCandidate(0.7);
    const [result] = internals.fuseCandidates(
      [textCandidate],
      [vectorCandidate],
      { textWeight: 0.8, vectorWeight: 1, rrfK: 60 },
    );

    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.textScore).toBe(0.8);
    expect(result.vectorScore).toBe(0.7);
  });

  it('parses fenced rerank results and clamps invalid score ranges', () => {
    const scores = internals.parseRerankScores(
      '```json\n[{"id":"chunk:1","score":0.82},{"id":"chunk:2","score":2}]\n```',
    );

    expect(scores.get('chunk:1')).toBe(0.82);
    expect(scores.get('chunk:2')).toBe(1);
  });

  it('drops weaker knowledge bases when one base clearly leads', () => {
    const candidates = [
      buildFusedCandidate('chunk:1', 1, 0.82),
      buildFusedCandidate('chunk:2', 1, 0.7),
      buildFusedCandidate('chunk:3', 2, 0.55),
    ];

    const selected = internals.selectContextCandidates(candidates, 6);

    expect(selected.map((item) => item.knowledgeBaseId)).toEqual([1, 1]);
  });

  it('removes conversational filler and scores keyword matches above noise', () => {
    const terms = internals.buildSearchTerms('该校的兵役相关描述是什么？');
    const relevant = buildCandidate(0);
    const irrelevant = {
      ...buildCandidate(0),
      title: '校园活动',
      content: '校园活动安排',
      hitKeywords: '',
    };
    relevant.hitKeywords = '兵役';

    expect(terms).toContain('兵役');
    expect(terms).not.toContain('相关');
    expect(
      internals.scoreTextCandidate(relevant, '该校的兵役相关描述是什么？'),
    ).toBeGreaterThan(
      internals.scoreTextCandidate(irrelevant, '该校的兵役相关描述是什么？'),
    );
  });

  it('invokes the selected chat config when reranking is enabled', async () => {
    providerCall.mockResolvedValue({
      isSuccess: true,
      answer: '[{"id":"chunk:1","score":0.93}]',
    });

    const result = await internals.rerankCandidates(
      '兵役政策',
      [buildFusedCandidate('chunk:1', 1, 0.7)],
      {
        enableRerank: true,
        rerankAiFeatureConfigId: 8,
      } as KnowledgeRetrievalConfig,
    );

    expect(providerCall).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3, model: 'rerank-model' }),
    );
    expect(result.applied).toBe(true);
    expect(result.candidates[0].rerankScore).toBe(0.93);
    expect(result.candidates[0].score).toBeGreaterThan(0.7);
  });

  it('falls back to the enabled chat config for default reranking', async () => {
    providerCall.mockResolvedValue({
      isSuccess: true,
      answer: '[{"id":"chunk:1","score":0.88}]',
    });

    const result = await internals.rerankCandidates(
      '兵役政策',
      [buildFusedCandidate('chunk:1', 1, 0.7)],
      {
        enableRerank: true,
        rerankAiFeatureConfigId: null,
      } as KnowledgeRetrievalConfig,
    );

    expect(providerCall).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3, model: 'rerank-model' }),
    );
    expect(result.applied).toBe(true);
  });
});

function buildBase(
  id: number,
  name: string,
  metadata: {
    hitKeywords?: string;
    colloquialDescription?: string;
    description?: string;
  } = {},
) {
  return {
    id,
    name,
    code: '',
    description: metadata.description ?? '',
    hitKeywords: metadata.hitKeywords ?? '',
    colloquialDescription: metadata.colloquialDescription ?? '',
  } as unknown as KnowledgeBase;
}

function buildCandidate(score: number): Candidate {
  return {
    key: 'chunk:1',
    chunkId: 1,
    title: '兵役政策',
    content: '兵役政策正文',
    knowledgeBaseId: 1,
    knowledgeBaseName: '中国科学院大学',
    sourceName: '学生手册',
    hitKeywords: '',
    colloquialDescription: '',
    matchPriority: 1,
    score,
  };
}

function buildFusedCandidate(
  key: string,
  knowledgeBaseId: number,
  score: number,
) {
  return {
    ...buildCandidate(score),
    key,
    knowledgeBaseId,
    knowledgeBaseName: `知识库 ${knowledgeBaseId}`,
    textScore: score,
    vectorScore: score,
    rerankScore: null,
  };
}
