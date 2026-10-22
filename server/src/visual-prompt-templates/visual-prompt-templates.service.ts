import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import {
  EntityManager,
  In,
  IsNull,
  LessThan,
  Like,
  MoreThan,
  Repository,
} from 'typeorm';
import { AiFeatureConfigsService } from '../ai-feature-configs/ai-feature-configs.service';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import {
  ComposeVisualPromptDto,
  QueryVisualPromptTemplateDto,
  SaveVisualPromptTemplateDto,
} from './dto/visual-prompt-template.dto';
import { VisualPromptTemplate } from './entities/visual-prompt-template.entity';
import {
  VisualPromptTask,
  type VisualPromptTaskResult,
  type VisualPromptTaskStatus,
  type VisualPromptTaskType,
} from './entities/visual-prompt-task.entity';
import {
  parseComposedVisualPrompt,
  parseExtractedVisualPrompt,
  VISUAL_PROMPT_COMPOSE_SYSTEM,
  VISUAL_PROMPT_EXTRACT_SYSTEM,
} from './visual-prompt.protocol';

@Injectable()
export class VisualPromptTemplatesService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly workerId = randomUUID();
  private readonly logger = new Logger(VisualPromptTemplatesService.name);
  private timer?: ReturnType<typeof setInterval>;
  private draining = false;
  private stopped = false;
  private activeAbort?: AbortController;

  constructor(
    @InjectRepository(VisualPromptTemplate)
    private readonly repository: Repository<VisualPromptTemplate>,
    @InjectRepository(VisualPromptTask)
    private readonly tasks: Repository<VisualPromptTask>,
    private readonly configs: AiFeatureConfigsService,
    private readonly providers: KnowledgeAiProvidersService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick().catch(() =>
        this.logger.warn('提示词总结任务调度暂不可用，将稍后检查'),
      );
    }, 2000);
    this.timer.unref();
    void this.tick().catch(() =>
      this.logger.warn('提示词总结任务首次调度失败，将稍后重试'),
    );
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.activeAbort?.abort();
  }

  async findAll(query: QueryVisualPromptTemplateDto, userId: number) {
    const base = {
      userId,
      ...(query.mediaType ? { mediaType: query.mediaType } : {}),
    };
    const keyword = query.keyword?.trim();
    const [list, total] = await this.repository.findAndCount({
      select: {
        id: true,
        name: true,
        mediaType: true,
        targetModel: true,
        styleSummary: true,
        aiConfigName: true,
        version: true,
        isEnabled: true,
        extractedAt: true,
        updatedAt: true,
      },
      where: keyword
        ? [
            { ...base, name: Like(`%${keyword}%`) },
            { ...base, targetModel: Like(`%${keyword}%`) },
            { ...base, styleSummary: Like(`%${keyword}%`) },
          ]
        : base,
      order: { id: 'DESC' },
      skip: ((query.page ?? 1) - 1) * (query.pageSize ?? 10),
      take: query.pageSize ?? 10,
    });
    return { list, total };
  }

  async findOne(id: number, userId: number) {
    const row = await this.repository.findOne({ where: { id, userId } });
    if (!row) throw new NotFoundException('提示词总结不存在');
    return row;
  }

  async options(query: QueryVisualPromptTemplateDto, userId: number) {
    const qb = this.repository
      .createQueryBuilder('template')
      .where('template.userId = :userId', { userId })
      .andWhere('template.isEnabled = :enabled', { enabled: true })
      .andWhere('template.mediaType = :mediaType', {
        mediaType: query.mediaType ?? 'image',
      });
    if (query.targetModel?.trim()) {
      qb.andWhere(
        '(template.targetModel = :model OR template.targetModel IS NULL)',
        {
          model: query.targetModel.trim(),
        },
      ).orderBy('template.targetModel IS NULL', 'ASC');
    } else {
      qb.orderBy('template.id', 'DESC');
    }
    return qb
      .select([
        'template.id',
        'template.name',
        'template.mediaType',
        'template.targetModel',
        'template.styleSummary',
        'template.version',
      ])
      .take(100)
      .getMany();
  }

  async aiConfigOptions() {
    return this.configs.visualPromptOptions();
  }

  async create(dto: SaveVisualPromptTemplateDto, userId: number) {
    const config = await this.configs.findUsableVisualPromptConfig(
      dto.aiConfigId,
    );
    return this.repository.save(
      this.repository.create({
        ...this.payload(dto),
        userId,
        aiConfigName: config.name,
        version: 1,
      }),
    );
  }

  async syncFromComfyWorkflow(
    input: {
      templateId?: number | null;
      workflowName: string;
      mediaType: 'image' | 'video';
      targetModel?: string | null;
      positivePrompt: string;
      negativePrompt?: string | null;
    },
    userId: number,
    manager: EntityManager,
  ) {
    const sourcePrompt = input.positivePrompt.trim();
    if (!sourcePrompt) return null;
    const repository = manager.getRepository(VisualPromptTemplate);
    const existing = input.templateId
      ? await repository.findOne({ where: { id: input.templateId } })
      : null;
    let configCandidate = existing
      ? await this.configs
          .findUsableVisualPromptConfig(existing.aiConfigId)
          .catch(() => null)
      : null;
    configCandidate ??= await this.configs.findEnabledByFeature('visualPrompt');
    if (!configCandidate?.id) return null;
    const config = await this.configs
      .findUsableVisualPromptConfig(configCandidate.id)
      .catch(() => null);
    if (!config?.id || !config.name) return null;

    const name = `${input.workflowName.trim()} · 工作流提示词`.slice(0, 120);
    const negativePrompt = input.negativePrompt?.trim() || null;
    const targetModel = input.targetModel?.trim() || null;
    const common = {
      userId: existing?.userId ?? userId,
      name,
      mediaType: input.mediaType,
      targetModel,
      sourcePlatform: 'ComfyUI 工作流',
      aiConfigId: config.id,
      aiConfigName: config.name,
      sourcePrompt,
      sourceNegativePrompt: negativePrompt,
      positiveTemplate: sourcePrompt,
      negativeTemplate: negativePrompt,
      styleSummary: `从 ComfyUI 工作流“${input.workflowName.trim()}”的 Demo 提示词自动建立`,
      modelRules: null,
      variables: null,
      isEnabled: true,
      extractedAt: null,
    };
    if (existing) {
      Object.assign(existing, common, { version: existing.version + 1 });
      return repository.save(existing);
    }
    return repository.save(
      repository.create({
        ...common,
        version: 1,
      }),
    );
  }

  async update(id: number, dto: SaveVisualPromptTemplateDto, userId: number) {
    const row = await this.findOne(id, userId);
    const config = await this.configs.findUsableVisualPromptConfig(
      dto.aiConfigId,
    );
    Object.assign(row, this.payload(dto), {
      aiConfigName: config.name,
      version: row.version + 1,
    });
    return this.repository.save(row);
  }

  async submitExtraction(id: number, userId: number, requestId?: string) {
    const row = await this.findOne(id, userId);
    return this.submitTask({
      userId,
      taskType: 'extract',
      templateId: row.id,
      workflowId: null,
      requestId,
      snapshot: { templateVersion: row.version },
    });
  }

  async submitComposition(
    id: number,
    dto: ComposeVisualPromptDto,
    userId: number,
    requestId?: string,
  ) {
    const row = await this.findOne(id, userId);
    return this.submitTask({
      userId,
      taskType: 'compose',
      templateId: row.id,
      workflowId: null,
      requestId,
      snapshot: {
        templateVersion: row.version,
        idea: dto.idea.trim(),
        targetModel: dto.targetModel?.trim() || row.targetModel || undefined,
      },
    });
  }

  async submitBoundComposition(
    id: number,
    dto: ComposeVisualPromptDto,
    userId: number,
    workflowId: number,
    requestId?: string,
  ) {
    const row = await this.repository.findOne({ where: { id } });
    if (!row) throw new NotFoundException('工作流绑定的提示词总结不存在');
    return this.submitTask({
      userId,
      taskType: 'compose',
      templateId: row.id,
      workflowId,
      requestId,
      snapshot: {
        templateVersion: row.version,
        idea: dto.idea.trim(),
        targetModel: dto.targetModel?.trim() || row.targetModel || undefined,
      },
    });
  }

  async taskDetail(
    id: number,
    userId: number,
    taskType: VisualPromptTaskType,
    workflowId?: number,
  ) {
    const task = await this.tasks.findOne({ where: { id, userId, taskType } });
    if (!task || (workflowId && task.workflowId !== workflowId)) {
      throw new NotFoundException('提示词总结任务不存在');
    }
    return this.taskSummary(task);
  }

  private async executeExtraction(
    id: number,
    userId: number,
    expectedVersion: number,
    signal: AbortSignal,
  ): Promise<VisualPromptTaskResult> {
    const row = await this.findOne(id, userId);
    if (row.version !== expectedVersion) {
      throw new ConflictException('规范已修改，请按最新内容重新发起 AI 提炼');
    }
    const config = await this.configs.findUsableVisualPromptConfig(
      row.aiConfigId,
    );
    const response = await this.call(
      config,
      VISUAL_PROMPT_EXTRACT_SYSTEM,
      {
        mediaType: row.mediaType,
        targetModel: row.targetModel || '通用模型',
        sourcePlatform: row.sourcePlatform,
        positiveExample: row.sourcePrompt,
        negativeExample: row.sourceNegativePrompt,
        existingRules: row.modelRules,
      },
      signal,
    );
    const parsed = parseExtractedVisualPrompt(response);
    if (!parsed)
      throw new BadGatewayException(
        'AI 未返回有效的提示词总结结构，请调整配置后重试',
      );
    const extractedAt = new Date();
    const update = await this.repository.update(
      { id, userId, version: expectedVersion },
      { ...parsed, extractedAt, version: expectedVersion + 1 },
    );
    if (update.affected !== 1) {
      throw new ConflictException(
        '规范在 AI 提炼期间已被修改，结果未覆盖；请重新发起提炼',
      );
    }
    return {
      templateId: id,
      templateVersion: expectedVersion + 1,
      extractedAt: extractedAt.toISOString(),
    };
  }

  private async composeBound(
    id: number,
    dto: ComposeVisualPromptDto,
    expectedVersion: number,
    signal: AbortSignal,
  ) {
    const row = await this.repository.findOne({ where: { id } });
    if (!row) throw new NotFoundException('工作流绑定的提示词总结不存在');
    if (row.version !== expectedVersion) {
      throw new ConflictException('提示词总结已更新，请重新发起转换');
    }
    return this.composeRow(row, dto, signal);
  }

  private async composeRow(
    row: VisualPromptTemplate,
    dto: ComposeVisualPromptDto,
    signal: AbortSignal,
  ) {
    if (!row.isEnabled) throw new BadRequestException('该提示词总结已停用');
    const targetModel =
      dto.targetModel?.trim() || row.targetModel || '通用模型';
    if (
      row.targetModel &&
      dto.targetModel &&
      row.targetModel !== dto.targetModel.trim()
    )
      throw new BadRequestException(`该规范仅适用于模型 ${row.targetModel}`);
    const config = await this.configs.findUsableVisualPromptConfig(
      row.aiConfigId,
    );
    const response = await this.call(
      config,
      VISUAL_PROMPT_COMPOSE_SYSTEM,
      {
        mediaType: row.mediaType,
        targetModel,
        idea: dto.idea,
        positiveTemplate: row.positiveTemplate || row.sourcePrompt,
        negativeTemplate: row.negativeTemplate || row.sourceNegativePrompt,
        styleSummary: row.styleSummary,
        modelRules: row.modelRules,
        variables: row.variables,
      },
      signal,
    );
    const parsed = parseComposedVisualPrompt(response);
    if (!parsed)
      throw new BadGatewayException(
        'AI 未返回有效的正向与负向提示词结构，请调整配置后重试',
      );
    return {
      ...parsed,
      templateId: row.id,
      templateVersion: row.version,
      targetModel,
    };
  }

  private async submitTask(input: {
    userId: number;
    taskType: VisualPromptTaskType;
    templateId: number;
    workflowId: number | null;
    requestId?: string;
    snapshot: VisualPromptTask['snapshot'];
  }) {
    const requestId = input.requestId?.trim() || randomUUID();
    const existing = await this.tasks.findOne({
      where: { userId: input.userId, requestId },
    });
    if (existing) {
      this.assertSameTask(existing, input);
      return this.taskSummary(existing);
    }
    const activeKey = `${input.taskType}:${input.userId}:${
      input.workflowId
        ? `workflow:${input.workflowId}`
        : `template:${input.templateId}`
    }`;
    const active = await this.tasks.findOne({ where: { activeKey } });
    if (active) {
      if (this.isSameTask(active, input)) return this.taskSummary(active);
      throw new ConflictException('已有提示词总结任务正在执行，请等待完成');
    }
    try {
      const saved = await this.tasks.save(
        this.tasks.create({
          ...input,
          requestId,
          activeKey,
          status: 'pending',
          stage: '等待执行',
          result: null,
          errorMessage: null,
          workerId: null,
          leaseExpiresAt: null,
          startedAt: null,
          finishedAt: null,
        }),
      );
      void this.tick().catch(() =>
        this.logger.warn('提示词总结任务提交后调度失败，将稍后重试'),
      );
      return this.taskSummary(saved);
    } catch (error) {
      if ((error as { code?: string }).code !== 'ER_DUP_ENTRY') throw error;
      const retried = await this.tasks.findOne({
        where: [{ userId: input.userId, requestId }, { activeKey }],
      });
      if (retried && this.isSameTask(retried, input)) {
        return this.taskSummary(retried);
      }
      throw new ConflictException('已有提示词总结任务正在执行，请等待完成');
    }
  }

  private assertSameTask(
    task: VisualPromptTask,
    input: Pick<
      VisualPromptTask,
      'taskType' | 'templateId' | 'workflowId' | 'snapshot'
    >,
  ) {
    if (!this.isSameTask(task, input)) {
      throw new ConflictException('请求号已用于其它提示词总结任务');
    }
  }

  private isSameTask(
    task: VisualPromptTask,
    input: Pick<
      VisualPromptTask,
      'taskType' | 'templateId' | 'workflowId' | 'snapshot'
    >,
  ) {
    return (
      task.taskType === input.taskType &&
      task.templateId === input.templateId &&
      task.workflowId === input.workflowId &&
      task.snapshot.templateVersion === input.snapshot.templateVersion &&
      (task.snapshot.idea ?? '') === (input.snapshot.idea ?? '') &&
      (task.snapshot.targetModel ?? '') === (input.snapshot.targetModel ?? '')
    );
  }

  private async tick() {
    if (this.stopped || this.draining) return;
    this.draining = true;
    try {
      await this.tasks.update(
        { status: 'running', leaseExpiresAt: LessThan(new Date()) },
        {
          status: 'interrupted',
          stage: '执行中断',
          activeKey: null,
          finishedAt: new Date(),
          leaseExpiresAt: null,
          errorMessage:
            'AI 执行中断或超时，供应商可能已计费；为避免重复计费未自动重试',
        },
      );
      const task = await this.tasks.findOne({
        where: { status: 'pending' },
        order: { id: 'ASC' },
      });
      if (!task || this.stopped) return;
      const claim = await this.tasks.update(
        { id: task.id, status: 'pending', deletedAt: IsNull() },
        {
          status: 'running',
          stage:
            task.taskType === 'extract'
              ? 'AI 正在从 Demo 提炼规范'
              : 'AI 正在转换提示词',
          workerId: this.workerId,
          startedAt: new Date(),
          leaseExpiresAt: new Date(Date.now() + 150000),
        },
      );
      if (claim.affected !== 1) return;
      await this.runTask(task);
    } finally {
      this.draining = false;
    }
  }

  private async runTask(task: VisualPromptTask) {
    this.activeAbort = new AbortController();
    let status: VisualPromptTaskStatus = 'failed';
    let result: VisualPromptTaskResult | null = null;
    let errorMessage: string | null =
      'AI 任务执行失败，供应商可能已计费；请检查配置后手动重试';
    try {
      if (task.taskType === 'extract') {
        result = await this.executeExtraction(
          task.templateId,
          task.userId,
          task.snapshot.templateVersion,
          this.activeAbort.signal,
        );
      } else {
        result = await this.composeBound(
          task.templateId,
          {
            idea: task.snapshot.idea || '',
            targetModel: task.snapshot.targetModel,
          },
          task.snapshot.templateVersion,
          this.activeAbort.signal,
        );
      }
      status = 'succeeded';
      errorMessage = null;
    } catch (error) {
      errorMessage = this.taskErrorMessage(error);
    }
    if (this.stopped || this.activeAbort.signal.aborted) {
      status = 'interrupted';
      result = null;
      errorMessage =
        '服务停止，AI 任务已中断；供应商可能已计费，为避免重复计费未自动重试';
    }
    this.activeAbort = undefined;
    await this.tasks.update(
      {
        id: task.id,
        status: 'running',
        workerId: this.workerId,
        leaseExpiresAt: MoreThan(new Date()),
      },
      {
        status,
        stage:
          status === 'succeeded'
            ? task.taskType === 'extract'
              ? '提示词总结提炼完成'
              : '提示词转换完成'
            : status === 'interrupted'
              ? '执行中断'
              : '执行失败',
        result,
        errorMessage,
        activeKey: null,
        leaseExpiresAt: null,
        finishedAt: new Date(),
      },
    );
  }

  private taskErrorMessage(error: unknown) {
    if (
      error instanceof Error &&
      ['TimeoutError', 'AbortError'].includes(error.name)
    ) {
      return 'AI 执行超过 120 秒，任务已停止；供应商可能已计费，请核实后重试';
    }
    if (error instanceof Error && error.message.trim()) {
      return error.message.slice(0, 400);
    }
    return 'AI 任务执行失败，供应商可能已计费；请检查配置后手动重试';
  }

  private taskSummary(task: VisualPromptTask) {
    return {
      id: task.id,
      taskType: task.taskType,
      templateId: task.templateId,
      workflowId: task.workflowId,
      requestId: task.requestId,
      status: task.status,
      stage: task.stage,
      result: task.result,
      errorMessage: task.errorMessage,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      finishedAt: task.finishedAt,
    };
  }

  async remove(id: number, userId: number) {
    await this.findOne(id, userId);
    await this.repository.softDelete({ id, userId });
    return { id };
  }

  async batchRemove(ids: number[], userId: number) {
    const unique = [...new Set(ids)];
    if (
      (await this.repository.count({ where: { id: In(unique), userId } })) !==
      unique.length
    )
      throw new NotFoundException('部分提示词总结不存在');
    await this.repository.softDelete({ id: In(unique), userId });
    return { ids: unique };
  }

  private payload(dto: SaveVisualPromptTemplateDto) {
    const optional = (value?: string) => value?.trim() || null;
    return {
      name: dto.name.trim(),
      mediaType: dto.mediaType,
      targetModel: optional(dto.targetModel),
      sourcePlatform: optional(dto.sourcePlatform),
      aiConfigId: dto.aiConfigId,
      sourcePrompt: dto.sourcePrompt.trim(),
      sourceNegativePrompt: optional(dto.sourceNegativePrompt),
      positiveTemplate: optional(dto.positiveTemplate),
      negativeTemplate: optional(dto.negativeTemplate),
      styleSummary: optional(dto.styleSummary),
      modelRules: optional(dto.modelRules),
      variables:
        dto.variables?.map((item) => item.trim()).filter(Boolean) || null,
      isEnabled: dto.isEnabled ?? true,
    };
  }

  private async call(
    config: Awaited<
      ReturnType<AiFeatureConfigsService['findUsableVisualPromptConfig']>
    >,
    builtIn: string,
    data: object,
    signal: AbortSignal,
  ) {
    const response = await this.providers.withExecutionSignal(
      AbortSignal.any([signal, AbortSignal.timeout(120000)]),
      () =>
        this.providers.callChat({
          id: config.providerId!,
          model: config.model!,
          temperature: config.temperature,
          systemPrompt: [config.systemPrompt?.trim(), builtIn]
            .filter(Boolean)
            .join('\n\n'),
          question: JSON.stringify(data),
        }),
    );
    if (!response.isSuccess)
      throw new BadGatewayException(
        '提示词总结 AI 调用失败，请检查模型账号、模型和网络后重试',
      );
    return response.answer;
  }
}
