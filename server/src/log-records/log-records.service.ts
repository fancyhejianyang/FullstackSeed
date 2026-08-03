import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MODULE_MODEL_MAP } from '../module-models/module-models.map';
import {
  LogModuleConfigDto,
  QueryLogRecordDto,
} from './dto/log-record.dto';
import { LogModuleConfig } from './entities/log-module-config.entity';
import { LogRecord } from './entities/log-record.entity';

type LogAction = 'read' | 'create' | 'update' | 'delete' | 'batchDelete';

export interface LogModuleActionConfig {
  action: LogAction;
  label: string;
  method: string;
  path: string;
  enabled: boolean;
}

export interface LogModuleConfigItem {
  moduleId: string;
  moduleName: string;
  modelName: string;
  tableName: string;
  enabled: boolean;
  enabledActions: LogAction[];
  actions: LogModuleActionConfig[];
}

interface LoggableRequest {
  method: string;
  originalUrl?: string;
  url?: string;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  user?: {
    userId?: number;
    username?: string;
  };
}

const ACTION_LABEL_MAP: Record<LogAction, string> = {
  read: '查看',
  create: '新增',
  update: '编辑',
  delete: '删除',
  batchDelete: '批量删除',
};

const LOG_ACTIONS: Array<{
  action: LogAction;
  method: string;
  pathSuffix: string;
}> = [
  { action: 'read', method: 'GET', pathSuffix: '/:id' },
  { action: 'create', method: 'POST', pathSuffix: '' },
  { action: 'update', method: 'PATCH', pathSuffix: '/:id' },
  { action: 'delete', method: 'DELETE', pathSuffix: '/:id' },
  { action: 'batchDelete', method: 'POST', pathSuffix: '/batch-delete' },
];

@Injectable()
export class LogRecordsService {
  constructor(
    @InjectRepository(LogRecord)
    private readonly logRecordRepository: Repository<LogRecord>,
    @InjectRepository(LogModuleConfig)
    private readonly logModuleConfigRepository: Repository<LogModuleConfig>,
  ) {}

  async findAll(query: QueryLogRecordDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const qb = this.logRecordRepository
      .createQueryBuilder('log')
      .orderBy('log.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (query.moduleId) {
      qb.andWhere('log.moduleId = :moduleId', { moduleId: query.moduleId });
    }
    if (query.action) {
      qb.andWhere('log.action = :action', { action: query.action });
    }
    if (query.keyword) {
      qb.andWhere(
        '(log.moduleName LIKE :kw OR log.action LIKE :kw OR log.recordId LIKE :kw OR log.operatorName LIKE :kw OR log.summary LIKE :kw)',
        { kw: `%${query.keyword}%` },
      );
    }

    const [list, total] = await qb.getManyAndCount();
    return { list, total };
  }

  async findModuleConfigs(): Promise<LogModuleConfigItem[]> {
    const configs = await this.logModuleConfigRepository.find();
    const configMap = new Map(configs.map((item) => [item.moduleId, item]));
    return Object.values(MODULE_MODEL_MAP).map((meta) => {
      const enabledActions = this.normalizeEnabledActions(
        configMap.get(meta.moduleId),
      );
      return {
        moduleId: meta.moduleId,
        moduleName: meta.moduleName,
        modelName: meta.modelName,
        tableName: meta.tableName,
        enabled: enabledActions.length > 0,
        enabledActions,
        actions: LOG_ACTIONS.map((item) => ({
          action: item.action,
          label: ACTION_LABEL_MAP[item.action],
          method: item.method,
          path: `${meta.routePath}${item.pathSuffix}`,
          enabled: enabledActions.includes(item.action),
        })),
      };
    });
  }

  async updateModuleConfigs(configs: LogModuleConfigDto[]) {
    const configMap = new Map(
      configs.map((config) => [
        config.moduleId.trim().toLowerCase(),
        this.normalizeActions(config.actions),
      ]),
    );
    const invalid = Array.from(configMap.keys()).filter(
      (moduleId) => !MODULE_MODEL_MAP[moduleId],
    );
    if (invalid.length) {
      throw new BadRequestException(`未知模块：${invalid.join(', ')}`);
    }

    for (const meta of Object.values(MODULE_MODEL_MAP)) {
      const enabledActions = configMap.get(meta.moduleId) ?? [];
      const exist = await this.logModuleConfigRepository.findOne({
        where: { moduleId: meta.moduleId },
      });
      await this.logModuleConfigRepository.save({
        ...(exist ?? {}),
        moduleId: meta.moduleId,
        moduleName: meta.moduleName,
        modelName: meta.modelName,
        enabled: enabledActions.length > 0,
        enabledActions,
      });
    }

    return this.findModuleConfigs();
  }

