import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { KnowledgeBaseCategory } from '../knowledge-bases/entities/knowledge-base-category.entity';
import { KnowledgeBase } from '../knowledge-bases/entities/knowledge-base.entity';
import { KnowledgeRetrievalConfig } from '../knowledge-retrieval-configs/entities/knowledge-retrieval-config.entity';
import {
  CreateKnowledgeRoutingRuleDto,
  QueryKnowledgeRoutingRuleDto,
  UpdateKnowledgeRoutingRuleDto,
} from './dto/knowledge-routing-rule.dto';
import { KnowledgeRoutingRuleCategory } from './entities/knowledge-routing-rule-category.entity';
import { KnowledgeRoutingRuleDocument } from './entities/knowledge-routing-rule-document.entity';
import { KnowledgeRoutingRuleKnowledgeBase } from './entities/knowledge-routing-rule-knowledge-base.entity';
import {
  type KnowledgeRoutingRuleType,
  KnowledgeRoutingRule,
} from './entities/knowledge-routing-rule.entity';

type RuleMappingIds = {
  categoryIds: number[];
  knowledgeBaseIds: number[];
};

export interface KnowledgeRoutingRuleMatch {
  id: number;
  term: string;
  ruleType: KnowledgeRoutingRuleType;
  matchMode: 'contains' | 'exact';
  weight: number;
  categoryIds: number[];
  knowledgeBaseIds: number[];
}

