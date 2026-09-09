import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Like, Repository } from 'typeorm';
import { KnowledgeAiChatMessage } from '../knowledge-ai-chat/entities/knowledge-ai-chat-message.entity';
import { KnowledgeRetrievalConfig } from '../knowledge-retrieval-configs/entities/knowledge-retrieval-config.entity';
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

export interface KnowledgeStandardQaQuestionAnalysis {
  standaloneQuestion: string;
  keywords: string[];
  intent: string;
  entity: string | null;
  isFollowUp: boolean;
}

export interface KnowledgeStandardQaMatch {
  entry: KnowledgeStandardQa;
  score: number;
  method: 'exact' | 'semantic-keyword';
}

@Injectable()
export class KnowledgeStandardQasService {
  constructor(
    @InjectRepository(KnowledgeStandardQa)
    private readonly qaRepository: Repository<KnowledgeStandardQa>,
    @InjectRepository(KnowledgeRetrievalConfig)
    private readonly retrievalConfigRepository: Repository<KnowledgeRetrievalConfig>,
    @InjectRepository(KnowledgeAiChatMessage)
    private readonly chatMessageRepository: Repository<KnowledgeAiChatMessage>,
  ) {}

  async findAll(query: QueryKnowledgeStandardQaDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.retrievalConfigId
        ? { retrievalConfigId: query.retrievalConfigId }
        : {}),
    };
    const conditions = query.keyword?.trim()
      ? [
          { ...where, question: Like(`%${query.keyword.trim()}%`) },
          { ...where, answer: Like(`%${query.keyword.trim()}%`) },
          { ...where, description: Like(`%${query.keyword.trim()}%`) },
        ]
      : where;
    const [list, total] = await this.qaRepository.findAndCount({
      where: conditions,
      order: { priority: 'DESC', id: 'DESC' },
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
    const payload = await this.toEntityPayload(dto, false);
    const changedAnswer =
      payload.answer !== undefined && payload.answer.trim() !== qa.answer.trim();
    const publishingNow = payload.status === 'published' && qa.status !== 'published';
    Object.assign(qa, payload);
    if (changedAnswer || publishingNow) {
      qa.version += 1;
      qa.reviewedAt = new Date();
    }
    await this.qaRepository.save(qa);
    return this.findOne(id);
  }

  async remove(id: number) {
    await this.findEntity(id);
    await this.qaRepository.softDelete(id);
    return { id };
  }

  async batchRemove(ids: number[]) {
    const uniqueIds = Array.from(new Set(ids.map(Number))).filter(
      (id) => Number.isInteger(id) && id > 0,
    );
    if (!uniqueIds.length) return { ids: [] };
    const count = await this.qaRepository.count({ where: { id: In(uniqueIds) } });
    if (count !== uniqueIds.length) {
      throw new NotFoundException('部分标准问答不存在');
    }
    await this.qaRepository.softDelete(uniqueIds);
    return { ids: uniqueIds };
  }

  async matchForChat(params: {
    retrievalConfigId?: number | null;
    analysis: KnowledgeStandardQaQuestionAnalysis;
  }): Promise<KnowledgeStandardQaMatch | null> {
    const now = new Date();
    const entries = await this.qaRepository
      .createQueryBuilder('qa')
      .where('qa.status = :status', { status: 'published' })
      .andWhere('(qa.effectiveAt IS NULL OR qa.effectiveAt <= :now)', { now })
      .andWhere('(qa.expiresAt IS NULL OR qa.expiresAt >= :now)', { now })
      .andWhere(
        new Brackets((qb) => {
          qb.where('qa.retrievalConfigId IS NULL');
          if (params.retrievalConfigId) {
            qb.orWhere('qa.retrievalConfigId = :retrievalConfigId', {
              retrievalConfigId: params.retrievalConfigId,
            });
          }
        }),
      )
      .orderBy('qa.priority', 'DESC')
      .addOrderBy('qa.id', 'ASC')
      .getMany();
    if (!entries.length) return null;

    const matched = entries
      .map((entry) => this.scoreMatch(entry, params.analysis))
      .filter((item): item is KnowledgeStandardQaMatch => item !== null)
      .sort((left, right) =>
        right.score === left.score
          ? right.entry.priority - left.entry.priority
          : right.score - left.score,
      );
    const winner = matched[0];
    if (!winner) return null;
    const runnerUp = matched[1];
    const threshold = Math.max(0.5, Number(winner.entry.matchThreshold ?? 0.88));
    const hasClearLead = !runnerUp || winner.score - runnerUp.score >= 0.04;
    if (winner.score < threshold || (!hasClearLead && winner.method !== 'exact')) {
      return null;
    }
    await this.qaRepository.update(winner.entry.id, {
      hitCount: winner.entry.hitCount + 1,
      lastHitAt: now,
    });
    return winner;
  }

  private scoreMatch(
    entry: KnowledgeStandardQa,
    analysis: KnowledgeStandardQaQuestionAnalysis,
  ): KnowledgeStandardQaMatch | null {
    const query = this.normalizeForMatch(analysis.standaloneQuestion);
    if (!query) return null;
    const variants = [entry.question, ...(entry.aliases ?? [])]
      .map((item) => this.normalizeForMatch(item))
      .filter(Boolean);
    if (variants.some((item) => item === query)) {
      return { entry, score: 1, method: 'exact' };
    }

    const entryText = this.normalizeForMatch(
      [entry.question, ...(entry.aliases ?? []), ...(entry.keywords ?? [])].join(' '),
    );
    const terms = Array.from(
      new Set(
        [...analysis.keywords, analysis.entity ?? '', analysis.intent]
          .map((item) => this.normalizeForMatch(item))
          .filter((item) => item.length >= 2),
      ),
    );
    if (!terms.length) return null;
    const matchedTerms = terms.filter((term) => entryText.includes(term));
    const coverage = matchedTerms.length / terms.length;
    const containment = variants.some(
      (variant) => variant.length >= 4 && (query.includes(variant) || variant.includes(query)),
    );
    const score = Math.min(0.98, coverage * 0.8 + (containment ? 0.15 : 0));
    if (score < 0.5) return null;
    return { entry, score, method: 'semantic-keyword' };
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
    if (dto.aliases !== undefined) payload.aliases = this.normalizeTexts(dto.aliases);
    if (dto.keywords !== undefined) payload.keywords = this.normalizeTexts(dto.keywords);
    if (dto.retrievalConfigId !== undefined) {
      const id = dto.retrievalConfigId ? Number(dto.retrievalConfigId) : null;
      if (id) await this.assertRetrievalConfig(id);
      payload.retrievalConfigId = id;
    }
    if (dto.priority !== undefined) payload.priority = Number(dto.priority);
    if (dto.matchThreshold !== undefined) payload.matchThreshold = Number(dto.matchThreshold);
    if (dto.status !== undefined || isCreate) {
      payload.status = dto.status ?? 'draft';
    }
    if (dto.effectiveAt !== undefined) payload.effectiveAt = this.toDate(dto.effectiveAt);
    if (dto.expiresAt !== undefined) payload.expiresAt = this.toDate(dto.expiresAt);
    if (
      payload.effectiveAt &&
      payload.expiresAt &&
      payload.effectiveAt.getTime() > payload.expiresAt.getTime()
    ) {
      throw new BadRequestException('失效时间不能早于生效时间');
    }
    if (dto.sourceChatMessageId !== undefined) {
      const sourceId = dto.sourceChatMessageId ? Number(dto.sourceChatMessageId) : null;
      if (sourceId) {
        const source = await this.chatMessageRepository.findOne({ where: { id: sourceId } });
        if (!source) throw new BadRequestException('来源问答记录不存在');
        payload.sourceChatMessageId = source.id;
        if (dto.sourceChunkIds === undefined) {
          payload.sourceChunkIds = source.hitChunkIds ?? null;
        }
      } else {
        payload.sourceChatMessageId = null;
      }
    }
    if (dto.sourceChunkIds !== undefined) payload.sourceChunkIds = this.normalizeIds(dto.sourceChunkIds);
    if (dto.description !== undefined) payload.description = this.toNullableText(dto.description);
    if (isCreate) {
      payload.version = 1;
      payload.reviewedAt = payload.status === 'published' ? new Date() : null;
      payload.hitCount = 0;
      payload.lastHitAt = null;
    }
    return payload;
  }

  private async toViews(entries: KnowledgeStandardQa[]) {
    if (!entries.length) return [];
    const configIds = Array.from(
      new Set(entries.map((item) => item.retrievalConfigId).filter((id): id is number => !!id)),
    );
    const configs = configIds.length
      ? await this.retrievalConfigRepository.find({ where: { id: In(configIds) } })
      : [];
    const configMap = new Map(configs.map((item) => [item.id, item.name]));
    return entries.map((entry) => ({
      ...entry,
      retrievalConfigName: entry.retrievalConfigId
        ? (configMap.get(entry.retrievalConfigId) ?? `检索配置 #${entry.retrievalConfigId}`)
        : '全局',
    }));
  }

  private async assertRetrievalConfig(id: number) {
    const config = await this.retrievalConfigRepository.findOne({ where: { id } });
    if (!config) throw new BadRequestException('所属知识库检索配置不存在');
  }

  private async findEntity(id: number) {
    const entry = await this.qaRepository.findOne({ where: { id } });
    if (!entry) throw new NotFoundException('标准问答不存在');
    return entry;
  }

  private normalizeTexts(values?: string[]) {
    const texts = Array.from(new Set((values ?? []).map((item) => item.trim()).filter(Boolean)));
    return texts.length ? texts : null;
  }

  private normalizeIds(ids?: number[]) {
    const values = Array.from(new Set((ids ?? []).map(Number))).filter(
      (id) => Number.isInteger(id) && id > 0,
    );
    return values.length ? values : null;
  }

  private toNullableText(value?: string | null) {
    const text = value?.trim() ?? '';
    return text || null;
  }

  private toDate(value?: string | null) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('时间格式不正确');
    return date;
  }

  private normalizeForMatch(value: string) {
    return value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
  }
}
