import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import {
  KnowledgeAiProvidersService,
  type KnowledgeAiChatMessagePayload,
  type KnowledgeAiChatTarget,
} from '../knowledge-ai-providers/knowledge-ai-providers.service';
import {
  AskKnowledgeAiDto,
  QueryKnowledgeAiChatSessionDto,
} from './dto/knowledge-ai-chat.dto';
import { KnowledgeAiChatMessage } from './entities/knowledge-ai-chat-message.entity';
import { KnowledgeAiChatSession } from './entities/knowledge-ai-chat-session.entity';

export interface KnowledgeAiChatStreamWriter {
  writeEvent: (event: string, data: unknown) => void;
}

@Injectable()
export class KnowledgeAiChatService {
  constructor(
    @InjectRepository(KnowledgeAiChatSession)
    private readonly sessionRepository: Repository<KnowledgeAiChatSession>,
    @InjectRepository(KnowledgeAiChatMessage)
    private readonly messageRepository: Repository<KnowledgeAiChatMessage>,
    private readonly providersService: KnowledgeAiProvidersService,
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
    const result = await this.providersService.callChat({
      id: dto.providerId,
      model: dto.model,
      question: dto.question,
      systemPrompt: dto.systemPrompt,
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
        systemPrompt: dto.systemPrompt?.trim() || null,
        question: dto.question.trim(),
        answer: result.answer || null,
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
    session.isSuccess = result.isSuccess;
    session.errorMessage = result.errorMessage;
    session.elapsedMilliseconds = result.elapsedMilliseconds;
    await this.sessionRepository.save(session);

    return {
      session,
      message,
    };
  }

  async askStream(dto: AskKnowledgeAiDto, writer: KnowledgeAiChatStreamWriter) {
    const target = await this.providersService.resolveChatTarget({
      id: dto.providerId,
      model: dto.model,
    });
    const session = dto.sessionId
      ? await this.findSessionEntity(dto.sessionId)
      : await this.createSession(dto, target);

    writer.writeEvent('meta', {
      sessionId: session.id,
      providerId: target.providerId,
      providerName: target.providerName,
      model: target.model,
    });

    const messages = await this.buildStreamMessages(dto);
    const result = await this.providersService.callChatStream({
      target,
      messages,
      onDelta: (content) => writer.writeEvent('delta', { content }),
    });

    const message = await this.saveMessage(dto, session, target, result);
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
    return this.sessionRepository.save(
      this.sessionRepository.create({
        title: this.buildTitle(dto),
        providerId: result.providerId,
        providerName: result.providerName,
        model: result.model,
        messageCount: 0,
        lastQuestion: null,
        lastAnswer: null,
        isSuccess: true,
        errorMessage: null,
        elapsedMilliseconds: 0,
      }),
    );
  }

  private buildTitle(dto: AskKnowledgeAiDto) {
    const title = dto.title?.trim() || dto.question.trim();
    return title.length > 80 ? `${title.slice(0, 80)}...` : title;
  }

  private async buildStreamMessages(
    dto: AskKnowledgeAiDto,
  ): Promise<KnowledgeAiChatMessagePayload[]> {
    const messages: KnowledgeAiChatMessagePayload[] = [
      {
        role: 'system',
        content:
          dto.systemPrompt?.trim() ||
          '你是通用 AI 助手。请根据用户问题给出简洁、准确的中文回答。',
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
    messages.push({ role: 'user', content: dto.question.trim() });
    return messages;
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
  ) {
    const message = await this.messageRepository.save(
      this.messageRepository.create({
        sessionId: session.id,
        providerId: target.providerId,
        providerName: target.providerName,
        model: result.model,
        systemPrompt: dto.systemPrompt?.trim() || null,
        question: dto.question.trim(),
        answer: result.answer || null,
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
    session.isSuccess = result.isSuccess;
    session.errorMessage = result.errorMessage;
    session.elapsedMilliseconds = result.elapsedMilliseconds;
    await this.sessionRepository.save(session);
    return message;
  }
}
