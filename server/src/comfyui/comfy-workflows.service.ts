import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ComposeComfyWorkflowPromptDto,
  CreateComfyWorkflowDto,
  QueryComfyWorkflowDto,
  UpdateComfyWorkflowDto,
} from './dto/comfyui.dto';
import { VisualPromptTemplatesService } from '../visual-prompt-templates/visual-prompt-templates.service';
import { ComfyConnection } from './entities/comfy-connection.entity';
import {
  ComfyWorkflow,
  type ComfyInputBinding,
} from './entities/comfy-workflow.entity';
import { ComfyWorkflowVersion } from './entities/comfy-workflow-version.entity';
import { ComfyTask } from './entities/comfy-task.entity';
import {
  extractPromptExamples,
  sanitizeComfyWorkflow,
  withoutPromptBindingDefaults,
  type ComfyApiGraph,
  type ComfyApiNode,
} from './comfy-workflow-sanitizer';

@Injectable()
export class ComfyWorkflowsService {
  constructor(
    @InjectRepository(ComfyWorkflow)
    private readonly workflows: Repository<ComfyWorkflow>,
    @InjectRepository(ComfyWorkflowVersion)
    private readonly versions: Repository<ComfyWorkflowVersion>,
    @InjectRepository(ComfyConnection)
    private readonly connections: Repository<ComfyConnection>,
    @InjectRepository(ComfyTask)
    private readonly tasks: Repository<ComfyTask>,
    private readonly visualPromptTemplates: VisualPromptTemplatesService,
  ) {}

  async findAll(query: QueryComfyWorkflowDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const qb = this.workflows
      .createQueryBuilder('workflow')
      .orderBy('workflow.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (query.keyword) {
      qb.andWhere(
        '(workflow.name LIKE :keyword OR workflow.description LIKE :keyword)',
        { keyword: `%${query.keyword}%` },
      );
    }
    if (query.connectionId) {
      qb.andWhere('workflow.connectionId = :connectionId', {
        connectionId: query.connectionId,
      });
    }
    if (query.outputType) {
      qb.andWhere('workflow.outputType = :outputType', {
        outputType: query.outputType,
      });
    }
    if (query.isEnabled !== undefined) {
      qb.andWhere('workflow.isEnabled = :isEnabled', {
        isEnabled: query.isEnabled,
      });
    }
    const [list, total] = await qb.getManyAndCount();
    const connectionMap = await this.connectionNameMap(
      list.map((item) => item.connectionId),
    );
    return {
      list: list.map((item) => ({
        ...item,
        connectionName: connectionMap.get(item.connectionId) || '服务已失效',
        bindingCount: item.inputBindings.length,
      })),
      total,
    };
  }

  async findOne(id: number) {
    const item = await this.workflows
      .createQueryBuilder('workflow')
      .addSelect('workflow.apiWorkflow')
      .where('workflow.id = :id', { id })
      .andWhere('workflow.deletedAt IS NULL')
      .getOne();
    if (!item) throw new NotFoundException('ComfyUI 工作流不存在');
    return item;
  }

  async options() {
    const connections = await this.connections.find({
      where: { isEnabled: true },
      select: ['id'],
    });
    const connectionIds = new Set(connections.map((item) => item.id));
    const workflows = await this.workflows.find({
      where: { isEnabled: true },
      order: { id: 'DESC' },
    });
    return workflows
      .filter((item) => connectionIds.has(item.connectionId))
      .map((item) => ({
        id: item.id,
        name: item.name,
        outputType: item.outputType,
        targetModel: item.targetModel,
        visualPromptTemplateId: item.visualPromptTemplateId,
        description: item.description,
        version: item.version,
        inputBindings: withoutPromptBindingDefaults(item.inputBindings).filter(
          (binding) => binding.type !== 'outputPrefix',
        ),
      }));
  }

