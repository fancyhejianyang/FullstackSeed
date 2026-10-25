import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { AiCommandDefinitionsService } from '../ai-command-definitions/ai-command-definitions.service';
import { AI_BUSINESS_COMMAND_CATALOG } from '../ai-command-definitions/ai-command-definitions.constants';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import {
  type CreateAgentAppDto,
  type QueryAgentAppDto,
  type UpdateAgentAppDto,
} from './dto/agent-app.dto';
import { AgentApp } from './entities/agent-app.entity';
import { normalizeModelRouting } from './agent-model-routing';
import type { AgentMediaModels } from './agent-media-models';
import {
  AGENT_RUNTIME_TOOL_KEYS,
  AGENT_WRITE_TOOL_KEYS,
} from './agent-apps.constants';

@Injectable()
export class AgentAppsService {
  constructor(
    @InjectRepository(AgentApp)
    private readonly repository: Repository<AgentApp>,
    private readonly providersService: KnowledgeAiProvidersService,
    private readonly commandDefinitionsService: AiCommandDefinitionsService,
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
          { ...baseWhere, instructionMarkdown: Like(`%${keyword}%`) },
          { ...baseWhere, providerName: Like(`%${keyword}%`) },
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
    const [apps, businessTools] = await Promise.all([
      this.repository.find({
        where: { isEnabled: true },
        order: { name: 'ASC', id: 'ASC' },
        take: 200,
      }),
      this.getAvailableBusinessTools(),
    ]);
    const toolMap = new Map(
      businessTools.map((item) => [item.commandKey, item]),
    );
    return apps
      .filter((app) => this.canUse(app, user))
      .map((app) => {
        const toolKeys = this.filterExecutableToolKeys(app, businessTools);
        return {
          id: app.id,
          name: app.name,
          responsibility: app.responsibility,
          models: [...(app.models ?? [])],
          toolKeys,
          tools: toolKeys
            .map((key) => toolMap.get(key))
            .filter((item) => item !== undefined),
          writeEnabled:
            app.writeEnabled &&
            toolKeys.some((key) => AGENT_WRITE_TOOL_KEYS.includes(key)),
          maxToolCalls: app.maxToolCalls,
          timeoutSeconds: app.timeoutSeconds,
          mediaCapabilities: {
            vision:
              !!app.mediaModels?.vision &&
              app.mediaModels.vision.providerId === app.providerId,
            imageGeneration:
              !!app.mediaModels?.imageGeneration &&
              app.mediaModels.imageGeneration.providerId === app.providerId,
          },
        };
      });
  }

  /** 实时能力交集；调用方还须校验当前员工的业务权限，不可只信任历史应用配置。 */
  public async getExecutableToolKeys(app: AgentApp): Promise<string[]> {
    return this.filterExecutableToolKeys(
      app,
      await this.getAvailableBusinessTools(),
    );
  }

