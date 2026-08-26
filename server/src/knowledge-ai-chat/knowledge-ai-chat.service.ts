import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { AiFeatureConfigsService } from '../ai-feature-configs/ai-feature-configs.service';
import { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import { ExternalApp } from '../external-apps/entities/external-app.entity';
import {
  KnowledgeAiProvidersService,
  type KnowledgeAiChatMessagePayload,
  type KnowledgeAiChatTarget,
} from '../knowledge-ai-providers/knowledge-ai-providers.service';
import {
  AskKnowledgeAiDto,
  InitKnowledgeAiChatSessionDto,
  QueryKnowledgeAiChatSessionDto,
} from './dto/knowledge-ai-chat.dto';
import { KnowledgeAiChatMessage } from './entities/knowledge-ai-chat-message.entity';
import { KnowledgeAiChatSession } from './entities/knowledge-ai-chat-session.entity';
import { KnowledgeAiChatRetrievalService } from './knowledge-ai-chat-retrieval.service';

export interface KnowledgeAiChatStreamWriter {
  writeEvent: (event: string, data: unknown) => void;
}

interface KnowledgeRetrievalState {
  configId: number | null;
  context: string;
  knowledgeBaseNames: string[];
}

@Injectable()
export class KnowledgeAiChatService {
  constructor(
    @InjectRepository(KnowledgeAiChatSession)
    private readonly sessionRepository: Repository<KnowledgeAiChatSession>,
    @InjectRepository(KnowledgeAiChatMessage)
    private readonly messageRepository: Repository<KnowledgeAiChatMessage>,
    private readonly featureConfigsService: AiFeatureConfigsService,
    private readonly providersService: KnowledgeAiProvidersService,
    private readonly retrievalService: KnowledgeAiChatRetrievalService,
  ) {}

  async findSessions(query: QueryKnowledgeAiChatSessionDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const keyword = query.keyword?.trim();
    const baseWhere = query.providerId ? { providerId: query.providerId } : {};
    const where = keyword
      ? [
          { ...baseWhere, title: Like(`%${keyword}%`) },
          { ...baseWhere, providerName: Like(`%${keyword}%`) },
          { ...baseWhere, model: Like(`%${keyword}%`) },
          { ...baseWhere, hitKnowledgeBaseNames: Like(`%${keyword}%`) },
          { ...baseWhere, lastQuestion: Like(`%${keyword}%`) },
          { ...baseWhere, lastAnswer: Like(`%${keyword}%`) },
        ]
      : baseWhere;
    const [list, total] = await this.sessionRepository.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total };
  }

  async findSession(id: number) {
    const session = await this.findSessionEntity(id);
    const messages = await this.messageRepository.find({
      where: { sessionId: id },
      order: { id: 'ASC' },
    });
    return { ...session, messages };
  }

  async ask(dto: AskKnowledgeAiDto) {
    const { config } = await this.resolveChatFeature(dto, {
      allowDtoConfig: true,
    });
    const retrievalConfigId = dto.retrievalConfigId ?? null;
    const retrieval = await this.buildRetrievalState(
      dto.question,
      retrievalConfigId,
    );
    const result = await this.providersService.callChat({
      id: dto.providerId ?? config?.providerId ?? undefined,
      model: dto.model ?? config?.model ?? undefined,
      question: this.buildQuestionContent(dto.question, {
        configId: retrievalConfigId,
        context: retrieval.context,
        knowledgeBaseNames: retrieval.knowledgeBaseNames,
      }),
      systemPrompt: this.buildSystemMessageContent(dto.systemPrompt, config),
    });

    const session = dto.sessionId
      ? await this.findSessionEntity(dto.sessionId)
      : await this.createSession(dto, result);

    const message = await this.messageRepository.save(
      this.messageRepository.create({
        sessionId: session.id,
        providerId: result.providerId,
        providerName: result.providerName || session.providerName,
        model: result.model,
        systemPrompt: this.buildSystemMessageContent(dto.systemPrompt, config),
        question: dto.question.trim(),
        answer: result.answer || null,
        hitKnowledgeBaseNames: this.serializeKnowledgeBaseNames(
          retrieval.knowledgeBaseNames,
        ),
        isSuccess: result.isSuccess,
        errorMessage: result.errorMessage,
        elapsedMilliseconds: result.elapsedMilliseconds,
      }),
    );

    session.providerId = result.providerId;
    session.providerName = result.providerName || session.providerName;
    session.model = result.model;
    session.messageCount += 1;
    session.lastQuestion = dto.question.trim();
    session.lastAnswer = result.answer || null;
    session.hitKnowledgeBaseNames = this.serializeKnowledgeBaseNames(
      retrieval.knowledgeBaseNames,
    );
    session.isSuccess = result.isSuccess;
    session.errorMessage = result.errorMessage;
    session.elapsedMilliseconds = result.elapsedMilliseconds;
    await this.sessionRepository.save(session);

    return {
      session,
      message,
    };
  }

  async askStream(
    dto: AskKnowledgeAiDto,
    writer: KnowledgeAiChatStreamWriter,
    externalApp?: ExternalApp,
  ) {
    const { target, config } = await this.resolveChatFeature(dto, {
      externalApp,
    });
    const session = dto.sessionId
      ? await this.findSessionEntity(dto.sessionId)
      : await this.createSession(dto, target);

    writer.writeEvent('meta', {
      sessionId: session.id,
      providerId: target.providerId,
      providerName: target.providerName,
      model: target.model,
      aiFeatureConfigId: config?.id ?? null,
      aiFeatureConfigName: config?.name ?? null,
      retrievalConfigId: externalApp?.retrievalConfigId ?? null,
      retrievalConfigName: externalApp?.retrievalConfigName ?? null,
    });

    const retrieval = await this.buildRetrievalState(
      dto.question,
      externalApp?.retrievalConfigId ?? dto.retrievalConfigId ?? null,
    );
    writer.writeEvent('retrieval', {
      retrievalConfigId: retrieval.configId,
      hasReference: Boolean(retrieval.context),
      referenceLength: retrieval.context.length,
    });

    const messages = await this.buildStreamMessages(dto, config, retrieval);
    const result = await this.providersService.callChatStream({
      target,
      messages,
      onDelta: (content) => writer.writeEvent('delta', { content }),
    });

    const message = await this.saveMessage(
      dto,
      session,
      target,
      result,
      config,
      retrieval,
    );
    writer.writeEvent(result.isSuccess ? 'done' : 'error', {
      sessionId: session.id,
      messageId: message.id,
      isSuccess: result.isSuccess,
      model: result.model,
      answer: result.answer,
      errorMessage: result.errorMessage,
      elapsedMilliseconds: result.elapsedMilliseconds,
    });
    return { session, message };
  }

  async initSession(
    dto: InitKnowledgeAiChatSessionDto,
    externalApp?: ExternalApp,
  ) {
    const { target, config } = await this.resolveChatFeature(dto, {
      externalApp,
    });
    const session = await this.createSessionRecord({
      title: this.buildTitle(dto),
      providerId: target.providerId,
      providerName: target.providerName,
      model: target.model,
    });
    return {
      sessionId: session.id,
      title: session.title,
      providerId: session.providerId,
      providerName: session.providerName,
      model: session.model,
      aiFeatureConfigId: config?.id ?? null,
      aiFeatureConfigName: config?.name ?? null,
      retrievalConfigId: externalApp?.retrievalConfigId ?? null,
      retrievalConfigName: externalApp?.retrievalConfigName ?? null,
    };
  }

  async removeSession(id: number) {
    await this.findSessionEntity(id);
    await this.sessionRepository.softDelete(id);
    await this.messageRepository.softDelete({ sessionId: id });
    return { id };
  }

  async batchRemoveSessions(ids: number[]) {
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) return { ids: [] };
    const count = await this.sessionRepository.count({
      where: { id: In(uniqueIds) },
    });
    if (count !== uniqueIds.length) {
      throw new NotFoundException('部分问答记录不存在');
    }
    await this.sessionRepository.softDelete(uniqueIds);
    await this.messageRepository.softDelete({ sessionId: In(uniqueIds) });
    return { ids: uniqueIds };
  }

  private async findSessionEntity(id: number) {
    const session = await this.sessionRepository.findOne({ where: { id } });
    if (!session) {
      throw new NotFoundException('问答会话不存在');
    }
    return session;
  }

  private createSession(
    dto: AskKnowledgeAiDto,
    result: { providerId: number; providerName: string; model: string },
  ) {
    return this.createSessionRecord({
      title: this.buildTitle(dto),
      providerId: result.providerId,
      providerName: result.providerName,
      model: result.model,
    });
  }

  private createSessionRecord(payload: {
    title: string;
    providerId: number;
    providerName: string;
    model: string;
  }) {
    return this.sessionRepository.save(
      this.sessionRepository.create({
        title: payload.title,
        providerId: payload.providerId,
        providerName: payload.providerName,
        model: payload.model,
        messageCount: 0,
        lastQuestion: null,
        lastAnswer: null,
        hitKnowledgeBaseNames: null,
        isSuccess: true,
        errorMessage: null,
        elapsedMilliseconds: 0,
      }),
    );
  }

  private buildTitle(dto: { title?: string; question?: string }) {
    const title = dto.title?.trim() || dto.question?.trim() || 'AI 客服会话';
    return title.length > 80 ? `${title.slice(0, 80)}...` : title;
  }

  private async buildStreamMessages(
    dto: AskKnowledgeAiDto,
    config?: AiFeatureConfig | null,
    retrieval?: KnowledgeRetrievalState,
  ): Promise<KnowledgeAiChatMessagePayload[]> {
    const messages: KnowledgeAiChatMessagePayload[] = [
      {
        role: 'system',
        content: this.buildSystemMessageContent(dto.systemPrompt, config),
      },
    ];
    if (dto.sessionId) {
      const history = await this.messageRepository.find({
        where: { sessionId: dto.sessionId },
        order: { id: 'DESC' },
        take: 20,
      });
      for (const item of history.reverse()) {
        messages.push({ role: 'user', content: item.question });
        if (item.answer) {
          messages.push({ role: 'assistant', content: item.answer });
        }
      }
    }
    messages.push({
      role: 'user',
      content: this.buildQuestionContent(dto.question, retrieval ?? null),
    });
    return messages;
  }

  private async buildRetrievalState(
    question: string,
    configId?: number | null,
  ): Promise<KnowledgeRetrievalState> {
    const normalizedConfigId = configId ?? null;
    const result = await this.retrievalService.buildReferenceResult(
      question,
      normalizedConfigId,
    );
    return {
      configId: normalizedConfigId,
      context: result.context,
      knowledgeBaseNames: result.knowledgeBaseNames,
    };
  }

  private async saveMessage(
    dto: AskKnowledgeAiDto,
    session: KnowledgeAiChatSession,
    target: KnowledgeAiChatTarget,
    result: {
      isSuccess: boolean;
      model: string;
      answer: string;
      errorMessage: string | null;
      elapsedMilliseconds: number;
    },
    config?: AiFeatureConfig | null,
    retrieval?: KnowledgeRetrievalState,
  ) {
    const hitKnowledgeBaseNames = this.serializeKnowledgeBaseNames(
      retrieval?.knowledgeBaseNames ?? [],
    );
    const message = await this.messageRepository.save(
      this.messageRepository.create({
        sessionId: session.id,
        providerId: target.providerId,
        providerName: target.providerName,
        model: result.model,
        systemPrompt: this.buildSystemMessageContent(dto.systemPrompt, config),
        question: dto.question.trim(),
        answer: result.answer || null,
        hitKnowledgeBaseNames,
        isSuccess: result.isSuccess,
        errorMessage: result.errorMessage,
        elapsedMilliseconds: result.elapsedMilliseconds,
      }),
    );

    session.providerId = target.providerId;
    session.providerName = target.providerName;
    session.model = result.model;
    session.messageCount += 1;
    session.lastQuestion = dto.question.trim();
    session.lastAnswer = result.answer || null;
    session.hitKnowledgeBaseNames = hitKnowledgeBaseNames;
    session.isSuccess = result.isSuccess;
    session.errorMessage = result.errorMessage;
    session.elapsedMilliseconds = result.elapsedMilliseconds;
    await this.sessionRepository.save(session);
    return message;
  }

  private serializeKnowledgeBaseNames(names: string[]) {
    const uniqueNames = Array.from(
      new Set(names.map((item) => item.trim()).filter(Boolean)),
    );
    return uniqueNames.length ? uniqueNames.join('、') : null;
  }

  private async resolveChatFeature(
    dto: { providerId?: number; model?: string; aiFeatureConfigId?: number },
    options: { allowDtoConfig?: boolean; externalApp?: ExternalApp } = {},
  ) {
    const configId =
      options.externalApp?.aiFeatureConfigId ??
      (options.allowDtoConfig ? dto.aiFeatureConfigId : undefined);
    const config = configId
      ? await this.featureConfigsService.findUsableChatConfig(configId)
      : await this.featureConfigsService.findEnabledByFeature('chat');
    const useRequestTarget = !options.externalApp;
    const target = await this.providersService.resolveChatTarget({
      id: useRequestTarget
        ? (dto.providerId ?? config?.providerId ?? undefined)
        : (config?.providerId ?? undefined),
      model: useRequestTarget
        ? (dto.model ?? config?.model ?? undefined)
        : (config?.model ?? undefined),
    });
    return { target, config };
  }

  private buildSystemMessageContent(
    overridePrompt?: string,
    config?: AiFeatureConfig | null,
  ) {
    const parts = [
      overridePrompt?.trim() ||
        config?.systemPrompt?.trim() ||
        '你是通用 AI 助手。请根据用户问题给出简洁、准确的中文回答。',
      config?.rules?.trim() ? `规则：\n${config.rules.trim()}` : '',
      this.buildResponseFormatInstruction(config?.responseFormat),
    ].filter(Boolean);
    return parts.join('\n\n');
  }

  private buildQuestionContent(
    question: string,
    retrieval?: KnowledgeRetrievalState | null,
  ) {
    const trimmedQuestion = question.trim();
    if (!retrieval?.configId) return trimmedQuestion;
    if (!retrieval.context) {
      return [
        '当前问题已启用知识库检索，但没有检索到任何可用参考资料。',
        '你必须只基于知识库参考资料回答，严禁使用互联网常识、模型训练知识或自行推测。',
        '因此本次应明确回答：知识库中未找到相关内容，无法确认。',
        '',
        `用户问题：\n${trimmedQuestion}`,
      ].join('\n');
    }
    return [
      '你必须只依据以下知识库参考资料回答用户问题。',
      '严禁使用互联网常识、模型训练知识或自行推测补充答案。',
      '如果参考资料不足以回答，请明确说明“知识库中未找到相关内容，无法确认”。',
      '',
      `知识库参考资料：\n${retrieval.context}`,
      '',
      `用户问题：\n${trimmedQuestion}`,
    ].join('\n');
  }

  private buildResponseFormatInstruction(format?: string | null) {
    if (format === 'json') {
      return '返回格式：请返回合法 JSON，不要包裹 Markdown 代码块。';
    }
    if (format === 'markdown') {
      return '返回格式：请使用 Markdown 输出。';
    }
    return '';
  }
}