  async create(dto: CreateComfyWorkflowDto, userId: number) {
    await this.assertConnection(dto.connectionId);
    const sourceGraph = this.parseAndValidateGraph(dto.apiWorkflow);
    const promptExamples = extractPromptExamples(
      sourceGraph,
      dto.inputBindings as ComfyInputBinding[],
    );
    const sanitized = sanitizeComfyWorkflow(
      sourceGraph,
      dto.inputBindings as ComfyInputBinding[],
    );
    const { graph, bindings } = sanitized;
    this.validateBindings(graph, bindings, dto.outputNodeIds ?? []);
    const apiWorkflow = JSON.stringify(graph);
    const outputNodeIds = dto.outputNodeIds?.length ? dto.outputNodeIds : null;
    const id = await this.workflows.manager.transaction(async (manager) => {
      const repo = manager.getRepository(ComfyWorkflow);
      const saved = await repo.save(
        repo.create({
          ...dto,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          targetModel: dto.targetModel?.trim() || null,
          apiWorkflow,
          inputBindings: bindings,
          outputNodeIds,
          dependencyNotes: dto.dependencyNotes?.trim() || null,
          version: 1,
        }),
      );
      if (promptExamples.positivePrompt) {
        const template = await this.visualPromptTemplates.syncFromComfyWorkflow(
          {
            workflowName: saved.name,
            mediaType: saved.outputType,
            targetModel: saved.targetModel,
            positivePrompt: promptExamples.positivePrompt,
            negativePrompt: promptExamples.negativePrompt,
          },
          userId,
          manager,
        );
        if (template) {
          saved.visualPromptTemplateId = template.id;
          await repo.save(saved);
        }
      }
      await this.saveVersion(
        manager.getRepository(ComfyWorkflowVersion),
        saved,
        apiWorkflow,
        bindings,
        outputNodeIds,
      );
      return saved.id;
    });
    return this.findOne(id);
  }

