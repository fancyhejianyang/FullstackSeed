import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateComfyWorkflowDto,
  QueryComfyWorkflowDto,
  UpdateComfyWorkflowDto,
} from './dto/comfyui.dto';
import { ComfyConnection } from './entities/comfy-connection.entity';
import {
  ComfyWorkflow,
  type ComfyInputBinding,
} from './entities/comfy-workflow.entity';
import { ComfyWorkflowVersion } from './entities/comfy-workflow-version.entity';
import { ComfyTask } from './entities/comfy-task.entity';

type ApiNode = {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: Record<string, unknown>;
};

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
      where: { isEnabled: true, isPublished: true },
      order: { id: 'DESC' },
    });
    return workflows
      .filter((item) => connectionIds.has(item.connectionId))
      .map((item) => ({
        id: item.id,
        name: item.name,
        outputType: item.outputType,
        description: item.description,
        version: item.version,
        inputBindings: item.inputBindings.filter(
          (binding) => binding.type !== 'outputPrefix',
        ),
      }));
  }

  async create(dto: CreateComfyWorkflowDto) {
    await this.assertConnection(dto.connectionId);
    const graph = this.parseAndValidateGraph(dto.apiWorkflow);
    const bindings = dto.inputBindings as ComfyInputBinding[];
    this.validateBindings(graph, bindings, dto.outputNodeIds ?? []);
    const id = await this.workflows.manager.transaction(async (manager) => {
      const repo = manager.getRepository(ComfyWorkflow);
      const saved = await repo.save(
        repo.create({
          ...dto,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          apiWorkflow: JSON.stringify(graph),
          inputBindings: bindings,
          outputNodeIds: dto.outputNodeIds?.length ? dto.outputNodeIds : null,
          dependencyNotes: dto.dependencyNotes?.trim() || null,
          version: 1,
        }),
      );
      await this.saveVersion(
        manager.getRepository(ComfyWorkflowVersion),
        saved,
      );
      return saved.id;
    });
    return this.findOne(id);
  }

  async update(id: number, dto: UpdateComfyWorkflowDto) {
    const current = await this.findOne(id);
    const connectionId = dto.connectionId ?? current.connectionId;
    await this.assertConnection(connectionId);
    const graph = this.parseAndValidateGraph(
      dto.apiWorkflow ?? current.apiWorkflow,
    );
    const bindings = (dto.inputBindings ??
      current.inputBindings) as ComfyInputBinding[];
    const outputNodeIds = dto.outputNodeIds ?? current.outputNodeIds ?? [];
    this.validateBindings(graph, bindings, outputNodeIds);
    const savedId = await this.workflows.manager.transaction(
      async (manager) => {
        Object.assign(current, {
          ...dto,
          connectionId,
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description.trim() || null }
            : {}),
          apiWorkflow: JSON.stringify(graph),
          inputBindings: bindings,
          outputNodeIds: outputNodeIds.length ? outputNodeIds : null,
          ...(dto.dependencyNotes !== undefined
            ? { dependencyNotes: dto.dependencyNotes.trim() || null }
            : {}),
          version: current.version + 1,
        });
        const saved = await manager.getRepository(ComfyWorkflow).save(current);
        await this.saveVersion(
          manager.getRepository(ComfyWorkflowVersion),
          saved,
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

  async getPublishedVersion(workflowId: number) {
    const workflow = await this.findOne(workflowId);
    if (!workflow.isEnabled || !workflow.isPublished) {
      throw new BadRequestException('工作流未启用或尚未发布');
    }
    const version = await this.versions.findOne({
      where: { workflowId, version: workflow.version },
    });
    if (!version) throw new BadRequestException('工作流发布版本不存在');
    return { workflow, version };
  }

  private parseAndValidateGraph(value: string) {
    if (Buffer.byteLength(value, 'utf8') > 2 * 1024 * 1024) {
      throw new BadRequestException('工作流 JSON 不能超过 2MB');
    }
    let graph: Record<string, ApiNode>;
    try {
      graph = JSON.parse(value) as Record<string, ApiNode>;
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
    graph: Record<string, ApiNode>,
    bindings: ComfyInputBinding[],
    outputNodeIds: string[],
  ) {
    const keys = new Set<string>();
    for (const binding of bindings) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(binding.key)) {
        throw new BadRequestException(`参数键 ${binding.key} 格式无效`);
      }
      if (keys.has(binding.key)) {
        throw new BadRequestException(`参数键 ${binding.key} 重复`);
      }
      keys.add(binding.key);
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
  ) {
    return repository.save(
      repository.create({
        workflowId: workflow.id,
        version: workflow.version,
        connectionId: workflow.connectionId,
        name: workflow.name,
        outputType: workflow.outputType,
        apiWorkflow: workflow.apiWorkflow,
        inputBindings: workflow.inputBindings,
        outputNodeIds: workflow.outputNodeIds,
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
