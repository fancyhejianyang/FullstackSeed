import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { KnowledgeBaseDocument } from '../knowledge-bases/entities/knowledge-base-document.entity';
import { KnowledgeBase } from '../knowledge-bases/entities/knowledge-base.entity';
import { KnowledgeRetrievalConfig } from '../knowledge-retrieval-configs/entities/knowledge-retrieval-config.entity';
import {
  CreateKnowledgeRoutingRuleDto,
  QueryKnowledgeRoutingRuleDto,
  UpdateKnowledgeRoutingRuleDto,
} from './dto/knowledge-routing-rule.dto';
import { KnowledgeRoutingRuleDocument } from './entities/knowledge-routing-rule-document.entity';
import { KnowledgeRoutingRuleKnowledgeBase } from './entities/knowledge-routing-rule-knowledge-base.entity';
import {
  type KnowledgeRoutingRuleType,
  KnowledgeRoutingRule,
} from './entities/knowledge-routing-rule.entity';

type RuleMappingIds = {
  knowledgeBaseIds: number[];
  documentIds: number[];
};

@Injectable()
export class KnowledgeRoutingRulesService {
  constructor(
    @InjectRepository(KnowledgeRoutingRule)
    private readonly ruleRepository: Repository<KnowledgeRoutingRule>,
    @InjectRepository(KnowledgeRoutingRuleKnowledgeBase)
    private readonly ruleKnowledgeBaseRepository: Repository<KnowledgeRoutingRuleKnowledgeBase>,
    @InjectRepository(KnowledgeRoutingRuleDocument)
    private readonly ruleDocumentRepository: Repository<KnowledgeRoutingRuleDocument>,
    @InjectRepository(KnowledgeRetrievalConfig)
    private readonly retrievalConfigRepository: Repository<KnowledgeRetrievalConfig>,
    @InjectRepository(KnowledgeBase)
    private readonly knowledgeBaseRepository: Repository<KnowledgeBase>,
    @InjectRepository(KnowledgeBaseDocument)
    private readonly documentRepository: Repository<KnowledgeBaseDocument>,
  ) {}

