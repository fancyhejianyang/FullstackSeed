import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt, randomUUID } from 'node:crypto';
import { In, Repository } from 'typeorm';
import { ComfyClientService } from './comfy-client.service';
import { ComfyConnectionsService } from './comfy-connections.service';
import { ComfyFilesService } from './comfy-files.service';
import { ComfyMaterialsService } from './comfy-materials.service';
import { ComfyWorkflowsService } from './comfy-workflows.service';
import { CreateComfyTaskDto, QueryComfyTaskDto } from './dto/comfyui.dto';
import type { ComfyConnection } from './entities/comfy-connection.entity';
import { ComfyTaskOutput } from './entities/comfy-task-output.entity';
import { ComfyTask, type ComfyTaskStatus } from './entities/comfy-task.entity';
import type { ComfyInputBinding } from './entities/comfy-workflow.entity';
import { ComfyWorkflow } from './entities/comfy-workflow.entity';
import { ComfyWorkflowVersion } from './entities/comfy-workflow-version.entity';
import {
  sanitizeComfyWorkflow,
  type ComfyApiGraph,
} from './comfy-workflow-sanitizer';
type OutputDescriptor = {
  filename: string;
  subfolder?: string;
  type?: string;
  nodeId: string;
};

const ACTIVE_STATUSES: ComfyTaskStatus[] = [
  'submitting',
  'queued',
  'running',
  'archiving',
];

