import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type { ProductSkuChatContext } from '../../product-catalog/product-catalog.service';
import type { KnowledgeAiProcessingTrace } from '../knowledge-ai-chat-trace';

@Entity('knowledge_ai_chat_messages')
export class KnowledgeAiChatMessage extends BaseEntity {
  @Column({ type: 'int' })
  sessionId: number;

  @Column({ type: 'int' })
  providerId: number;

  @Column({ length: 120 })
  providerName: string;

  @Column({ length: 120 })
  model: string;

  @Column({ type: 'text', nullable: true })
  systemPrompt: string | null;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'text', nullable: true })
  answer: string | null;

  @Column({ type: 'text', nullable: true })
  hitKnowledgeBaseNames: string | null;

  @Column({ type: 'text', nullable: true })
  retrievalQuery: string | null;

  /** 实际参与本轮问答的检索配置；标准问答直出时也会保留。 */
  @Column({ type: 'int', nullable: true })
  retrievalConfigId: number | null;

  /** 可观测性快照：记录每一个问答处理阶段的实际结果。 */
  @Column({ type: 'simple-json', nullable: true })
  processingTrace: KnowledgeAiProcessingTrace | null;

  @Column({ type: 'simple-json', nullable: true })
  hitKnowledgeBaseIds: number[] | null;

  @Column({ type: 'simple-json', nullable: true })
  hitChunkIds: number[] | null;

  @Column({ type: 'simple-json', nullable: true })
  retrievalHits: Array<{
    key: string;
    chunkId: number | null;
    chunkIndex: number | null;
    title: string;
    knowledgeBaseId: number;
    knowledgeBaseName: string;
    sourceName: string;
    score: number;
    textScore: number;
    vectorScore: number;
    rerankScore: number | null;
  }> | null;

  @Column({ type: 'simple-json', nullable: true })
  routingRuleMatches: Array<{
    id: number;
    term: string;
    ruleType: 'generic' | 'alias' | 'exclusive';
    matchMode: 'contains' | 'exact';
    weight: number;
    categoryIds: number[];
    knowledgeBaseIds: number[];
  }> | null;

  @Column({ type: 'tinyint', default: false })
  rerankApplied: boolean;

  /** 命中标准问答后直接返回答案，不再进入知识库检索与生成。 */
  @Column({ type: 'int', nullable: true })
  qaEntryId: number | null;

  /** 本轮由人工维护的口语化表达词库实际命中的词条。 */
  @Column({ type: 'simple-json', nullable: true })
  colloquialTermMatches: Array<{
    id: number;
    term: string;
    replacement: string;
    semanticType: 'product-alias' | 'attribute' | 'business-term' | 'custom';
    semanticDefinition: string;
  }> | null;

  @Column({ type: 'simple-json', nullable: true })
  qaCommandIds: string[] | null;

  /** 本轮由已授权业务指令读取到的受控系统事实。 */
  @Column({ type: 'simple-json', nullable: true })
  businessContext: ProductSkuChatContext | null;

  @Column({ type: 'tinyint', default: true })
  isSuccess: boolean;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'int', default: 0 })
  elapsedMilliseconds: number;

  @Column({ type: 'int', nullable: true })
  promptTokens: number | null;

  @Column({ type: 'int', nullable: true })
  completionTokens: number | null;

  @Column({ type: 'int', nullable: true })
  totalTokens: number | null;
}