  async findAll(query: QueryKnowledgeRoutingRuleDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const baseWhere = {
      ...(query.ruleType ? { ruleType: query.ruleType } : {}),
      ...(query.retrievalConfigId
        ? { retrievalConfigId: query.retrievalConfigId }
        : {}),
      ...(query.isEnabled !== undefined ? { isEnabled: query.isEnabled } : {}),
    };
    const where = query.keyword?.trim()
      ? [
          { ...baseWhere, term: Like(`%${query.keyword.trim()}%`) },
          { ...baseWhere, description: Like(`%${query.keyword.trim()}%`) },
        ]
      : baseWhere;
    const [list, total] = await this.ruleRepository.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list: await this.toViews(list), total };
  }

  async findOne(id: number) {
    return (await this.toViews([await this.findEntity(id)]))[0];
  }

  async create(dto: CreateKnowledgeRoutingRuleDto) {
    const mappingIds = this.mappingIdsFromDto(dto);
    const payload = await this.toEntityPayload(dto, true);
    await this.assertMappingValid(
      payload.ruleType ?? 'generic',
      mappingIds,
      payload.retrievalConfigId!,
    );
    const rule = await this.ruleRepository.save(
      this.ruleRepository.create(payload),
    );
    await this.replaceMappings(rule.id, mappingIds);
    return this.findOne(rule.id);
  }

  async update(id: number, dto: UpdateKnowledgeRoutingRuleDto) {
    const rule = await this.findEntity(id);
    const currentMappingIds = await this.findMappingIds([id]);
    const mappingIds: RuleMappingIds = {
      knowledgeBaseIds:
        dto.knowledgeBaseIds === undefined
          ? (currentMappingIds.get(id)?.knowledgeBaseIds ?? [])
          : this.normalizeIds(dto.knowledgeBaseIds),
      documentIds:
        dto.documentIds === undefined
          ? (currentMappingIds.get(id)?.documentIds ?? [])
          : this.normalizeIds(dto.documentIds),
    };
    const payload = await this.toEntityPayload(dto, false);
    const nextRuleType = payload.ruleType ?? rule.ruleType;
    await this.assertMappingValid(
      nextRuleType,
      mappingIds,
      payload.retrievalConfigId ?? rule.retrievalConfigId,
    );
    Object.assign(rule, payload);
    await this.ruleRepository.save(rule);
    if (dto.knowledgeBaseIds !== undefined || dto.documentIds !== undefined) {
      await this.replaceMappings(id, mappingIds);
    }
    return this.findOne(id);
  }

  async remove(id: number) {
    await this.findEntity(id);
    await this.removeMappings([id]);
    await this.ruleRepository.softDelete(id);
    return { id };
  }

  async batchRemove(ids: number[]) {
    const uniqueIds = this.normalizeIds(ids);
    if (!uniqueIds.length) return { ids: [] };
    const count = await this.ruleRepository.count({
      where: { id: In(uniqueIds) },
    });
    if (count !== uniqueIds.length) {
      throw new NotFoundException('部分知识库路由规则不存在');
    }
    await this.removeMappings(uniqueIds);
    await this.ruleRepository.softDelete(uniqueIds);
    return { ids: uniqueIds };
  }

  private async toEntityPayload(
    dto: CreateKnowledgeRoutingRuleDto | UpdateKnowledgeRoutingRuleDto,
    isCreate: boolean,
  ): Promise<Partial<KnowledgeRoutingRule>> {
    const payload: Partial<KnowledgeRoutingRule> = {};
    if (dto.term !== undefined) {
      const term = dto.term.trim();
      if (!term) throw new BadRequestException('路由词不能为空');
      payload.term = term;
    }
    if (dto.ruleType !== undefined || isCreate) {
      payload.ruleType = dto.ruleType ?? 'generic';
    }
    if (dto.matchMode !== undefined || isCreate) {
      payload.matchMode = dto.matchMode ?? 'contains';
    }
    if (dto.weight !== undefined || isCreate || dto.ruleType !== undefined) {
      payload.weight =
        dto.weight ?? this.defaultWeight(payload.ruleType ?? 'generic');
    }
    if (dto.retrievalConfigId !== undefined) {
      const config = await this.retrievalConfigRepository.findOne({
        where: { id: dto.retrievalConfigId },
      });
      if (!config) throw new BadRequestException('所属知识库检索配置不存在');
      payload.retrievalConfigId = config.id;
    }
    if (dto.isEnabled !== undefined || isCreate) {
      payload.isEnabled = dto.isEnabled ?? true;
    }
    if (dto.description !== undefined) {
      payload.description = this.toNullableText(dto.description);
    }
    return payload;
  }

  private async assertMappingValid(
    ruleType: KnowledgeRoutingRuleType,
    mappingIds: RuleMappingIds,
    retrievalConfigId: number,
  ) {
    const retrievalConfig = await this.retrievalConfigRepository.findOne({
      where: { id: retrievalConfigId },
    });
    if (!retrievalConfig) {
      throw new BadRequestException('所属知识库检索配置不存在');
    }
    const bases = mappingIds.knowledgeBaseIds.length
      ? await this.knowledgeBaseRepository.find({
          where: { id: In(mappingIds.knowledgeBaseIds) },
        })
      : [];
    if (bases.length !== mappingIds.knowledgeBaseIds.length) {
      throw new BadRequestException('部分目标知识库不存在');
    }
    if (['alias', 'exclusive'].includes(ruleType) && !bases.length) {
      throw new BadRequestException(
        '别名升权和专属路由规则至少需要关联一个目标知识库',
      );
    }
    const selectedBaseIds = new Set(retrievalConfig.knowledgeBaseIds ?? []);
    const selectedCategoryIds = new Set(retrievalConfig.categoryIds ?? []);
    const isAllKnowledgeBases =
      selectedBaseIds.size === 0 && selectedCategoryIds.size === 0;
    if (
      !isAllKnowledgeBases &&
      bases.some(
        (base) =>
          !selectedBaseIds.has(base.id) &&
          !selectedCategoryIds.has(base.categoryId ?? 0),
      )
    ) {
      throw new BadRequestException(
        '目标知识库必须处于所属知识库检索配置的检索范围内',
      );
    }

    const documents = mappingIds.documentIds.length
      ? await this.documentRepository.find({
          where: { id: In(mappingIds.documentIds) },
        })
      : [];
    if (documents.length !== mappingIds.documentIds.length) {
      throw new BadRequestException('部分目标知识库文档不存在');
    }
    const baseIdSet = new Set(mappingIds.knowledgeBaseIds);
    if (
      documents.some((document) => !baseIdSet.has(document.knowledgeBaseId))
    ) {
      throw new BadRequestException('目标文档必须隶属于已选择的目标知识库');
    }
  }

  private async replaceMappings(ruleId: number, mappingIds: RuleMappingIds) {
    await this.removeMappings([ruleId]);
    if (mappingIds.knowledgeBaseIds.length) {
      await this.ruleKnowledgeBaseRepository.save(
        mappingIds.knowledgeBaseIds.map((knowledgeBaseId) =>
          this.ruleKnowledgeBaseRepository.create({ ruleId, knowledgeBaseId }),
        ),
      );
    }
    if (mappingIds.documentIds.length) {
      await this.ruleDocumentRepository.save(
        mappingIds.documentIds.map((documentId) =>
          this.ruleDocumentRepository.create({ ruleId, documentId }),
        ),
      );
    }
  }

  private async removeMappings(ruleIds: number[]) {
    await Promise.all([
      this.ruleKnowledgeBaseRepository.delete({ ruleId: In(ruleIds) }),
      this.ruleDocumentRepository.delete({ ruleId: In(ruleIds) }),
    ]);
  }

  private async toViews(rules: KnowledgeRoutingRule[]) {
    if (!rules.length) return [];
    const ruleIds = rules.map((rule) => rule.id);
    const [mappingIdsByRule, configs] = await Promise.all([
      this.findMappingIds(ruleIds),
      this.retrievalConfigRepository.find({
        where: { id: In(rules.map((rule) => rule.retrievalConfigId)) },
      }),
    ]);
    const allKnowledgeBaseIds = Array.from(
      new Set(
        Array.from(mappingIdsByRule.values()).flatMap(
          (item) => item.knowledgeBaseIds,
        ),
      ),
    );
    const allDocumentIds = Array.from(
      new Set(
        Array.from(mappingIdsByRule.values()).flatMap(
          (item) => item.documentIds,
        ),
      ),
    );
    const [bases, documents] = await Promise.all([
      allKnowledgeBaseIds.length
        ? this.knowledgeBaseRepository.find({
            where: { id: In(allKnowledgeBaseIds) },
          })
        : [],
      allDocumentIds.length
        ? this.documentRepository.find({ where: { id: In(allDocumentIds) } })
        : [],
    ]);
    const configMap = new Map(configs.map((item) => [item.id, item]));
    const baseMap = new Map(bases.map((item) => [item.id, item]));
    const documentMap = new Map(documents.map((item) => [item.id, item]));
    return rules.map((rule) => {
      const mappingIds = mappingIdsByRule.get(rule.id) ?? {
        knowledgeBaseIds: [],
        documentIds: [],
      };
      const selectedBases = mappingIds.knowledgeBaseIds
        .map((id) => baseMap.get(id))
        .filter((item): item is KnowledgeBase => Boolean(item));
      const selectedDocuments = mappingIds.documentIds
        .map((id) => documentMap.get(id))
        .filter((item): item is KnowledgeBaseDocument => Boolean(item));
      return {
        ...rule,
        retrievalConfigName:
          configMap.get(rule.retrievalConfigId)?.name ??
          `检索配置 #${rule.retrievalConfigId}`,
        knowledgeBaseIds: selectedBases.map((item) => item.id),
        knowledgeBaseNames: selectedBases.map((item) => item.name).join('、'),
        documentIds: selectedDocuments.map((item) => item.id),
        documentNames: selectedDocuments
          .map((item) => item.title || item.sourceName || `文档 #${item.id}`)
          .join('、'),
      };
    });
  }

  private async findMappingIds(ruleIds: number[]) {
    const [baseMappings, documentMappings] = await Promise.all([
      this.ruleKnowledgeBaseRepository.find({ where: { ruleId: In(ruleIds) } }),
      this.ruleDocumentRepository.find({ where: { ruleId: In(ruleIds) } }),
    ]);
    const result = new Map<number, RuleMappingIds>();
    ruleIds.forEach((ruleId) => {
      result.set(ruleId, { knowledgeBaseIds: [], documentIds: [] });
    });
    baseMappings.forEach((mapping) => {
      result
        .get(mapping.ruleId)
        ?.knowledgeBaseIds.push(mapping.knowledgeBaseId);
    });
    documentMappings.forEach((mapping) => {
      result.get(mapping.ruleId)?.documentIds.push(mapping.documentId);
    });
    return result;
  }

  private mappingIdsFromDto(dto: CreateKnowledgeRoutingRuleDto) {
    return {
      knowledgeBaseIds: this.normalizeIds(dto.knowledgeBaseIds),
      documentIds: this.normalizeIds(dto.documentIds),
    };
  }

  private defaultWeight(ruleType: KnowledgeRoutingRuleType) {
    if (ruleType === 'alias') return 0.8;
    if (ruleType === 'exclusive') return 1;
    return -0.8;
  }

  private toNullableText(value?: string) {
    const text = value?.trim() ?? '';
    return text || null;
  }

  private normalizeIds(ids?: number[]) {
    return Array.from(new Set((ids ?? []).map(Number))).filter(
      (id) => Number.isInteger(id) && id > 0,
    );
  }

  private async findEntity(id: number) {
    const rule = await this.ruleRepository.findOne({ where: { id } });
    if (!rule) throw new NotFoundException('知识库路由规则不存在');
    return rule;
  }
}