@Injectable()
export class ComfyTasksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ComfyTasksService.name);
  private timer?: NodeJS.Timeout;
  private busy = false;
  private stopping = false;

  constructor(
    @InjectRepository(ComfyTask)
    private readonly tasks: Repository<ComfyTask>,
    @InjectRepository(ComfyTaskOutput)
    private readonly outputs: Repository<ComfyTaskOutput>,
    @InjectRepository(ComfyWorkflow)
    private readonly workflowRepository: Repository<ComfyWorkflow>,
    @InjectRepository(ComfyWorkflowVersion)
    private readonly workflowVersions: Repository<ComfyWorkflowVersion>,
    private readonly workflows: ComfyWorkflowsService,
    private readonly connections: ComfyConnectionsService,
    private readonly materials: ComfyMaterialsService,
    private readonly files: ComfyFilesService,
    private readonly client: ComfyClientService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), 3000);
    void this.tick();
  }

  onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
  }

  async findAll(userId: number, query: QueryComfyTaskDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const qb = this.tasks
      .createQueryBuilder('task')
      .where('task.userId = :userId', { userId })
      .orderBy('task.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (query.status)
      qb.andWhere('task.status = :status', { status: query.status });
    if (query.workflowId) {
      qb.andWhere('task.workflowId = :workflowId', {
        workflowId: query.workflowId,
      });
    }
    const [list, total] = await qb.getManyAndCount();
    const names = await this.workflowNameMap(
      list.map((item) => item.workflowId),
    );
    return {
      list: list.map((item) => ({
        ...item,
        workflowName: names.get(item.workflowId) || '工作流已失效',
      })),
      total,
    };
  }

  async findOne(id: number, userId: number) {
    const task = await this.tasks
      .createQueryBuilder('task')
      .addSelect('task.parameterSnapshot')
      .where('task.id = :id AND task.userId = :userId', { id, userId })
      .andWhere('task.deletedAt IS NULL')
      .getOne();
    if (!task) throw new NotFoundException('ComfyUI 任务不存在');
    const [outputs, workflow] = await Promise.all([
      this.outputs.find({ where: { taskId: id }, order: { id: 'ASC' } }),
      this.workflows.findOne(task.workflowId).catch(() => null),
    ]);
    return { ...task, workflowName: workflow?.name || '工作流已失效', outputs };
  }

  async create(userId: number, dto: CreateComfyTaskDto) {
    const requestId = dto.requestId?.trim() || randomUUID();
    const existing = await this.tasks.findOne({ where: { userId, requestId } });
    if (existing) return existing;
    const { workflow, version } = await this.workflows.getRunnableVersion(
      dto.workflowId,
    );
    const connection = await this.connections.getWithSecret(
      version.connectionId,
    );
    if (!connection.isEnabled) {
      throw new BadRequestException('工作流绑定的 ComfyUI 服务已停用');
    }
    const sanitized = sanitizeComfyWorkflow(
      JSON.parse(version.apiWorkflow) as ComfyApiGraph,
      version.inputBindings,
    );
    await this.validateParameters(userId, sanitized.bindings, dto.parameters);
    const saved = await this.tasks.save(
      this.tasks.create({
        userId,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        connectionId: version.connectionId,
        requestId,
        outputType: version.outputType,
        status: 'pending',
        stage: '等待执行',
        progress: null,
        parameterSnapshot: dto.parameters,
        workflowSnapshot: JSON.stringify(sanitized.graph),
        bindingSnapshot: sanitized.bindings,
        promptId: null,
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
      }),
    );
    void this.tick();
    return this.findOne(saved.id, userId);
  }

  async cancel(id: number, userId: number) {
    const task = await this.findOwned(id, userId);
    if (task.status !== 'pending') {
      throw new ConflictException(
        '任务已经提交到 ComfyUI；当前共享服务不执行全局中断',
      );
    }
    await this.tasks.update(id, {
      status: 'cancelled',
      stage: '已取消',
      finishedAt: new Date(),
    });
    return this.findOne(id, userId);
  }

  async remove(id: number, userId: number) {
    const task = await this.findOwned(id, userId);
    if (['pending', ...ACTIVE_STATUSES].includes(task.status)) {
      throw new ConflictException('运行中的任务不能删除');
    }
    await this.tasks.softDelete(id);
    await this.outputs.softDelete({ taskId: id });
    return { id };
  }

  async batchRemove(ids: number[], userId: number) {
    const uniqueIds = Array.from(new Set(ids));
    for (const id of uniqueIds) await this.remove(id, userId);
    return { ids: uniqueIds };
  }

  private async tick() {
    if (this.busy || this.stopping) return;
    this.busy = true;
    try {
      const active = await this.findExecutionTask(ACTIVE_STATUSES);
      if (active) await this.resumeOrProcess(active);
      else {
        const pending = await this.findExecutionTask(['pending']);
        if (pending) await this.process(pending);
      }
    } catch (error) {
      this.logger.error(
        `ComfyUI 任务调度异常: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    } finally {
      this.busy = false;
    }
  }

  private async resumeOrProcess(task: ComfyTask) {
    if (task.status === 'submitting' && !task.promptId) {
      await this.failTask(
        task.id,
        'unknown',
        '服务重启时提交结果未知，为避免重复生成未自动重投',
      );
      return;
    }
    if (!task.promptId) {
      await this.failTask(task.id, 'failed', '任务缺少 ComfyUI promptId');
      return;
    }
    try {
      const connection = await this.connections.getWithSecret(
        task.connectionId,
      );
      if (
        task.status === 'archiving' &&
        (await this.outputs.exists({ where: { taskId: task.id } }))
      ) {
        await this.tasks.update(task.id, {
          status: 'succeeded',
          stage: '生成完成',
          progress: 100,
          finishedAt: new Date(),
          errorMessage: null,
        });
        return;
      }
      await this.waitAndArchive(task, connection);
    } catch (error) {
      await this.failTask(task.id, 'failed', this.errorMessage(error));
    }
  }

  private async process(task: ComfyTask) {
    const connection = await this.connections.getWithSecret(task.connectionId);
    if (!connection.isEnabled) {
      await this.failTask(task.id, 'failed', 'ComfyUI 服务已停用');
      return;
    }
    try {
      const sanitized = sanitizeComfyWorkflow(
        JSON.parse(task.workflowSnapshot) as ComfyApiGraph,
        task.bindingSnapshot as ComfyInputBinding[],
      );
      await this.applyBindings(
        sanitized.graph,
        sanitized.bindings,
        task.parameterSnapshot,
        task,
        connection,
      );
      await this.tasks.update(task.id, {
        status: 'submitting',
        stage: '正在提交到 ComfyUI',
        startedAt: task.startedAt || new Date(),
        errorMessage: null,
      });
      const result = await this.client.submitPrompt(
        connection,
        sanitized.graph,
        `fullstack-seed-${task.id}-${randomUUID()}`,
      );
      if (!result.prompt_id) {
        throw new BadRequestException(
          result.error ? 'ComfyUI 拒绝了工作流参数' : 'ComfyUI 未返回 promptId',
        );
      }
      task.promptId = result.prompt_id;
      task.status = 'queued';
      task.stage = '已进入 ComfyUI 队列';
      task.startedAt = task.startedAt || new Date();
      await this.tasks.save(task);
      await this.waitAndArchive(task, connection);
    } catch (error) {
      await this.failTask(task.id, 'failed', this.errorMessage(error));
    }
  }

  private async waitAndArchive(task: ComfyTask, connection: ComfyConnection) {
    const started = task.startedAt?.getTime() || Date.now();
    const deadline = started + connection.taskTimeoutSec * 1000;
    while (!this.stopping && Date.now() < deadline) {
      const history = await this.client.history(connection, task.promptId!);
      const record = history[task.promptId!] as
        | Record<string, unknown>
        | undefined;
      if (record) {
        const status = (record.status ?? {}) as Record<string, unknown>;
        const reportedStatus =
          typeof status.status_str === 'string' ? status.status_str : '';
        const hasOutputs =
          !!record.outputs &&
          typeof record.outputs === 'object' &&
          Object.keys(record.outputs).length > 0;
        if (reportedStatus === 'error') {
          const cloudError = record.errorMessage;
          await this.failTask(
            task.id,
            'failed',
            typeof cloudError === 'string' && cloudError.trim()
              ? `ComfyUI 执行工作流失败：${cloudError.trim()}`
              : 'ComfyUI 执行工作流失败',
          );
          return;
        }
        if (
          status.completed === true ||
          status.status_str === 'success' ||
          hasOutputs
        ) {
          await this.archive(task, connection, record);
          return;
        }
        if (['running', 'queued'].includes(reportedStatus)) {
          const nextStatus: ComfyTaskStatus =
            reportedStatus === 'running' ? 'running' : 'queued';
          if (task.status !== nextStatus) {
            task.status = nextStatus;
            task.stage =
              nextStatus === 'running'
                ? 'ComfyUI 正在执行'
                : '等待 ComfyUI 执行';
            await this.tasks.update(task.id, {
              status: task.status,
              stage: task.stage,
            });
          }
          await this.delay(2000);
          continue;
        }
      }
      const queue = await this.client.queue(connection);
      const running = JSON.stringify(queue.queue_running || []).includes(
        task.promptId!,
      );
      const nextStatus: ComfyTaskStatus = running ? 'running' : 'queued';
      if (task.status !== nextStatus) {
        task.status = nextStatus;
        task.stage = running ? 'ComfyUI 正在执行' : '等待 ComfyUI 执行';
        await this.tasks.update(task.id, {
          status: task.status,
          stage: task.stage,
        });
      }
      await this.delay(2000);
    }
    if (!this.stopping) {
      await this.failTask(
        task.id,
        'unknown',
        '超过任务观察时限，ComfyUI 可能仍在执行，请检查服务队列',
      );
    }
  }

  private async archive(
    task: ComfyTask,
    connection: ComfyConnection,
    record: Record<string, unknown>,
  ) {
    await this.tasks.update(task.id, {
      status: 'archiving',
      stage: '正在归档生成结果',
    });
    const outputNodeIds = await this.outputNodeIds(task.workflowVersionId);
    const descriptors = this.collectOutputs(record.outputs, outputNodeIds);
    if (!descriptors.length) {
      await this.failTask(
        task.id,
        'failed',
        '工作流完成但没有发现可归档的输出',
      );
      return;
    }
    for (const descriptor of descriptors) {
      const downloaded = await this.client.downloadOutput(
        connection,
        descriptor,
      );
      const file = {
        buffer: downloaded.buffer,
        size: downloaded.buffer.length,
        originalname: downloaded.fileName,
        mimetype: downloaded.mimeType,
      };
      const { material, managed } = await this.materials.createOutput(
        task.userId,
        task.id,
        file,
      );
      await this.outputs.save(
        this.outputs.create({
          taskId: task.id,
          materialId: material.id,
          fileId: managed.id,
          fileUrl: managed.publicUrl,
          fileName: downloaded.fileName,
          mimeType: downloaded.mimeType,
          size: downloaded.buffer.length,
          nodeId: descriptor.nodeId,
        }),
      );
    }
    await this.tasks.update(task.id, {
      status: 'succeeded',
      stage: '生成完成',
      progress: 100,
      finishedAt: new Date(),
      errorMessage: null,
    });
  }

  private async applyBindings(
    graph: ComfyApiGraph,
    bindings: ComfyInputBinding[],
    parameters: Record<string, unknown>,
    task: ComfyTask,
    connection: ComfyConnection,
  ) {
    for (const binding of bindings) {
      const node = graph[binding.nodeId];
      if (!node || !(binding.inputKey in node.inputs)) {
        throw new BadRequestException(`工作流参数 ${binding.label} 已失效`);
      }
      let value = parameters[binding.key] ?? binding.defaultValue;
      if (binding.type === 'outputPrefix') value = `fullstack/task_${task.id}`;
      if (binding.type === 'seed' && (value === '' || value == null)) {
        value = randomInt(1, 2_147_483_647);
      }
      if (
        (value === undefined || value === null || value === '') &&
        binding.required
      ) {
        throw new BadRequestException(`请填写 ${binding.label}`);
      }
      if (value === undefined || value === null || value === '') continue;
      if (binding.type === 'image') {
        const materialId = Number(value);
        const material = await this.materials.findOwned(
          materialId,
          task.userId,
        );
        if (!material.fileId || material.mediaType !== 'image') {
          throw new BadRequestException(`${binding.label} 不是有效图片素材`);
        }
        const source = await this.files.read(material.fileId, task.userId);
        const uploaded = await this.client.uploadImage(connection, {
          buffer: source.buffer,
          fileName: source.fileName,
          mimeType: source.mimeType,
        });
        if (!uploaded.name) throw new BadRequestException('参考图片上传失败');
        value = uploaded.subfolder
          ? `${uploaded.subfolder}/${uploaded.name}`
          : uploaded.name;
      } else if (['number', 'seed'].includes(binding.type)) {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) {
          throw new BadRequestException(`${binding.label} 必须是数字`);
        }
        if (binding.min !== undefined && numericValue < binding.min)
          throw new BadRequestException(
            `${binding.label} 不能小于 ${binding.min}`,
          );
        if (binding.max !== undefined && numericValue > binding.max)
          throw new BadRequestException(
            `${binding.label} 不能大于 ${binding.max}`,
          );
        value = numericValue;
      } else if (binding.type === 'boolean') {
        value = value === true || value === 'true';
      } else if (binding.type === 'select') {
        const selectedValue = this.scalarString(value, binding.label);
        const allowed = (binding.options || []).map((item) =>
          typeof item.value === 'number' ? item.value.toString() : item.value,
        );
        if (allowed.length && !allowed.includes(selectedValue)) {
          throw new BadRequestException(`${binding.label} 选项无效`);
        }
        value = selectedValue;
      } else {
        const textValue = this.scalarString(value, binding.label);
        if (textValue.length > 20_000) {
          throw new BadRequestException(`${binding.label} 内容过长`);
        }
        value = textValue;
      }
      node.inputs[binding.inputKey] = value;
    }
  }

  private async validateParameters(
    userId: number,
    bindings: ComfyInputBinding[],
    parameters: Record<string, unknown>,
  ) {
    const allowed = new Set(
      bindings
        .filter((binding) => binding.type !== 'outputPrefix')
        .map((binding) => binding.key),
    );
    for (const key of Object.keys(parameters)) {
      if (!allowed.has(key)) throw new BadRequestException(`未开放参数 ${key}`);
    }
    for (const binding of bindings) {
      if (binding.type === 'outputPrefix') continue;
      const value = parameters[binding.key] ?? binding.defaultValue;
      if (
        binding.required &&
        (value === undefined || value === null || value === '')
      ) {
        throw new BadRequestException(`请填写 ${binding.label}`);
      }
      if (
        binding.type === 'image' &&
        value !== undefined &&
        value !== null &&
        value !== ''
      ) {
        await this.materials.findOwned(Number(value), userId);
      }
    }
  }

  private collectOutputs(value: unknown, allowedNodeIds: string[]) {
    const outputs = (value ?? {}) as Record<string, Record<string, unknown>>;
    const allowed = new Set(allowedNodeIds);
    const descriptors: OutputDescriptor[] = [];
    for (const [nodeId, nodeOutput] of Object.entries(outputs)) {
      if (allowed.size && !allowed.has(nodeId)) continue;
      for (const candidate of Object.values(nodeOutput ?? {})) {
        if (!Array.isArray(candidate)) continue;
        for (const item of candidate) {
          if (
            item &&
            typeof item === 'object' &&
            typeof (item as { filename?: unknown }).filename === 'string'
          ) {
            const file = item as {
              filename: string;
              subfolder?: string;
              type?: string;
            };
            descriptors.push({ ...file, nodeId });
          }
        }
      }
    }
    return descriptors.slice(0, 20);
  }

  private async outputNodeIds(workflowVersionId: number) {
    const row = await this.workflowVersions.findOne({
      where: { id: workflowVersionId },
      select: ['id', 'outputNodeIds'],
    });
    return row?.outputNodeIds?.map(String) ?? [];
  }

  private async findOwned(id: number, userId: number) {
    const task = await this.tasks.findOne({ where: { id, userId } });
    if (!task) throw new NotFoundException('ComfyUI 任务不存在');
    return task;
  }

  private findExecutionTask(statuses: ComfyTaskStatus[]) {
    return this.tasks
      .createQueryBuilder('task')
      .addSelect([
        'task.parameterSnapshot',
        'task.workflowSnapshot',
        'task.bindingSnapshot',
      ])
      .where('task.status IN (:...statuses)', { statuses })
      .andWhere('task.deletedAt IS NULL')
      .orderBy('task.id', 'ASC')
      .getOne();
  }

  private async failTask(
    id: number,
    status: Extract<ComfyTaskStatus, 'failed' | 'unknown'>,
    message: string,
  ) {
    await this.tasks.update(id, {
      status,
      stage: status === 'unknown' ? '执行状态待核实' : '执行失败',
      errorMessage: message.slice(0, 700),
      finishedAt: new Date(),
    });
  }

  private async workflowNameMap(ids: number[]) {
    const map = new Map<number, string>();
    if (!ids.length) return map;
    const rows = await this.workflowRepository.find({
      where: { id: In(Array.from(new Set(ids))) },
      select: ['id', 'name'],
      withDeleted: true,
    });
    for (const row of rows) map.set(row.id, row.name);
    return map;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error
      ? error.message.slice(0, 700)
      : '任务执行失败';
  }

  private scalarString(value: unknown, label: string) {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return value.toString();
    }
    throw new BadRequestException(`${label} 参数类型无效`);
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
