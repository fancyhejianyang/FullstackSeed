import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { KnowledgeRetrievalConfig } from '../knowledge-retrieval-configs/entities/knowledge-retrieval-config.entity';
import {
  getAiWorkflowDerivedFlags,
  normalizeAiWorkflowDefinition,
  validateAiWorkflowDefinition,
  type AiWorkflowDefinition,
  type AiWorkflowLegacyFlags,
  type NormalizedAiWorkflowDefinition,
} from '../knowledge-retrieval-configs/workflow-definition';
import {
  CreateAiWorkflowDto,
  QueryAiWorkflowDto,
  UpdateAiWorkflowDto,
} from './dto/ai-workflow.dto';
import { AiWorkflow } from './entities/ai-workflow.entity';

export interface AiWorkflowExecutionRuntime {
  workflowId: number | null;
  workflowName: string | null;
  workflowDefinition: NormalizedAiWorkflowDefinition;
  aiInstruction: string;
}

@Injectable()
export class AiWorkflowsService {
  constructor(
    @InjectRepository(AiWorkflow)
    private readonly workflowRepository: Repository<AiWorkflow>,
    @InjectRepository(KnowledgeRetrievalConfig)
    private readonly retrievalConfigRepository: Repository<KnowledgeRetrievalConfig>,
  ) {}

  async findAll(query: QueryAiWorkflowDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const keyword = query.keyword?.trim();
    const baseWhere = {
      ...(query.isEnabled !== undefined ? { isEnabled: query.isEnabled } : {}),
    };
    const where = keyword
      ? [
          { ...baseWhere, name: Like(`%${keyword}%`) },
          { ...baseWhere, aiInstruction: Like(`%${keyword}%`) },
        ]
      : baseWhere;
    const [list, total] = await this.workflowRepository.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total };
  }

  async findOne(id: number) {
    const workflow = await this.workflowRepository.findOne({ where: { id } });
    if (!workflow) throw new NotFoundException('AI 工作流不存在');
    return workflow;
  }

  async findUsable(id: number) {
    const workflow = await this.findOne(id);
    if (!workflow.isEnabled) {
      throw new BadRequestException('关联的 AI 工作流已停用');
    }
    return workflow;
  }

  async create(dto: CreateAiWorkflowDto) {
    const entity = this.workflowRepository.create(this.toEntityPayload(dto));
    return this.workflowRepository.save(entity);
  }

  async update(id: number, dto: UpdateAiWorkflowDto) {
    const workflow = await this.findOne(id);
    if (dto.isEnabled === false) {
      await this.assertNotReferenced([id], '停用');
    }
    Object.assign(workflow, this.toEntityPayload(dto, workflow));
    return this.workflowRepository.save(workflow);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.assertNotReferenced([id], '删除');
    await this.workflowRepository.softDelete(id);
    return { id };
  }

  async batchRemove(ids: number[]) {
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) return { ids: [] };
    const count = await this.workflowRepository.count({
      where: { id: In(uniqueIds) },
    });
    if (count !== uniqueIds.length) {
      throw new NotFoundException('部分 AI 工作流不存在');
    }
    await this.assertNotReferenced(uniqueIds, '删除');
    await this.workflowRepository.softDelete(uniqueIds);
    return { ids: uniqueIds };
  }

  toExecutionRuntime(
    workflow: AiWorkflow,
    fallback: AiWorkflowLegacyFlags = {},
  ): AiWorkflowExecutionRuntime {
    return {
      workflowId: workflow.id,
      workflowName: workflow.name,
      workflowDefinition: normalizeAiWorkflowDefinition(
        workflow.workflowDefinition,
        fallback,
      ),
      aiInstruction: workflow.aiInstruction?.trim() ?? '',
    };
  }

  private toEntityPayload(
    dto: CreateAiWorkflowDto | UpdateAiWorkflowDto,
    current?: AiWorkflow,
  ): Partial<AiWorkflow> {
    const payload: Partial<AiWorkflow> = {};
    if (dto.name !== undefined) payload.name = dto.name.trim();
    if (dto.aiInstruction !== undefined) {
      payload.aiInstruction = this.toNullableText(dto.aiInstruction);
    }
    if (dto.isEnabled !== undefined) payload.isEnabled = dto.isEnabled;
    if (dto.workflowDefinition !== undefined) {
      const definition = normalizeAiWorkflowDefinition(
        dto.workflowDefinition,
        getAiWorkflowDerivedFlags(current?.workflowDefinition),
      );
      const validationErrors = validateAiWorkflowDefinition(definition);
      if (validationErrors.length) {
        throw new BadRequestException(validationErrors.join('；'));
      }
      payload.workflowDefinition = definition;
    }
    return payload;
  }

  private async assertNotReferenced(ids: number[], action: '删除' | '停用') {
    const count = await this.retrievalConfigRepository.count({
      where: { workflowId: In(ids) },
    });
    if (count) {
      throw new BadRequestException(
        `该 AI 工作流仍被 ${count} 个知识库检索配置关联，不能${action}`,
      );
    }
  }

  private toNullableText(value?: string) {
    const text = value?.trim() ?? '';
    return text || null;
  }
}