@Injectable()
export class KnowledgeRoutingRulesService {
  constructor(
    @InjectRepository(KnowledgeRoutingRule)
    private readonly ruleRepository: Repository<KnowledgeRoutingRule>,
    @InjectRepository(KnowledgeRoutingRuleKnowledgeBase)
    private readonly ruleKnowledgeBaseRepository: Repository<KnowledgeRoutingRuleKnowledgeBase>,
    @InjectRepository(KnowledgeRoutingRuleCategory)
    private readonly ruleCategoryRepository: Repository<KnowledgeRoutingRuleCategory>,
    @InjectRepository(KnowledgeRoutingRuleDocument)
    private readonly legacyRuleDocumentRepository: Repository<KnowledgeRoutingRuleDocument>,
    @InjectRepository(KnowledgeRetrievalConfig)
    private readonly retrievalConfigRepository: Repository<KnowledgeRetrievalConfig>,
    @InjectRepository(KnowledgeBase)
    private readonly knowledgeBaseRepository: Repository<KnowledgeBase>,
    @InjectRepository(KnowledgeBaseCategory)
    private readonly categoryRepository: Repository<KnowledgeBaseCategory>,
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
      categoryIds:
        dto.categoryIds === undefined
          ? (currentMappingIds.get(id)?.categoryIds ?? [])
          : this.normalizeIds(dto.categoryIds),
      knowledgeBaseIds:
        dto.knowledgeBaseIds === undefined
          ? (currentMappingIds.get(id)?.knowledgeBaseIds ?? [])
          : this.normalizeIds(dto.knowledgeBaseIds),
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
    if (dto.categoryIds !== undefined || dto.knowledgeBaseIds !== undefined) {
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

  /**
   * 每次知识库检索前调用：仅返回当前检索配置下已启用且命中的规则。
   * 配置管理与运行时检索共用同一份映射，避免名称、权重或启用状态不一致。
   */
  async findMatchedRulesForRetrieval(
    retrievalConfigId: number,
    question: string,
  ): Promise<KnowledgeRoutingRuleMatch[]> {
    const normalizedQuestion = this.normalizeForMatch(question);
    if (!normalizedQuestion) return [];

    const rules = await this.ruleRepository.find({
      where: { retrievalConfigId, isEnabled: true },
      order: { id: 'ASC' },
    });
    if (!rules.length) return [];

    const mappingIdsByRule = await this.findMappingIds(
      rules.map((rule) => rule.id),
    );
    return rules
      .filter((rule) => this.isRuleMatched(rule, normalizedQuestion))
      .map((rule) => {
        const mappingIds = mappingIdsByRule.get(rule.id) ?? {
          categoryIds: [],
          knowledgeBaseIds: [],
        };
        return {
          id: rule.id,
          term: rule.term,
          ruleType: rule.ruleType,
          matchMode: rule.matchMode,
          weight: Number(rule.weight),
          categoryIds: mappingIds.categoryIds,
          knowledgeBaseIds: mappingIds.knowledgeBaseIds,
        };
      });
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
    const categories = mappingIds.categoryIds.length
      ? await this.categoryRepository.find({
          where: { id: In(mappingIds.categoryIds) },
        })
      : [];
    if (categories.length !== mappingIds.categoryIds.length) {
      throw new BadRequestException('部分目标分类不存在');
    }
    const bases = mappingIds.knowledgeBaseIds.length
      ? await this.knowledgeBaseRepository.find({
          where: { id: In(mappingIds.knowledgeBaseIds) },
        })
      : [];
    if (bases.length !== mappingIds.knowledgeBaseIds.length) {
      throw new BadRequestException('部分目标知识库不存在');
    }
    if (
      ['alias', 'exclusive'].includes(ruleType) &&
      !categories.length &&
      !bases.length
    ) {
      throw new BadRequestException(
        '别名升权和专属路由规则至少需要关联一个目标分类或知识库',
      );
    }
    const selectedBaseIds = new Set(retrievalConfig.knowledgeBaseIds ?? []);
    const selectedCategoryIds = new Set(retrievalConfig.categoryIds ?? []);
    const isAllKnowledgeBases =
      selectedBaseIds.size === 0 && selectedCategoryIds.size === 0;
    if (
      !isAllKnowledgeBases &&
      categories.some((category) => !selectedCategoryIds.has(category.id))
    ) {
      throw new BadRequestException(
        '目标分类必须处于所属知识库检索配置的检索范围内',
      );
    }
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
    if (
      categories.length &&
      bases.some(
        (base) => !mappingIds.categoryIds.includes(base.categoryId ?? 0),
      )
    ) {
      throw new BadRequestException('目标知识库必须隶属于已选择的目标分类');
    }
  }

  private async replaceMappings(ruleId: number, mappingIds: RuleMappingIds) {
    await this.removeMappings([ruleId]);
    if (mappingIds.categoryIds.length) {
      await this.ruleCategoryRepository.save(
        mappingIds.categoryIds.map((categoryId) =>
          this.ruleCategoryRepository.create({ ruleId, categoryId }),
        ),
      );
    }
    if (mappingIds.knowledgeBaseIds.length) {
      await this.ruleKnowledgeBaseRepository.save(
        mappingIds.knowledgeBaseIds.map((knowledgeBaseId) =>
          this.ruleKnowledgeBaseRepository.create({ ruleId, knowledgeBaseId }),
        ),
      );
    }
  }

  private async removeMappings(ruleIds: number[]) {
    await Promise.all([
      this.ruleKnowledgeBaseRepository.delete({ ruleId: In(ruleIds) }),
      this.ruleCategoryRepository.delete({ ruleId: In(ruleIds) }),
      this.legacyRuleDocumentRepository.delete({ ruleId: In(ruleIds) }),
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
    const allCategoryIds = Array.from(
      new Set(
        Array.from(mappingIdsByRule.values()).flatMap(
          (item) => item.categoryIds,
        ),
      ),
    );
    const allKnowledgeBaseIds = Array.from(
      new Set(
        Array.from(mappingIdsByRule.values()).flatMap(
          (item) => item.knowledgeBaseIds,
        ),
      ),
    );
    const [categories, bases] = await Promise.all([
      allCategoryIds.length
        ? this.categoryRepository.find({ where: { id: In(allCategoryIds) } })
        : [],
      allKnowledgeBaseIds.length
        ? this.knowledgeBaseRepository.find({
            where: { id: In(allKnowledgeBaseIds) },
          })
        : [],
    ]);
    const configMap = new Map(configs.map((item) => [item.id, item]));
    const categoryMap = new Map(categories.map((item) => [item.id, item]));
    const baseMap = new Map(bases.map((item) => [item.id, item]));
    return rules.map((rule) => {
      const mappingIds = mappingIdsByRule.get(rule.id) ?? {
        categoryIds: [],
        knowledgeBaseIds: [],
      };
      const selectedCategories = mappingIds.categoryIds
        .map((id) => categoryMap.get(id))
        .filter((item): item is KnowledgeBaseCategory => Boolean(item));
      const selectedBases = mappingIds.knowledgeBaseIds
        .map((id) => baseMap.get(id))
        .filter((item): item is KnowledgeBase => Boolean(item));
      return {
        ...rule,
        retrievalConfigName:
          configMap.get(rule.retrievalConfigId)?.name ??
          `检索配置 #${rule.retrievalConfigId}`,
        categoryIds: selectedCategories.map((item) => item.id),
        categoryNames: selectedCategories.map((item) => item.name).join('、'),
        knowledgeBaseIds: selectedBases.map((item) => item.id),
        knowledgeBaseNames: selectedBases.map((item) => item.name).join('、'),
      };
    });
  }

  private async findMappingIds(ruleIds: number[]) {
    const [categoryMappings, baseMappings] = await Promise.all([
      this.ruleCategoryRepository.find({ where: { ruleId: In(ruleIds) } }),
      this.ruleKnowledgeBaseRepository.find({ where: { ruleId: In(ruleIds) } }),
    ]);
    const result = new Map<number, RuleMappingIds>();
    ruleIds.forEach((ruleId) => {
      result.set(ruleId, { categoryIds: [], knowledgeBaseIds: [] });
    });
    categoryMappings.forEach((mapping) => {
      result.get(mapping.ruleId)?.categoryIds.push(mapping.categoryId);
    });
    baseMappings.forEach((mapping) => {
      result
        .get(mapping.ruleId)
        ?.knowledgeBaseIds.push(mapping.knowledgeBaseId);
    });
    return result;
  }

  private mappingIdsFromDto(dto: CreateKnowledgeRoutingRuleDto) {
    return {
      categoryIds: this.normalizeIds(dto.categoryIds),
      knowledgeBaseIds: this.normalizeIds(dto.knowledgeBaseIds),
    };
  }

  private defaultWeight(ruleType: KnowledgeRoutingRuleType) {
    if (ruleType === 'alias') return 0.8;
    if (ruleType === 'exclusive') return 1;
    return -0.8;
  }

  private isRuleMatched(
    rule: KnowledgeRoutingRule,
    normalizedQuestion: string,
  ) {
    const normalizedTerm = this.normalizeForMatch(rule.term);
    if (!normalizedTerm) return false;
    return rule.matchMode === 'exact'
      ? normalizedQuestion === normalizedTerm
      : normalizedQuestion.includes(normalizedTerm);
  }

  private normalizeForMatch(value: string) {
    return value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
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