  async update(id: number, dto: UpdateComfyWorkflowDto, userId: number) {
    const current = await this.findOne(id);
    const connectionId = dto.connectionId ?? current.connectionId;
    await this.assertConnection(connectionId);
    const sourceGraph = this.parseAndValidateGraph(
      dto.apiWorkflow ?? current.apiWorkflow,
    );
    const inputBindings = (dto.inputBindings ??
      current.inputBindings) as ComfyInputBinding[];
    const promptExamples = extractPromptExamples(sourceGraph, inputBindings);
    const sanitized = sanitizeComfyWorkflow(sourceGraph, inputBindings);
    const { graph, bindings } = sanitized;
    const outputNodeIds = dto.outputNodeIds ?? current.outputNodeIds ?? [];
    this.validateBindings(graph, bindings, outputNodeIds);
    const apiWorkflow = JSON.stringify(graph);
    const savedOutputNodeIds = outputNodeIds.length ? outputNodeIds : null;
    const savedId = await this.workflows.manager.transaction(
      async (manager) => {
        Object.assign(current, {
          ...dto,
          connectionId,
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description.trim() || null }
            : {}),
          ...(dto.targetModel !== undefined
            ? { targetModel: dto.targetModel.trim() || null }
            : {}),
          apiWorkflow,
          inputBindings: bindings,
          outputNodeIds: savedOutputNodeIds,
          ...(dto.dependencyNotes !== undefined
            ? { dependencyNotes: dto.dependencyNotes.trim() || null }
            : {}),
          version: current.version + 1,
        });
        const saved = await manager.getRepository(ComfyWorkflow).save(current);
        if (promptExamples.positivePrompt) {
          const template =
            await this.visualPromptTemplates.syncFromComfyWorkflow(
              {
                templateId: saved.visualPromptTemplateId,
                workflowName: saved.name,
                mediaType: saved.outputType,
                targetModel: saved.targetModel,
                positivePrompt: promptExamples.positivePrompt,
                negativePrompt: promptExamples.negativePrompt,
              },
              userId,
              manager,
            );
          if (template) {
            saved.visualPromptTemplateId = template.id;
            await manager.getRepository(ComfyWorkflow).save(saved);
          }
        }
        await this.saveVersion(
          manager.getRepository(ComfyWorkflowVersion),
          saved,
          apiWorkflow,
          bindings,
          savedOutputNodeIds,
        );
        return saved.id;
      },
    );
    return this.findOne(savedId);
  }

  async remove(id: number) {
    await this.findOne(id);
    if (await this.tasks.exists({ where: { workflowId: id } })) {
      throw new ConflictException('工作流已有生成记录，请停用而不是删除');
    }
    await this.workflows.softDelete(id);
    return { id };
  }

  async batchRemove(ids: number[]) {
    const uniqueIds = Array.from(new Set(ids));
    for (const id of uniqueIds) await this.remove(id);
    return { ids: uniqueIds };
  }

  async getRunnableVersion(workflowId: number) {
    const workflow = await this.findOne(workflowId);
    if (!workflow.isEnabled) {
      throw new BadRequestException('工作流已停用');
    }
    const version = await this.versions.findOne({
      where: { workflowId, version: workflow.version },
    });
    if (!version) throw new BadRequestException('工作流当前版本不存在');
    return { workflow, version };
  }

  async composePrompt(
    workflowId: number,
    dto: ComposeComfyWorkflowPromptDto,
    userId: number,
  ) {
    const workflow = await this.findOne(workflowId);
    if (!workflow.isEnabled) throw new BadRequestException('工作流已停用');
    if (!workflow.visualPromptTemplateId) {
      throw new BadRequestException(
        '该工作流尚未绑定模型提示词规范，请重新导入包含正向 Demo 的 API 工作流',
      );
    }
    return this.visualPromptTemplates.submitBoundComposition(
      workflow.visualPromptTemplateId,
      {
        idea: dto.idea.trim(),
        targetModel: workflow.targetModel || undefined,
      },
      userId,
      workflow.id,
      dto.requestId,
    );
  }

  composeTask(taskId: number, userId: number) {
    return this.visualPromptTemplates.taskDetail(taskId, userId, 'compose');
  }

  private parseAndValidateGraph(value: string) {
    if (Buffer.byteLength(value, 'utf8') > 2 * 1024 * 1024) {
      throw new BadRequestException('工作流 JSON 不能超过 2MB');
    }
    let graph: ComfyApiGraph;
    try {
      graph = JSON.parse(value) as ComfyApiGraph;
    } catch {
      throw new BadRequestException('工作流 JSON 格式错误');
    }
    const entries = Object.entries(graph ?? {});
    if (!entries.length || entries.length > 1000) {
      throw new BadRequestException('工作流节点数量无效');
    }
    for (const [nodeId, node] of entries) {
      if (!/^\d+$/.test(nodeId) || !node || typeof node !== 'object') {
        throw new BadRequestException('仅支持 ComfyUI API 格式工作流');
      }
      if (
        typeof node.class_type !== 'string' ||
        !node.inputs ||
        typeof node.inputs !== 'object' ||
        Array.isArray(node.inputs)
      ) {
        throw new BadRequestException(
          `节点 ${nodeId} 缺少 class_type 或 inputs`,
        );
      }
    }
    return graph;
  }

  private validateBindings(
    graph: Record<string, ComfyApiNode>,
    bindings: ComfyInputBinding[],
    outputNodeIds: string[],
  ) {
    const keys = new Set<string>();
    const semanticRoles = new Set<string>();
    for (const binding of bindings) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(binding.key)) {
        throw new BadRequestException(`参数键 ${binding.key} 格式无效`);
      }
      if (keys.has(binding.key)) {
        throw new BadRequestException(`参数键 ${binding.key} 重复`);
      }
      keys.add(binding.key);
      const semanticRole = binding.semanticRole ?? 'normal';
      if (
        semanticRole !== 'normal' &&
        !['text', 'textarea'].includes(binding.type)
      ) {
        throw new BadRequestException(
          `参数 ${binding.label} 的语义角色仅支持文本类型`,
        );
      }
      if (
        ['positivePrompt', 'negativePrompt'].includes(semanticRole) &&
        semanticRoles.has(semanticRole)
      ) {
        throw new BadRequestException(
          `${semanticRole === 'positivePrompt' ? '正向' : '负向'}提示词只能绑定一个开放参数`,
        );
      }
      semanticRoles.add(semanticRole);
      const node = graph[binding.nodeId];
      if (!node || !(binding.inputKey in node.inputs)) {
        throw new BadRequestException(
          `参数 ${binding.label} 指向的节点输入不存在`,
        );
      }
      const current = node.inputs[binding.inputKey];
      if (
        Array.isArray(current) &&
        current.length === 2 &&
        typeof current[0] === 'string'
      ) {
        throw new BadRequestException(
          `参数 ${binding.label} 指向的是节点连线，请绑定上游可编辑输入`,
        );
      }
      if (
        binding.min !== undefined &&
        binding.max !== undefined &&
        binding.min > binding.max
      ) {
        throw new BadRequestException(`参数 ${binding.label} 的范围无效`);
      }
    }
    for (const nodeId of outputNodeIds) {
      if (!graph[nodeId]) {
        throw new BadRequestException(`输出节点 ${nodeId} 不存在`);
      }
    }
  }

  private async assertConnection(id: number) {
    if (!(await this.connections.exists({ where: { id } }))) {
      throw new BadRequestException('选择的 ComfyUI 服务不存在');
    }
  }

  private saveVersion(
    repository: Repository<ComfyWorkflowVersion>,
    workflow: ComfyWorkflow,
    apiWorkflow: string,
    inputBindings: ComfyInputBinding[],
    outputNodeIds: string[] | null,
  ) {
    return repository.save(
      repository.create({
        workflowId: workflow.id,
        version: workflow.version,
        connectionId: workflow.connectionId,
        name: workflow.name,
        outputType: workflow.outputType,
        targetModel: workflow.targetModel,
        apiWorkflow,
        inputBindings,
        outputNodeIds,
      }),
    );
  }

  private async connectionNameMap(ids: number[]) {
    const map = new Map<number, string>();
    if (!ids.length) return map;
    const rows = await this.connections
      .createQueryBuilder('connection')
      .where('connection.id IN (:...ids)', { ids: Array.from(new Set(ids)) })
      .getMany();
    rows.forEach((item) => map.set(item.id, item.name));
    return map;
  }
}
