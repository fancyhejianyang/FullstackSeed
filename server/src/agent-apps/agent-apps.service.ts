import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { AiWorkflowsService } from '../ai-workflows/ai-workflows.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import {
  type CreateAgentAppDto,
  type QueryAgentAppDto,
  type UpdateAgentAppDto,
} from './dto/agent-app.dto';
import { AgentApp } from './entities/agent-app.entity';

@Injectable()
export class AgentAppsService {
  constructor(
    @InjectRepository(AgentApp)
    private readonly repository: Repository<AgentApp>,
    private readonly providersService: KnowledgeAiProvidersService,
    private readonly workflowsService: AiWorkflowsService,
  ) {}

  async findAll(query: QueryAgentAppDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const keyword = query.keyword?.trim();
    const baseWhere =
      query.isEnabled === undefined ? {} : { isEnabled: query.isEnabled };
    const where = keyword
      ? [
          { ...baseWhere, name: Like(`%${keyword}%`) },
          { ...baseWhere, responsibility: Like(`%${keyword}%`) },
          { ...baseWhere, providerName: Like(`%${keyword}%`) },
          { ...baseWhere, workflowName: Like(`%${keyword}%`) },
        ]
      : baseWhere;
    const [list, total] = await this.repository.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total };
  }

  async findOne(id: number) {
    const app = await this.repository.findOne({ where: { id } });
    if (!app) throw new NotFoundException('Agent 应用不存在');
    return app;
  }

  async findAvailable(user: AuthUser) {
    const apps = await this.repository.find({
      where: { isEnabled: true },
      order: { name: 'ASC', id: 'ASC' },
      take: 200,
    });
    return apps
      .filter((app) => this.canUse(app, user))
      .map((app) => ({
        id: app.id,
        name: app.name,
        responsibility: app.responsibility,
        knowledgeEnabled: Boolean(app.workflowId),
        workflowName: app.workflowName,
        toolKeys: app.toolKeys,
        writeEnabled: app.writeEnabled,
        maxToolCalls: app.maxToolCalls,
        timeoutSeconds: app.timeoutSeconds,
      }));
  }

  async findAvailableOne(id: number, user: AuthUser) {
    const app = await this.findOne(id);
    if (!app.isEnabled) throw new ForbiddenException('该 Agent 应用已停用');
    if (!this.canUse(app, user)) {
      throw new ForbiddenException('你不在该 Agent 应用的可使用人员范围内');
    }
    return app;
  }

  async getConfigurationOptions() {
    const [providers, workflows] = await Promise.all([
      this.providersService.findAll({
        page: 1,
        pageSize: 200,
        isEnabled: true,
      }),
      this.workflowsService.findAll({
        page: 1,
        pageSize: 200,
        isEnabled: true,
      }),
    ]);
    return {
      providers: providers.list
        .map((item) => ({
          id: item.id,
          name: item.name,
          secretKeySet: item.secretKeySet,
          models: this.parseModelOptions(
            item.textModels?.trim() ? item.textModels : item.models,
          ),
        }))
        .filter((item) => item.secretKeySet && item.models.length)
        .map(({ id, name, models }) => ({ id, name, models })),
      workflows: workflows.list.map((item) => ({
        id: item.id,
        name: item.name,
      })),
    };
  }

  async create(dto: CreateAgentAppDto) {
    const payload = await this.toPayload(dto, true);
    return this.repository.save(this.repository.create(payload));
  }

  async update(id: number, dto: UpdateAgentAppDto) {
    const app = await this.findOne(id);
    Object.assign(app, await this.toPayload(dto, false, app));
    return this.repository.save(app);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.repository.softDelete(id);
    return { id };
  }

  async batchRemove(ids: number[]) {
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) return { ids: [] };
    const count = await this.repository.count({ where: { id: In(uniqueIds) } });
    if (count !== uniqueIds.length) {
      throw new NotFoundException('部分 Agent 应用不存在');
    }
    await this.repository.softDelete(uniqueIds);
    return { ids: uniqueIds };
  }

  private canUse(app: AgentApp, user: AuthUser) {
    return (
      user.isAdmin ||
      app.accessScope === 'all' ||
      (app.allowedUserIds ?? []).includes(user.userId)
    );
  }

  private async toPayload(
    dto: CreateAgentAppDto | UpdateAgentAppDto,
    isCreate: boolean,
    current?: AgentApp,
  ) {
    const payload: Partial<AgentApp> = {};
    if (dto.name !== undefined) payload.name = dto.name.trim();
    if (dto.responsibility !== undefined) {
      payload.responsibility = dto.responsibility.trim();
    }
    if (dto.providerId !== undefined || dto.models !== undefined || isCreate) {
      const providerId = dto.providerId ?? current?.providerId;
      const models = Array.from(
        new Set(
          (dto.models ?? current?.models ?? []).map((item) => item.trim()),
        ),
      ).filter(Boolean);
      if (!providerId || !models.length) {
        throw new BadRequestException('请选择模型账号和至少一个模型');
      }
      let providerName = '';
      for (const model of models) {
        const target = await this.providersService.resolveChatTarget({
          id: providerId,
          model,
        });
        providerName = target.providerName;
      }
      payload.providerId = providerId;
      payload.providerName = providerName;
      payload.models = models;
    }
    if (dto.workflowId !== undefined || isCreate) {
      if (dto.workflowId) {
        const workflow = await this.workflowsService.findUsable(dto.workflowId);
        payload.workflowId = workflow.id;
        payload.workflowName = workflow.name;
      } else {
        payload.workflowId = null;
        payload.workflowName = null;
      }
    }
    if (dto.toolKeys !== undefined || isCreate) {
      payload.toolKeys = [...(dto.toolKeys ?? [])];
    }
    if (dto.accessScope !== undefined || isCreate) {
      payload.accessScope = dto.accessScope ?? 'all';
    }
    if (dto.allowedUserIds !== undefined || isCreate) {
      payload.allowedUserIds = Array.from(new Set(dto.allowedUserIds ?? []));
    }
    if (dto.isEnabled !== undefined || isCreate) {
      payload.isEnabled = dto.isEnabled ?? true;
    }
    if (dto.writeEnabled !== undefined || isCreate) {
      payload.writeEnabled = dto.writeEnabled ?? false;
    }
    if (dto.maxToolCalls !== undefined || isCreate) {
      payload.maxToolCalls = dto.maxToolCalls ?? 5;
    }
    if (dto.timeoutSeconds !== undefined || isCreate) {
      payload.timeoutSeconds = dto.timeoutSeconds ?? 60;
    }
    if (dto.maxConcurrentRuns !== undefined || isCreate) {
      payload.maxConcurrentRuns = dto.maxConcurrentRuns ?? 1;
    }

    const toolKeys = payload.toolKeys ?? current?.toolKeys ?? [];
    const writeEnabled = payload.writeEnabled ?? current?.writeEnabled ?? false;
    if (writeEnabled && !toolKeys.includes('productSku.create')) {
      throw new BadRequestException('启用写入时必须勾选新增 SKU 工具');
    }
    if (!writeEnabled && toolKeys.includes('productSku.create')) {
      payload.toolKeys = toolKeys.filter((key) => key !== 'productSku.create');
    }
    const accessScope = payload.accessScope ?? current?.accessScope ?? 'all';
    const allowedUserIds =
      payload.allowedUserIds ?? current?.allowedUserIds ?? [];
    if (accessScope === 'users' && !allowedUserIds.length) {
      throw new BadRequestException('指定人员范围时至少选择一名用户');
    }
    if (accessScope === 'all') payload.allowedUserIds = [];
    return payload;
  }

  private parseModelOptions(...sources: Array<string | null | undefined>) {
    const options = new Map<string, string>();
    for (const source of sources) {
      for (const line of (source ?? '').split(/\r?\n/)) {
        const normalized = line.trim();
        if (!normalized) continue;
        const [rawCode, ...nameParts] = normalized.split('#');
        const value = rawCode.trim();
        if (!value || options.has(value)) continue;
        const name = nameParts.join('#').trim();
        options.set(value, name ? `${name}（${value}）` : value);
      }
    }
    return Array.from(options, ([value, text]) => ({ value, text }));
  }
}
