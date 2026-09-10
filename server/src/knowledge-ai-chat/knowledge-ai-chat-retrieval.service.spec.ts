import { Repository } from 'typeorm';
import { AiFeatureConfigsService } from '../ai-feature-configs/ai-feature-configs.service';
import { KnowledgeBaseChunk } from '../knowledge-bases/entities/knowledge-base-chunk.entity';
import { KnowledgeBaseDocument } from '../knowledge-bases/entities/knowledge-base-document.entity';
import { KnowledgeBase } from '../knowledge-bases/entities/knowledge-base.entity';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import { KnowledgeRetrievalConfig } from '../knowledge-retrieval-configs/entities/knowledge-retrieval-config.entity';
import { KnowledgeRetrievalConfigsService } from '../knowledge-retrieval-configs/knowledge-retrieval-configs.service';
import type { KnowledgeRoutingRuleMatch } from '../knowledge-routing-rules/knowledge-routing-rules.service';
import { KnowledgeEmbeddingService } from '../knowledge-vectors/knowledge-embedding.service';
import { KnowledgeVectorService } from '../knowledge-vectors/knowledge-vector.service';
import {
  KnowledgeAiChatRetrievalService,
  type KnowledgeRetrievalOptions,
} from './knowledge-ai-chat-retrieval.service';

interface Candidate {
  key: string;
  chunkId: number | null;
  documentId: number | null;
  chunkIndex: number | null;
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
    routingRuleScope?: RoutingRuleScopeInput,
  ) => {
    query: string;
    queryRewritten: boolean;
    routedKnowledgeBaseIds: number[];
    activeKnowledgeBaseId: number | null;
    inventoryQuery: boolean;
    sessionContextReused: boolean;
    hasExclusiveRoutingRule: boolean;
  };
  fuseCandidates: (
    textCandidates: Candidate[],
    vectorCandidates: Candidate[],
    options: { textWeight: number; vectorWeight: number; rrfK: number },
  ) => Array<Candidate & { textScore: number; vectorScore: number }>;
  parseRerankScores: (value: string) => Map<string, number>;
  buildSearchTerms: (question: string) => string[];
  extractEntityAnchors: (question: string) => string[];
  compareCandidates: (a: Candidate, b: Candidate) => number;
  toHit: (
    candidate: Candidate & {
      textScore: number;
      vectorScore: number;
      rerankScore: number | null;
    },
  ) => {
    chunkId: number | null;
    chunkIndex: number | null;
  };
  expandContextWithNeighbors: (
    candidates: Array<
      Candidate & {
        textScore: number;
        vectorScore: number;
        rerankScore: number | null;
      }
    >,
  ) => Promise<
    Array<
      Candidate & {
        textScore: number;
        vectorScore: number;
        rerankScore: number | null;
      }
    >
  >;
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
  formatReferenceContext: (
    candidates: Array<
      Candidate & {
        textScore: number;
        vectorScore: number;
        rerankScore: number | null;
      }
    >,
  ) => string;
  extractReferenceImages: (
    candidates: Array<
      Candidate & {
        textScore: number;
        vectorScore: number;
        rerankScore: number | null;
      }
    >,
  ) => Array<{
    url: string;
    alt: string;
    sourceName: string;
    chunkId: number | null;
  }>;
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
  canReuseSessionContext: (
    options: KnowledgeRetrievalOptions,
    timeoutMinutes: number,
    now?: Date,
  ) => boolean;
  resolveRoutingRuleScope: (
    rules: KnowledgeRoutingRuleMatch[],
    bases: KnowledgeBase[],
  ) => RoutingRuleScopeInput;
}

interface RoutingRuleScopeInput {
  matches: KnowledgeRoutingRuleMatch[];
  exclusiveKnowledgeBaseIds: number[];
  hasAliasRoute: boolean;
}

