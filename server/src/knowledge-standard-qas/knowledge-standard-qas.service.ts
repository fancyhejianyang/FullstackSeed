import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { KnowledgeAiChatMessage } from '../knowledge-ai-chat/entities/knowledge-ai-chat-message.entity';
import {
  BatchDeleteKnowledgeStandardQaDto,
  CreateKnowledgeStandardQaDto,
  QueryKnowledgeStandardQaDto,
  UpdateKnowledgeStandardQaDto,
} from './dto/knowledge-standard-qa.dto';
import {
  KnowledgeStandardQa,
  type KnowledgeStandardQaStatus,
} from './entities/knowledge-standard-qa.entity';

export interface KnowledgeStandardQaMatch {
  entry: KnowledgeStandardQa;
  /** 所有精确命中的候选；重复问题按最新记录选出最终答案。 */
  matchedEntries: KnowledgeStandardQa[];
}

@Injectable()
export class KnowledgeStandardQasService {
  constructor(
    @InjectRepository(KnowledgeStandardQa)
    private readonly qaRepository: Repository<KnowledgeStandardQa>,
    @InjectRepository(KnowledgeAiChatMessage)
    private readonly chatMessageRepository: Repository<KnowledgeAiChatMessage>,
  ) {}

  async findAll(query: QueryKnowledgeStandardQaDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where = {
      ...(query.status ? { status: query.status } : {}),
    };
    const conditions = query.keyword?.trim()
      ? [
          { ...where, question: Like(`%${query.keyword.trim()}%`) },
          { ...where, answer: Like(`%${query.keyword.trim()}%`) },
        ]
      : where;
    const [list, total] = await this.qaRepository.findAndCount({
      where: conditions,
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list: await this.toViews(list), total };
  }

  async findOne(id: number) {
    return (await this.toViews([await this.findEntity(id)]))[0];
  }

  async create(dto: CreateKnowledgeStandardQaDto) {
    const payload = await this.toEntityPayload(dto, true);
    const qa = await this.qaRepository.save(this.qaRepository.create(payload));
    return this.findOne(qa.id);
  }

  async update(id: number, dto: UpdateKnowledgeStandardQaDto) {
    const qa = await this.findEntity(id);
    if (qa.status === 'pending') {
      throw new BadRequestException('标准问答正在审批中，不能编辑');
    }
    const payload = await this.toEntityPayload(dto, false);
    const changedAnswer =
      payload.answer !== undefined &&
      payload.answer.trim() !== qa.answer.trim();
    const publishingNow =
      payload.status === 'published' && qa.status !== 'published';
    Object.assign(qa, payload);
    if (changedAnswer || publishingNow) {
      qa.version += 1;
      qa.reviewedAt = new Date();
    }
    await this.qaRepository.save(qa);
    return this.findOne(id);
  }

  async remove(id: number) {
    const qa = await this.findEntity(id);
    if (qa.status === 'pending') {
      throw new BadRequestException('标准问答正在审批中，不能删除');
    }
    await this.qaRepository.softDelete(id);
    return { id };
  }

  async batchRemove(ids: number[]) {
    const uniqueIds = Array.from(new Set(ids.map(Number))).filter(
      (id) => Number.isInteger(id) && id > 0,
    );
    if (!uniqueIds.length) return { ids: [] };
    const entries = await this.qaRepository.find({
      where: { id: In(uniqueIds) },
    });
    if (entries.length !== uniqueIds.length) {
      throw new NotFoundException('部分标准问答不存在');
    }
    if (entries.some((item) => item.status === 'pending')) {
      throw new BadRequestException('存在正在审批中的标准问答，不能删除');
    }
    await this.qaRepository.softDelete(uniqueIds);
    return { ids: uniqueIds };
  }

  async matchForChat(params: {
    retrievalConfigId?: number | null;
    question: string;
  }): Promise<KnowledgeStandardQaMatch | null> {
    const normalizedQuestion = this.normalizeForMatch(params.question);
    if (!normalizedQuestion) return null;
    const now = new Date();
    const entries = await this.qaRepository
      .createQueryBuilder('qa')
      .where('qa.status = :status', { status: 'published' })
      .andWhere('(qa.effectiveAt IS NULL OR qa.effectiveAt <= :now)', { now })
      .andWhere('(qa.expiresAt IS NULL OR qa.expiresAt >= :now)', { now })
      .orderBy('qa.id', 'DESC')
      .getMany();
    if (!entries.length) return null;

    const matchedEntries = entries
      .filter((entry) => this.matchesQuestion(entry, normalizedQuestion))
      .sort((left, right) => right.id - left.id);
    const winner = matchedEntries[0];
    if (!winner) return null;
    await this.qaRepository.update(winner.id, {
      hitCount: winner.hitCount + 1,
      lastHitAt: now,
    });
    return { entry: winner, matchedEntries };
  }

  private matchesQuestion(
    entry: KnowledgeStandardQa,
    normalizedQuestion: string,
  ) {
    const variants = [entry.question, ...(entry.aliases ?? [])]
      .map((item) => this.normalizeForMatch(item))
      .filter(Boolean);
    return variants.includes(normalizedQuestion);
  }

  private async toEntityPayload(
    dto: CreateKnowledgeStandardQaDto | UpdateKnowledgeStandardQaDto,
    isCreate: boolean,
  ): Promise<Partial<KnowledgeStandardQa>> {
    const payload: Partial<KnowledgeStandardQa> = {};
    if (dto.question !== undefined || isCreate) {
      const question = dto.question?.trim() ?? '';
      if (!question) throw new BadRequestException('标准问题不能为空');
      payload.question = question;
    }
    if (dto.answer !== undefined || isCreate) {
      const answer = dto.answer?.trim() ?? '';
      if (!answer) throw new BadRequestException('标准答案不能为空');
      payload.answer = answer;
    }
    if (dto.aliases !== undefined)
      payload.aliases = this.normalizeTexts(dto.aliases);
    if (dto.status !== undefined || isCreate) {
      if (dto.status === 'pending' || dto.status === 'published') {
        throw new BadRequestException('请通过审批流程提交或发布标准问答');
      }
      payload.status = dto.status ?? 'draft';
    }
    if (dto.effectiveAt !== undefined)
      payload.effectiveAt = this.toDate(dto.effectiveAt);
    if (dto.expiresAt !== undefined)
      payload.expiresAt = this.toDate(dto.expiresAt);
    if (
      payload.effectiveAt &&
      payload.expiresAt &&
      payload.effectiveAt.getTime() > payload.expiresAt.getTime()
    ) {
      throw new BadRequestException('失效时间不能早于生效时间');
    }
    if (dto.sourceChatMessageId !== undefined) {
      const sourceId = dto.sourceChatMessageId
        ? Number(dto.sourceChatMessageId)
        : null;
      if (sourceId) {
        const source = await this.chatMessageRepository.findOne({
          where: { id: sourceId },
        });
        if (!source) throw new BadRequestException('来源问答记录不存在');
        payload.sourceChatMessageId = source.id;
        if (dto.sourceChunkIds === undefined) {
          payload.sourceChunkIds = source.hitChunkIds ?? null;
        }
      } else {
        payload.sourceChatMessageId = null;
      }
    }
    if (dto.sourceChunkIds !== undefined)
      payload.sourceChunkIds = this.normalizeIds(dto.sourceChunkIds);
    if (isCreate) {
      payload.version = 1;
      payload.reviewedAt = payload.status === 'published' ? new Date() : null;
      payload.hitCount = 0;
      payload.lastHitAt = null;
    }
    return payload;
  }

  private async toViews(entries: KnowledgeStandardQa[]) {
    return entries.map(({ retrievalConfigId: _legacyScope, ...entry }) => entry);
  }

  private async findEntity(id: number) {
    const entry = await this.qaRepository.findOne({ where: { id } });
    if (!entry) throw new NotFoundException('标准问答不存在');
    return entry;
  }

  private normalizeTexts(values?: string[]) {
    const texts = Array.from(
      new Set((values ?? []).map((item) => item.trim()).filter(Boolean)),
    );
    return texts.length ? texts : null;
  }

  private normalizeIds(ids?: number[]) {
    const values = Array.from(new Set((ids ?? []).map(Number))).filter(
      (id) => Number.isInteger(id) && id > 0,
    );
    return values.length ? values : null;
  }

  private toDate(value?: string | null) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
      throw new BadRequestException('时间格式不正确');
    return date;
  }

  private normalizeForMatch(value: string) {
    return value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
  }
}
