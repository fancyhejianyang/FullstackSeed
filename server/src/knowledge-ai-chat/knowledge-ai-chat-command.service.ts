import { Injectable } from '@nestjs/common';
import {
  KnowledgeAiProvidersService,
  type KnowledgeAiChatTarget,
  type KnowledgeAiTokenUsage,
} from '../knowledge-ai-providers/knowledge-ai-providers.service';
import {
  KnowledgeStandardQasService,
  type KnowledgeStandardQaMatch,
  type KnowledgeStandardQaQuestionAnalysis,
} from '../knowledge-standard-qas/knowledge-standard-qas.service';
import { KnowledgeAiChatRetrievalService } from './knowledge-ai-chat-retrieval.service';

/**
 * 聊天编排只认这些稳定的能力标识，不将路由地址、数据库或服务实现交给模型。
 */
export const KNOWLEDGE_AI_CHAT_COMMANDS = {
  analyzeQuestion: 'question.analyze',
  searchStandardQa: 'qa.search',
  retrieveKnowledge: 'knowledge.retrieve',
} as const;

export type KnowledgeAiChatCommand =
  (typeof KNOWLEDGE_AI_CHAT_COMMANDS)[keyof typeof KNOWLEDGE_AI_CHAT_COMMANDS];

export interface KnowledgeAiQuestionAnalysisResult {
  analysis: KnowledgeStandardQaQuestionAnalysis;
  usage: KnowledgeAiTokenUsage | null;
  elapsedMilliseconds: number;
}

const QUESTION_ANALYSIS_SYSTEM_PROMPT = [
  '你是内部“问题理解”能力，只负责将问题整理成检索使用的 JSON，不回答问题。',
  '只能返回一个合法 JSON 对象，不得使用 Markdown 代码块，不得输出解释。',
  'JSON 字段固定为：standaloneQuestion（string）、keywords（string[]）、intent（string）、entity（string|null）、isFollowUp（boolean）。',
  'standaloneQuestion 保留用户的实际诉求；keywords 只保留 2 到 8 个有区分度的业务词，不要包含“请问、怎么、什么、一下”等虚词。',
].join('\n');

@Injectable()
export class KnowledgeAiChatCommandService {
  constructor(
    private readonly providersService: KnowledgeAiProvidersService,
    private readonly standardQasService: KnowledgeStandardQasService,
    private readonly retrievalService: KnowledgeAiChatRetrievalService,
  ) {}

  async analyzeQuestion(params: {
    target: KnowledgeAiChatTarget;
    question: string;
    previousQuestion?: string | null;
  }): Promise<KnowledgeAiQuestionAnalysisResult> {
    const fallback = this.buildFallbackAnalysis(params.question, params.previousQuestion);
    const prompt = [
      `当前问题：${params.question.trim().slice(0, 1200)}`,
      params.previousQuestion?.trim()
        ? `上一轮问题（仅用于理解省略指代）：${params.previousQuestion.trim().slice(0, 600)}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    const result = await this.providersService.callChat({
      id: params.target.providerId,
      model: params.target.model,
      systemPrompt: QUESTION_ANALYSIS_SYSTEM_PROMPT,
      question: prompt,
      temperature: 0,
    });
    return {
      analysis: result.isSuccess
        ? this.parseQuestionAnalysis(result.answer, fallback)
        : fallback,
      usage: result.isSuccess ? result.usage : null,
      elapsedMilliseconds: result.isSuccess ? result.elapsedMilliseconds : 0,
    };
  }

  searchStandardQa(params: {
    retrievalConfigId?: number | null;
    analysis: KnowledgeStandardQaQuestionAnalysis;
  }): Promise<KnowledgeStandardQaMatch | null> {
    return this.standardQasService.matchForChat(params);
  }

  retrieveKnowledge: KnowledgeAiChatRetrievalService['buildReferenceResult'] = (
    question,
    configId,
    options,
  ) => this.retrievalService.buildReferenceResult(question, configId, options);

  private parseQuestionAnalysis(
    content: string,
    fallback: KnowledgeStandardQaQuestionAnalysis,
  ): KnowledgeStandardQaQuestionAnalysis {
    try {
      const parsed = JSON.parse(this.extractJson(content)) as Record<string, unknown>;
      const standaloneQuestion = this.toText(parsed.standaloneQuestion) || fallback.standaloneQuestion;
      const keywords = this.normalizeKeywords(parsed.keywords);
      return {
        standaloneQuestion,
        keywords: keywords.length ? keywords : fallback.keywords,
        intent: this.toText(parsed.intent) || fallback.intent,
        entity: this.toText(parsed.entity) || null,
        isFollowUp:
          typeof parsed.isFollowUp === 'boolean'
            ? parsed.isFollowUp
            : fallback.isFollowUp,
      };
    } catch {
      return fallback;
    }
  }

  private buildFallbackAnalysis(question: string, previousQuestion?: string | null) {
    const standaloneQuestion = question.trim();
    return {
      standaloneQuestion,
      keywords: this.extractFallbackKeywords(standaloneQuestion),
      intent: '',
      entity: null,
      isFollowUp: Boolean(previousQuestion?.trim()) && /^(那|它|这个|该|还|以及|然后)/.test(standaloneQuestion),
    };
  }

  private extractJson(value: string) {
    const trimmed = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
  }

  private normalizeKeywords(value: unknown) {
    if (!Array.isArray(value)) return [];
    return Array.from(
      new Set(
        value
          .map((item) => this.toText(item))
          .filter((item) => item.length >= 2 && item.length <= 80),
      ),
    ).slice(0, 8);
  }

  private extractFallbackKeywords(value: string) {
    return Array.from(
      new Set(
        value
          .split(/[，。！？；、,.!?;:：\s]+/)
          .flatMap((item) => item.match(/[\u4e00-\u9fa5a-z0-9_-]{2,}/gi) ?? [])
          .filter((item) => item.length >= 2),
      ),
    ).slice(0, 8);
  }

  private toText(value: unknown) {
    return typeof value === 'string' ? value.trim().slice(0, 1200) : '';
  }
}