describe('KnowledgeAiChatRetrievalService', () => {
  let internals: RetrievalInternals;
  let providerCall: jest.Mock;
  let service: KnowledgeAiChatRetrievalService;

  beforeEach(() => {
    providerCall = jest.fn();
    service = new KnowledgeAiChatRetrievalService(
      {} as Repository<KnowledgeBase>,
      {} as Repository<KnowledgeBaseDocument>,
      {} as Repository<KnowledgeBaseChunk>,
      {} as KnowledgeRetrievalConfigsService,
      {} as KnowledgeEmbeddingService,
      {} as KnowledgeVectorService,
      {
        findUsableRerankConfig: jest
          .fn()
          .mockResolvedValue({ providerId: 3, model: 'rerank-model' }),
        findEnabledByFeature: jest.fn().mockResolvedValue({
          id: 3,
          name: '默认 LLM 重排配置',
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

  it('expires knowledge-base context after the configured session timeout', () => {
    const lastRetrievalAt = new Date('2026-09-06T10:00:00.000Z');

    expect(
      internals.canReuseSessionContext(
        { hasHistory: true, lastRetrievalAt },
        15,
        new Date('2026-09-06T10:15:00.000Z'),
      ),
    ).toBe(true);
    expect(
      internals.canReuseSessionContext(
        { hasHistory: true, lastRetrievalAt },
        15,
        new Date('2026-09-06T10:15:00.001Z'),
      ),
    ).toBe(false);
    expect(
      internals.canReuseSessionContext(
        { hasHistory: true, lastRetrievalAt },
        0,
        new Date('2026-09-06T10:01:00.000Z'),
      ),
    ).toBe(false);
  });

  it('retries the full knowledge-base scope when a reused context has no hit', async () => {
    const activeBase = {
      id: 1,
      name: '历史学校手册',
      code: '',
      description: '',
      hitKeywords: '',
      colloquialDescription: '',
      contentText: '',
      matchPriority: 1,
    } as KnowledgeBase;
    const targetBase = {
      id: 2,
      name: '目标学校手册',
      code: '',
      description: '',
      hitKeywords: '',
      colloquialDescription: '',
      contentText: '',
      matchPriority: 1,
    } as KnowledgeBase;
    const baseFind = jest
      .fn()
      .mockResolvedValueOnce([activeBase])
      .mockResolvedValueOnce([activeBase, targetBase]);
    const documentsFind = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 21,
          knowledgeBaseId: 2,
          title: '目标问题',
          content: '目标问题的正确答案',
          sourceName: '目标学校手册',
          hitKeywords: '目标问题',
          colloquialDescription: '',
          matchPriority: 1,
        } as KnowledgeBaseDocument,
      ]);
    const scopeQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([activeBase, targetBase]),
    };
    const serviceWithFallback = new KnowledgeAiChatRetrievalService(
      {
        createQueryBuilder: jest.fn().mockReturnValue(scopeQueryBuilder),
        find: baseFind,
      } as unknown as Repository<KnowledgeBase>,
      { find: documentsFind } as unknown as Repository<KnowledgeBaseDocument>,
      {
        find: jest.fn().mockResolvedValue([]),
      } as unknown as Repository<KnowledgeBaseChunk>,
      {
        findUsableConfig: jest.fn().mockResolvedValue({
          retrievalMode: 'fullText',
          topK: 1,
          minScore: 0.35,
          textWeight: 0.8,
          vectorWeight: 1,
          rrfK: 60,
          enableRerank: false,
          sessionContextTimeoutMinutes: 15,
          knowledgeBaseIds: [],
          categoryIds: [],
        }),
      } as unknown as KnowledgeRetrievalConfigsService,
      {} as KnowledgeEmbeddingService,
      {} as KnowledgeVectorService,
      {} as AiFeatureConfigsService,
      {} as KnowledgeAiProvidersService,
    );

    const result = await serviceWithFallback.buildReferenceResult(
      '目标问题',
      1,
      {
        hasHistory: true,
        previousQuery: '历史问题',
        preferredKnowledgeBaseId: 1,
        lastRetrievalAt: new Date(),
      },
    );

    expect(result.query).toBe('目标问题');
    expect(result.knowledgeBaseIds).toEqual([2]);
    expect(result.sessionContextReused).toBe(false);
    expect(baseFind).toHaveBeenCalledTimes(2);
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

  it('applies an exclusive routing rule before reusing session context', () => {
    const plan = internals.buildRetrievalPlan(
      '深大的入学材料有哪些？',
      [buildBase(1, '中国科学院大学'), buildBase(2, '深圳大学')],
      {
        hasHistory: true,
        previousQuery: '中国科学院大学的学校简介',
        preferredKnowledgeBaseId: 1,
      },
      buildRoutingRuleScope([
        {
          id: 6,
          term: '深大',
          ruleType: 'exclusive',
          matchMode: 'contains',
          weight: 1,
          categoryIds: [],
          knowledgeBaseIds: [2],
        },
      ]),
    );

    expect(plan.routedKnowledgeBaseIds).toEqual([2]);
    expect(plan.activeKnowledgeBaseId).toBe(2);
    expect(plan.sessionContextReused).toBe(false);
    expect(plan.hasExclusiveRoutingRule).toBe(true);
  });

  it('uses an alias rule to break a stale knowledge-base route', () => {
    const plan = internals.buildRetrievalPlan(
      '深大的入学材料有哪些？',
      [buildBase(1, '中国科学院大学'), buildBase(2, '深圳大学')],
      {
        hasHistory: true,
        previousQuery: '中国科学院大学的学校简介',
        preferredKnowledgeBaseId: 1,
      },
      buildRoutingRuleScope([
        {
          id: 7,
          term: '深大',
          ruleType: 'alias',
          matchMode: 'contains',
          weight: 0.8,
          categoryIds: [],
          knowledgeBaseIds: [2],
        },
      ]),
    );

    expect(plan.routedKnowledgeBaseIds).toEqual([2]);
    expect(plan.activeKnowledgeBaseId).toBe(2);
    expect(plan.sessionContextReused).toBe(false);
  });

  it('expands an exclusive category rule to its scoped knowledge bases', () => {
    const bases = [
      buildBase(1, '中国科学院大学', { categoryId: 10 }),
      buildBase(2, '深圳大学', { categoryId: 20 }),
    ];
    const scope = internals.resolveRoutingRuleScope(
      [
        {
          id: 8,
          term: '深圳高校',
          ruleType: 'exclusive',
          matchMode: 'contains',
          weight: 1,
          categoryIds: [20],
          knowledgeBaseIds: [],
        },
      ],
      bases,
    );

    expect(scope.exclusiveKnowledgeBaseIds).toEqual([2]);
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

  it('keeps complete chunk content and restores source order in context', () => {
    const first = {
      ...buildFusedCandidate('chunk:1', 1, 0.7),
      documentId: 8,
      chunkIndex: 0,
      content: `开头${'入学材料'.repeat(260)}调转档案完整说明`,
    };
    const second = {
      ...buildFusedCandidate('chunk:2', 1, 0.9),
      documentId: 8,
      chunkIndex: 1,
      content: '后续内容',
    };

    const context = internals.formatReferenceContext([second, first]);

    expect(context).toContain('调转档案完整说明');
    expect(context.indexOf(first.content)).toBeLessThan(
      context.indexOf(second.content),
    );
  });

  it('returns only safe deduplicated Markdown image URLs from context chunks', () => {
    const images = internals.extractReferenceImages([
      {
        ...buildFusedCandidate('chunk:1', 1, 0.8),
        sourceName: '新生报到指南',
        content:
          '请查看流程图：\n![报到流程](https://cdn.example.com/checkin.png)\n![重复图片](https://cdn.example.com/checkin.png)\n![本地图片](/uploads/2026/09/08/checkin.png)',
      },
      {
        ...buildFusedCandidate('chunk:2', 1, 0.7),
        content: '忽略不安全资源：![本地文件](javascript:alert(1))',
      },
    ]);

    expect(images).toEqual([
      {
        url: 'https://cdn.example.com/checkin.png',
        alt: '报到流程',
        sourceName: '新生报到指南',
        chunkId: 1,
      },
      {
        url: '/uploads/2026/09/08/checkin.png',
        alt: '本地图片',
        sourceName: '新生报到指南',
        chunkId: 1,
      },
    ]);
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

  it('keeps a named entity as an anchor for attribute questions', () => {
    const question = '请问欧阳娜娜的职位是什么？';
    const relevant = {
      ...buildCandidate(0),
      content: '欧阳娜娜目前担任学院办公室主任。',
    };
    const noise = {
      ...buildCandidate(0),
      content: '学院办公室主任负责统筹日常行政工作。',
    };

    expect(internals.extractEntityAnchors(question)).toEqual(['欧阳娜娜']);
    expect(internals.buildSearchTerms(question)).toContain('欧阳娜娜');
    expect(internals.scoreTextCandidate(relevant, question)).toBeGreaterThan(
      internals.scoreTextCandidate(noise, question),
    );
  });

  it('uses stable keys to break equal candidate scores', () => {
    const later = { ...buildCandidate(0.7), key: 'chunk:9', chunkId: 9 };
    const earlier = { ...buildCandidate(0.7), key: 'chunk:2', chunkId: 2 };

    expect(internals.compareCandidates(later, earlier)).toBeGreaterThan(0);
    expect(internals.compareCandidates(earlier, later)).toBeLessThan(0);
  });

  it('records the source chunk index in retrieval hits', () => {
    const candidate = {
      ...buildFusedCandidate('chunk:18', 1, 0.8),
      chunkId: 18,
      chunkIndex: 17,
    };

    expect(internals.toHit(candidate)).toEqual(
      expect.objectContaining({ chunkId: 18, chunkIndex: 17 }),
    );
  });

  it('adds adjacent chunks as context without replacing direct hits', async () => {
    const neighboringService = new KnowledgeAiChatRetrievalService(
      {} as Repository<KnowledgeBase>,
      {} as Repository<KnowledgeBaseDocument>,
      {
        find: jest.fn().mockResolvedValue([
          {
            id: 4,
            documentId: 8,
            chunkIndex: 2,
            title: '第 3 章',
            content: '相邻片段内容',
          } as KnowledgeBaseChunk,
        ]),
      } as unknown as Repository<KnowledgeBaseChunk>,
      {} as KnowledgeRetrievalConfigsService,
      {} as KnowledgeEmbeddingService,
      {} as KnowledgeVectorService,
      {} as AiFeatureConfigsService,
      {} as KnowledgeAiProvidersService,
    );
    const direct = {
      ...buildFusedCandidate('chunk:5', 1, 0.8),
      chunkId: 5,
      documentId: 8,
      chunkIndex: 3,
    };

    const expanded = await (
      neighboringService as unknown as RetrievalInternals
    ).expandContextWithNeighbors([direct]);

    expect(expanded.map((item) => item.key)).toEqual(['chunk:5', 'chunk:4']);
    expect(expanded[1].textScore).toBe(0);
    expect(expanded[1].content).toBe('相邻片段内容');
  });

  it('invokes the selected LLM rerank config when reranking is enabled', async () => {
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
      expect.objectContaining({ id: 3, model: 'rerank-model', temperature: 0 }),
    );
    expect(result.applied).toBe(true);
    expect(result.candidates[0].rerankScore).toBe(0.93);
    expect(result.candidates[0].score).toBeGreaterThan(0.7);
  });

  it('falls back to the enabled LLM rerank config for default reranking', async () => {
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
    categoryId?: number;
    hitKeywords?: string;
    colloquialDescription?: string;
    description?: string;
  } = {},
) {
  return {
    id,
    categoryId: metadata.categoryId ?? null,
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
    documentId: 1,
    chunkIndex: 0,
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

function buildRoutingRuleScope(
  matches: KnowledgeRoutingRuleMatch[],
): RoutingRuleScopeInput {
  const exclusiveRules = matches.filter(
    (rule) => rule.ruleType === 'exclusive',
  );
  return {
    matches,
    exclusiveKnowledgeBaseIds: exclusiveRules.flatMap(
      (rule) => rule.knowledgeBaseIds,
    ),
    hasAliasRoute: matches.some(
      (rule) => rule.ruleType === 'alias' && rule.knowledgeBaseIds.length > 0,
    ),
  };
}