  async recordRequestLog(request: LoggableRequest, response: unknown) {
    const matched = this.matchModule(request);
    if (!matched) return;

    const config = await this.logModuleConfigRepository.findOne({
      where: { moduleId: matched.meta.moduleId },
    });
    if (!this.isActionEnabled(config, matched.action)) return;

    await this.logRecordRepository.save(
      this.logRecordRepository.create({
        moduleId: matched.meta.moduleId,
        moduleName: matched.meta.moduleName,
        action: matched.action,
        recordId: this.resolveRecordId(request, response, matched.relativePath),
        operatorId: request.user?.userId ?? null,
        operatorName: request.user?.username ?? '',
        summary: this.buildSummary(matched.meta.moduleName, matched.action),
        beforeData: null,
        afterData: null,
        ip: request.ip ?? '',
        userAgent: this.getHeader(request, 'user-agent') ?? null,
      }),
    );
  }

  private matchModule(request: LoggableRequest) {
    const path = this.normalizePath(request.originalUrl ?? request.url ?? '');
    const metas = Object.values(MODULE_MODEL_MAP).sort(
      (a, b) => b.routePath.length - a.routePath.length,
    );
    const meta = metas.find(
      (item) => path === item.routePath || path.startsWith(`${item.routePath}/`),
    );
    if (!meta) return null;

    const relativePath = path.slice(meta.routePath.length);
    const action = this.resolveAction(request.method, relativePath);
    if (!action) return null;

    return { meta, action, relativePath };
  }

  private normalizePath(url: string) {
    const pathname = url.split('?')[0] || '';
    const path = pathname.startsWith('/api')
      ? pathname.slice('/api'.length) || '/'
      : pathname;
    return path || '/';
  }

  private resolveAction(method: string, relativePath: string): LogAction | null {
    const normalizedMethod = method.toUpperCase();
    if (normalizedMethod === 'GET') {
      return relativePath && relativePath !== '/' ? 'read' : null;
    }
    if (normalizedMethod === 'POST') {
      return relativePath === '/batch-delete' ? 'batchDelete' : 'create';
    }
    if (normalizedMethod === 'PATCH' || normalizedMethod === 'PUT') {
      return 'update';
    }
    if (normalizedMethod === 'DELETE') {
      return 'delete';
    }
    return null;
  }

  private resolveRecordId(
    request: LoggableRequest,
    response: unknown,
    relativePath: string,
  ) {
    const paramsId = request.params?.id;
    if (paramsId) return String(paramsId);

    const bodyIds = request.body?.ids;
    if (Array.isArray(bodyIds)) return bodyIds.map(String).join(',');

    const responseId = this.getObjectId(response);
    if (responseId !== undefined) return String(responseId);

    const pathId = relativePath.split('/').filter(Boolean)[0];
    return pathId ?? '';
  }

  private getObjectId(value: unknown): string | number | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const maybe = value as { id?: unknown; data?: unknown };
    if (typeof maybe.id === 'string' || typeof maybe.id === 'number') {
      return maybe.id;
    }
    return this.getObjectId(maybe.data);
  }

  private buildSummary(moduleName: string, action: LogAction) {
    return `${ACTION_LABEL_MAP[action]}${moduleName}`;
  }

  private getHeader(request: LoggableRequest, key: string) {
    const value = request.headers?.[key];
    if (Array.isArray(value)) return value.join('; ');
    return value;
  }

  private normalizeEnabledActions(config: LogModuleConfig | undefined) {
    if (!config) return [];
    return this.normalizeActions(
      config.enabledActions?.length
        ? config.enabledActions
        : config.enabled
          ? LOG_ACTIONS.map((item) => item.action)
          : [],
    );
  }

  private normalizeActions(actions: string[]): LogAction[] {
    const validActions = new Set<LogAction>(
      LOG_ACTIONS.map((item) => item.action),
    );
    return Array.from(new Set(actions)).filter((action): action is LogAction =>
      validActions.has(action as LogAction),
    );
  }

  private isActionEnabled(
    config: LogModuleConfig | null,
    action: LogAction,
  ): boolean {
    return this.normalizeEnabledActions(config ?? undefined).includes(action);
  }
}
