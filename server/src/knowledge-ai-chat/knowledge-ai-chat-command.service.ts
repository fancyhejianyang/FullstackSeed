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
import {
  ProductCatalogService,
  type ProductSkuChatContext,
} from '../product-catalog/product-catalog.service';
import { KnowledgeAiChatRetrievalService } from './knowledge-ai-chat-retrieval.service';

/**
 * 聊天编排只认这些稳定的能力标识，不将路由地址、数据库或服务实现交给模型。
 */
export const KNOWLEDGE_AI_CHAT_COMMANDS = {
  searchStandardQa: 'qa.search',
  rewriteColloquialQuestion: 'colloquial.rewrite',
  retrieveKnowledge: 'knowledge.retrieve',
  lookupProductSku: 'product.sku.lookup',
} as const;

export type KnowledgeAiChatCommand =
  (typeof KNOWLEDGE_AI_CHAT_COMMANDS)[keyof typeof KNOWLEDGE_AI_CHAT_COMMANDS];

export interface KnowledgeAiChatCommandOptions {
  allowedCommandKeys?: string[];
}

@Injectable()
export class KnowledgeAiChatCommandService {
  constructor(
    private readonly standardQasService: KnowledgeStandardQasService,
    private readonly colloquialTermsService: KnowledgeColloquialTermsService,
    private readonly retrievalService: KnowledgeAiChatRetrievalService,
    private readonly commandDefinitionsService: AiCommandDefinitionsService,
    private readonly productCatalogService: ProductCatalogService,
  ) {}

  searchStandardQa(params: {
    retrievalConfigId?: number | null;
    question: string;
  }, options?: KnowledgeAiChatCommandOptions): Promise<KnowledgeStandardQaMatch | null> {
    return this.findStandardQa(params, options);
  }

  rewriteColloquialQuestion(params: {
    question: string;
  }, options?: KnowledgeAiChatCommandOptions): Promise<KnowledgeColloquialQuestionRewrite> {
    return this.rewriteQuestion(params, options);
  }

  private async findStandardQa(params: {
    retrievalConfigId?: number | null;
    question: string;
  }, options?: KnowledgeAiChatCommandOptions): Promise<KnowledgeStandardQaMatch | null> {
    await this.commandDefinitionsService.findChatCommand(
      KNOWLEDGE_AI_CHAT_COMMANDS.searchStandardQa,
      options?.allowedCommandKeys,
    );
    return this.standardQasService.matchForChat(params);
  }

  private async rewriteQuestion(params: {
    question: string;
  }, options?: KnowledgeAiChatCommandOptions): Promise<KnowledgeColloquialQuestionRewrite> {
    await this.commandDefinitionsService.findChatCommand(
      KNOWLEDGE_AI_CHAT_COMMANDS.rewriteColloquialQuestion,
      options?.allowedCommandKeys,
    );
    return this.colloquialTermsService.rewriteQuestion(params);
  }

  async retrieveKnowledge(
    question: string,
    configId?: number | null,
    options?: Parameters<
      KnowledgeAiChatRetrievalService['buildReferenceResult']
    >[2],
    commandOptions?: KnowledgeAiChatCommandOptions,
  ): ReturnType<KnowledgeAiChatRetrievalService['buildReferenceResult']> {
    await this.commandDefinitionsService.findChatCommand(
      KNOWLEDGE_AI_CHAT_COMMANDS.retrieveKnowledge,
      commandOptions?.allowedCommandKeys,
    );
    return this.retrievalService.buildReferenceResult(
      question,
      configId,
      options,
    );
  }

  async lookupProductSku(
    question: string,
    options?: KnowledgeAiChatCommandOptions,
  ): Promise<ProductSkuChatContext | null> {
    if (
      options?.allowedCommandKeys &&
      !options.allowedCommandKeys.includes(
        KNOWLEDGE_AI_CHAT_COMMANDS.lookupProductSku,
      )
    ) {
      return null;
    }
    await this.commandDefinitionsService.findChatCommand(
      KNOWLEDGE_AI_CHAT_COMMANDS.lookupProductSku,
      options?.allowedCommandKeys,
    );
    return this.productCatalogService.findSkuContextForChat(question);
  }

}
