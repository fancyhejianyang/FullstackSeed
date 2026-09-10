import { Injectable } from '@nestjs/common';
import {
  KnowledgeStandardQasService,
  type KnowledgeStandardQaMatch,
} from '../knowledge-standard-qas/knowledge-standard-qas.service';
import {
  KnowledgeColloquialTermsService,
  type KnowledgeColloquialQuestionRewrite,
} from '../knowledge-colloquial-terms/knowledge-colloquial-terms.service';
import { AiCommandDefinitionsService } from '../ai-command-definitions/ai-command-definitions.service';
import { KnowledgeAiChatRetrievalService } from './knowledge-ai-chat-retrieval.service';

/**
 * 聊天编排只认这些稳定的能力标识，不将路由地址、数据库或服务实现交给模型。
 */
export const KNOWLEDGE_AI_CHAT_COMMANDS = {
  searchStandardQa: 'qa.search',
  rewriteColloquialQuestion: 'colloquial.rewrite',
  retrieveKnowledge: 'knowledge.retrieve',
} as const;

export type KnowledgeAiChatCommand =
  (typeof KNOWLEDGE_AI_CHAT_COMMANDS)[keyof typeof KNOWLEDGE_AI_CHAT_COMMANDS];

@Injectable()
export class KnowledgeAiChatCommandService {
  constructor(
    private readonly standardQasService: KnowledgeStandardQasService,
    private readonly colloquialTermsService: KnowledgeColloquialTermsService,
    private readonly retrievalService: KnowledgeAiChatRetrievalService,
    private readonly commandDefinitionsService: AiCommandDefinitionsService,
  ) {}

  searchStandardQa(params: {
    retrievalConfigId?: number | null;
    question: string;
  }): Promise<KnowledgeStandardQaMatch | null> {
    return this.findStandardQa(params);
  }

  rewriteColloquialQuestion(params: {
    retrievalConfigId?: number | null;
    question: string;
  }): Promise<KnowledgeColloquialQuestionRewrite> {
    return this.rewriteQuestion(params);
  }

  private async findStandardQa(params: {
    retrievalConfigId?: number | null;
    question: string;
  }): Promise<KnowledgeStandardQaMatch | null> {
    await this.commandDefinitionsService.findChatCommand(
      KNOWLEDGE_AI_CHAT_COMMANDS.searchStandardQa,
    );
    return this.standardQasService.matchForChat(params);
  }

  private async rewriteQuestion(params: {
    retrievalConfigId?: number | null;
    question: string;
  }): Promise<KnowledgeColloquialQuestionRewrite> {
    await this.commandDefinitionsService.findChatCommand(
      KNOWLEDGE_AI_CHAT_COMMANDS.rewriteColloquialQuestion,
    );
    return this.colloquialTermsService.rewriteQuestion(params);
  }

  async retrieveKnowledge(
    question: string,
    configId?: number | null,
    options?: Parameters<
      KnowledgeAiChatRetrievalService['buildReferenceResult']
    >[2],
  ): ReturnType<KnowledgeAiChatRetrievalService['buildReferenceResult']> {
    await this.commandDefinitionsService.findChatCommand(
      KNOWLEDGE_AI_CHAT_COMMANDS.retrieveKnowledge,
    );
    return this.retrievalService.buildReferenceResult(
      question,
      configId,
      options,
    );
  }

}