  private filterExecutableToolKeys(
    app: AgentApp,
    tools: Array<{ commandKey: string; runtimeAvailable: boolean }>,
  ): string[] {
    const availableKeys = new Set(
      tools
        .filter((tool) => tool.runtimeAvailable)
        .map((tool) => tool.commandKey),
    );
    return Array.from(new Set(app.toolKeys ?? [])).filter(
      (key) =>
        availableKeys.has(key) &&
        (app.writeEnabled || !AGENT_WRITE_TOOL_KEYS.includes(key)),
    );
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
    const [providers, businessTools] = await Promise.all([
      this.providersService.findAll({
        page: 1,
        pageSize: 200,
        isEnabled: true,
      }),
      this.getAvailableBusinessTools(),
    ]);
    return {
      providers: providers.list
        .map((item) => ({
          id: item.id,
          name: item.name,
          secretKeySet: item.secretKeySet,
          models: this.parseModelOptions(item.models, item.textModels),
        }))
        .filter((item) => item.secretKeySet && item.models.length)
        .map(({ id, name, models }) => ({ id, name, models })),
      businessTools,
      mediaModels: {
        vision: providers.list
          .filter((item) => item.secretKeySet)
          .flatMap((item) =>
            this.parseModelOptions(item.visionModels).map((model) => ({
              providerId: item.id,
              providerName: item.name,
              model: model.value,
              text: model.text,
            })),
          ),
        imageGeneration: providers.list
          .filter((item) => item.secretKeySet)
          .flatMap((item) =>
            this.parseModelOptions(item.imageGenerationModels)
              .filter(
                (model) =>
                  item.imageEndpointModels?.includes(model.value) ??
                  !!item.imageGenerationApiUrl,
              )
              .map((model) => ({
                providerId: item.id,
                providerName: item.name,
                model: model.value,
                text: model.text,
              })),
          ),
      },
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
    if (dto.instructionMarkdown !== undefined) {
      payload.instructionMarkdown = dto.instructionMarkdown.trim();
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
    if (
      dto.modelRouting !== undefined ||
      dto.models !== undefined ||
      isCreate
    ) {
      payload.modelRouting = normalizeModelRouting(
        dto.modelRouting ?? current?.modelRouting,
        payload.models ?? current?.models ?? [],
      );
    }
    // Agent 已改用 Markdown 工作指令，不再从配置绑定知识工作流。
    payload.workflowId = null;
    payload.workflowName = null;
    if (
      dto.mediaModels !== undefined ||
      dto.providerId !== undefined ||
      isCreate
    ) {
      payload.mediaModels = await this.normalizeMediaModels(
        dto.mediaModels,
        payload.providerId ?? current?.providerId,
        current?.mediaModels,
      );
    }
    if (dto.toolKeys !== undefined || isCreate) {
      const toolKeys = Array.from(new Set(dto.toolKeys ?? []));
      const unsupportedToolKeys = toolKeys.filter(
        (key) => !AGENT_RUNTIME_TOOL_KEYS.includes(key),
      );
      if (unsupportedToolKeys.length) {
        throw new BadRequestException(
          `业务工具尚未接入 Agent 执行器，请手动移除后保存：${unsupportedToolKeys.join('、')}`,
        );
      }
      const availableToolKeys = new Set(
        (await this.getAvailableBusinessTools())
          .filter((item) => item.runtimeAvailable)
          .map((item) => item.commandKey),
      );
      const unavailableToolKeys = toolKeys.filter(
        (key) => !availableToolKeys.has(key),
      );
      if (unavailableToolKeys.length) {
        throw new BadRequestException(
          `业务工具未启用或不允许聊天调用：${unavailableToolKeys.join('、')}`,
        );
      }
      payload.toolKeys = toolKeys;
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
    const selectedWriteTools = toolKeys.filter(
      (key) =>
        AGENT_WRITE_TOOL_KEYS.includes(key) &&
        AGENT_RUNTIME_TOOL_KEYS.includes(key),
    );
    if (writeEnabled && !selectedWriteTools.length) {
      throw new BadRequestException(
        '启用写入时必须至少选择一个已接入执行器的写入工具',
      );
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

  private async normalizeMediaModels(
    input: Partial<AgentMediaModels> | null | undefined,
    providerId: number | null | undefined,
    current?: AgentMediaModels | null,
  ): Promise<AgentMediaModels> {
    const result: AgentMediaModels = {
      vision:
        input === null
          ? null
          : input?.vision === undefined
            ? (current?.vision ?? null)
            : input.vision,
      imageGeneration:
        input === null
          ? null
          : input?.imageGeneration === undefined
            ? (current?.imageGeneration ?? null)
            : input.imageGeneration,
    };
    for (const key of ['vision', 'imageGeneration'] as const) {
      const reference = result[key];
      if (!reference) continue;
      const label = key === 'vision' ? '图片识别' : '图片生成';
      if (reference.providerId !== providerId)
        throw new BadRequestException(
          `${label}模型必须属于当前所选模型账号，请清除旧引用或重新选择`,
        );
      if (
        !Number.isInteger(reference.providerId) ||
        reference.providerId < 1 ||
        typeof reference.model !== 'string' ||
        !reference.model.trim()
      ) {
        throw new BadRequestException(`${label}模型引用无效`);
      }
      const provider = await this.providersService.findOne(
        reference.providerId,
      );
      if (!provider.isEnabled || !provider.secretKeySet)
        throw new BadRequestException(`${label}模型账号未启用或未配置密钥`);
      if (
        key === 'imageGeneration' &&
        !(
          provider.imageEndpointModels?.includes(reference.model.trim()) ??
          !!provider.imageGenerationApiUrl
        )
      )
        throw new BadRequestException(
          '请先在模型厂商调用接口中配置文生图场景，或补充账号兼容生图接口地址',
        );
      const models = this.parseModelOptions(
        key === 'vision'
          ? provider.visionModels
          : provider.imageGenerationModels,
      );
      const model = reference.model.trim();
      if (!models.some((item) => item.value === model))
        throw new BadRequestException(
          `${label}模型未登记在账号的对应能力目录中，请重新选择`,
        );
      result[key] = { providerId: reference.providerId, model };
    }
    return result;
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

  private async getAvailableBusinessTools() {
    const businessCatalogKeys = new Set(
      AI_BUSINESS_COMMAND_CATALOG.map((item) => item.commandKey),
    );
    const definitions = await this.commandDefinitionsService.findAll({
      page: 1,
      pageSize: 200,
      chatCallable: true,
      isEnabled: true,
    });
    return [
      {
        commandKey: 'product.query',
        name: '产品/SKU 智能查询',
        action: 'read' as const,
        requireApproval: false,
        description: '兼容现有工作台的产品与 SKU 聚合事实查询。',
        runtimeAvailable: true,
        unavailableReason: null as string | null,
      },
      ...definitions.list
        .filter((item) => businessCatalogKeys.has(item.commandKey))
        .map((item) => ({
          commandKey: item.commandKey,
          name: item.name,
          action: item.action,
          requireApproval: item.requireApproval,
          description: item.description,
          runtimeAvailable: AGENT_RUNTIME_TOOL_KEYS.includes(item.commandKey),
          unavailableReason: AGENT_RUNTIME_TOOL_KEYS.includes(item.commandKey)
            ? null
            : '仅登记了指令契约，尚未接入 Agent 执行器',
        })),
    ];
  }
}
