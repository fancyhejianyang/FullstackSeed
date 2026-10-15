import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { AiFeatureConfigsService } from '../ai-feature-configs/ai-feature-configs.service';
import { AiWorkflowsService } from '../ai-workflows/ai-workflows.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
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
    private readonly featureConfigsService: AiFeatureConfigsService,
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
          { ...baseWhere, aiFeatureConfigName: Like(`%${keyword}%`) },
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
    const [chatConfigs, workflows] = await Promise.all([
      this.featureConfigsService.findAll({
        page: 1,
        pageSize: 200,
        featureType: 'chat',
        isEnabled: true,
      }),
      this.workflowsService.findAll({
        page: 1,
        pageSize: 200,
        isEnabled: true,
      }),
    ]);
    return {
      chatConfigs: chatConfigs.list.map((item) => ({
        id: item.id,
        name: item.name,
        providerName: item.providerName,
        model: item.model,
      })),
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
    if (dto.aiFeatureConfigId !== undefined) {
      const config = await this.featureConfigsService.findUsableChatConfig(
        dto.aiFeatureConfigId,
      );
      payload.aiFeatureConfigId = config.id;
      payload.aiFeatureConfigName = config.name;
    }
    if (dto.workflowId !== undefined) {
      const workflow = await this.workflowsService.findUsable(dto.workflowId);
      payload.workflowId = workflow.id;
      payload.workflowName = workflow.name;
    }
    if (dto.toolKeys !== undefined) payload.toolKeys = [...dto.toolKeys];
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
}
