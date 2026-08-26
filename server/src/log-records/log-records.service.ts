import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LogModuleConfigDto, QueryLogRecordDto } from './dto/log-record.dto';
import { LogApiSource } from './entities/log-api-source.entity';
import { LogModuleConfig } from './entities/log-module-config.entity';
import { LogRecord } from './entities/log-record.entity';
import { scanLogApiModules } from './log-api-scanner';

type LogAction = string;

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
  routePath: string;
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

interface LogApiMatch {
  source: LogApiSource;
  relativePath: string;
}

interface LogApiSourceGroup {
  moduleId: string;
  moduleName: string;
  modelName: string;
  tableName: string;
  routePath: string;
  sources: LogApiSource[];
}

@Injectable()
export class LogRecordsService implements OnModuleInit {
  constructor(
    @InjectRepository(LogRecord)
    private readonly logRecordRepository: Repository<LogRecord>,
    @InjectRepository(LogModuleConfig)
    private readonly logModuleConfigRepository: Repository<LogModuleConfig>,
    @InjectRepository(LogApiSource)
    private readonly logApiSourceRepository: Repository<LogApiSource>,
  ) {}

  async onModuleInit() {
    await this.syncScannedApiSources();
  }

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
    await this.ensureApiSourcesPersisted();

    const configs = await this.logModuleConfigRepository.find();
    const configMap = new Map(configs.map((item) => [item.moduleId, item]));
    const groups = await this.findVisibleApiSourceGroups();

    return groups.map((group) => {
      const config = configMap.get(group.moduleId);
      const enabled = Boolean(config?.enabled);
      const enabledActions = enabled
        ? this.normalizeActions(
            group.sources
              .filter((source) => source.isEnabled)
              .map((source) => source.action),
          )
        : [];

      return {
        moduleId: group.moduleId,
        moduleName: group.moduleName,
        modelName: group.modelName,
        tableName: group.tableName,
        routePath: group.routePath,
        enabled,
        enabledActions,
        actions: group.sources.map((source) => ({
          action: source.action,
          label: source.actionLabel,
          method: source.method,
          path: source.apiPath,
          enabled: enabled && source.isEnabled,
        })),
      };
    });
  }

  async updateModuleConfigs(configs: LogModuleConfigDto[]) {
    await this.ensureApiSourcesPersisted();

    const groups = await this.findVisibleApiSourceGroups();
    const groupMap = new Map(groups.map((group) => [group.moduleId, group]));
    const configMap = new Map(
      configs.map((config) => [
        config.moduleId.trim().toLowerCase(),
        {
          enabled: Boolean(config.enabled ?? config.actions?.length),
          actions: this.normalizeActions(config.actions ?? []),
        },
      ]),
    );
    const invalid = Array.from(configMap.keys()).filter(
      (moduleId) => !groupMap.has(moduleId),
    );
    if (invalid.length) {
      throw new BadRequestException(`未知模块：${invalid.join(', ')}`);
    }

    for (const group of groups) {
      const current = configMap.get(group.moduleId);
      const enabled = current?.enabled ?? false;
      const actionSet = new Set(current?.actions ?? []);
      const hasActionLimit = actionSet.size > 0;

      for (const source of group.sources) {
        source.isEnabled =
          enabled && (!hasActionLimit || actionSet.has(source.action));
      }
      await this.logApiSourceRepository.save(group.sources);

      const enabledActions = enabled
        ? this.normalizeActions(
            group.sources
              .filter((source) => source.isEnabled)
              .map((source) => source.action),
          )
        : [];
      const exist = await this.logModuleConfigRepository.findOne({
        where: { moduleId: group.moduleId },
      });
      await this.logModuleConfigRepository.save({
        ...(exist ?? {}),
        moduleId: group.moduleId,
        moduleName: group.moduleName,
        modelName: group.modelName,
        enabled,
        enabledActions,
      });
    }

    return this.findModuleConfigs();
  }

  async recordRequestLog(request: LoggableRequest, response: unknown) {
    const matched = await this.matchMonitoredApi(request);
    if (!matched) return;

    const config = await this.logModuleConfigRepository.findOne({
      where: { moduleId: matched.source.moduleId },
    });
    if (!config?.enabled) return;

    await this.logRecordRepository.save(
      this.logRecordRepository.create({
        moduleId: matched.source.moduleId,
        moduleName: matched.source.moduleName,
        action: matched.source.action,
        recordId: this.resolveRecordId(request, response, matched.relativePath),
        operatorId: request.user?.userId ?? null,
        operatorName: request.user?.username ?? '',
        summary: this.buildSummary(matched.source),
        beforeData: null,
        afterData: null,
        ip: request.ip ?? '',
        userAgent: this.getHeader(request, 'user-agent') ?? null,
      }),
    );
  }

  private async syncScannedApiSources() {
    const scannedModules = scanLogApiModules();
    if (!scannedModules.length) return;

    const [existingSources, moduleConfigs] = await Promise.all([
      this.logApiSourceRepository.find(),
      this.logModuleConfigRepository.find(),
    ]);
    const existingMap = new Map(
      existingSources.map((source) => [
        this.buildSourceKey(source.method, source.apiPath),
        source,
      ]),
    );
    const configMap = new Map(
      moduleConfigs.map((config) => [config.moduleId, config]),
    );
    const scannedKeys = new Set<string>();
    const nextSources: LogApiSource[] = [];

    for (const module of scannedModules) {
      const moduleConfig = configMap.get(module.moduleId);
      for (const api of module.actions) {
        const key = this.buildSourceKey(api.method, api.path);
        scannedKeys.add(key);
        const exist = existingMap.get(key);
        nextSources.push(
          this.logApiSourceRepository.create({
            ...(exist ?? {}),
            moduleId: module.moduleId,
            moduleName: module.moduleName,
            modelName: module.modelName,
            tableName: module.tableName,
            routePath: module.routePath,
            sourceFile: module.sourceFile,
            method: api.method,
            apiPath: api.path,
            action: api.action,
            actionLabel: api.label,
            isSystem: module.isSystem,
            isEnabled: module.isSystem
              ? false
              : (exist?.isEnabled ?? Boolean(moduleConfig?.enabled)),
          }),
        );
      }
    }

    await this.logApiSourceRepository.save(nextSources);

    const obsoleteSources = existingSources.filter(
      (source) =>
        !scannedKeys.has(this.buildSourceKey(source.method, source.apiPath)) &&
        source.isEnabled,
    );
    if (obsoleteSources.length) {
      await this.logApiSourceRepository.save(
        obsoleteSources.map((source) => ({ ...source, isEnabled: false })),
      );
    }
  }

  private async ensureApiSourcesPersisted() {
    const count = await this.logApiSourceRepository.count();
    if (!count) {
      await this.syncScannedApiSources();
    }
  }

  private async findVisibleApiSourceGroups(): Promise<LogApiSourceGroup[]> {
    const sources = await this.logApiSourceRepository.find({
      where: { isSystem: false },
      order: { moduleName: 'ASC', routePath: 'ASC', apiPath: 'ASC' },
    });
    const groupMap = new Map<string, LogApiSourceGroup>();

    for (const source of sources) {
      const exist = groupMap.get(source.moduleId);
      if (exist) {
        exist.sources.push(source);
        continue;
      }
      groupMap.set(source.moduleId, {
        moduleId: source.moduleId,
        moduleName: source.moduleName,
        modelName: source.modelName,
        tableName: source.tableName,
        routePath: source.routePath,
        sources: [source],
      });
    }

    return Array.from(groupMap.values());
  }

  private async matchMonitoredApi(
    request: LoggableRequest,
  ): Promise<LogApiMatch | null> {
    await this.ensureApiSourcesPersisted();

    const path = this.normalizePath(request.originalUrl ?? request.url ?? '');
    const method = request.method.toUpperCase();
    const candidates = await this.logApiSourceRepository.find({
      where: { method, isEnabled: true, isSystem: false },
    });
    const source = candidates
      .sort((a, b) => b.apiPath.length - a.apiPath.length)
      .find((item) => this.createPathPattern(item.apiPath).test(path));

    if (!source) return null;
    return {
      source,
      relativePath: path.slice(source.routePath.length),
    };
  }

  private normalizePath(url: string) {
    const pathname = url.split('?')[0] || '';
    const path = pathname.startsWith('/api')
      ? pathname.slice('/api'.length) || '/'
      : pathname;
    return path || '/';
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

  private buildSummary(source: LogApiSource) {
    return source.actionLabel || `${source.action}${source.moduleName}`;
  }

  private getHeader(request: LoggableRequest, key: string) {
    const value = request.headers?.[key];
    if (Array.isArray(value)) return value.join('; ');
    return value;
  }

  private normalizeActions(actions: string[]): LogAction[] {
    return Array.from(
      new Set(actions.map((item) => item.trim()).filter(Boolean)),
    );
  }

  private buildSourceKey(method: string, apiPath: string) {
    return `${method.toUpperCase()} ${apiPath}`;
  }

  private createPathPattern(route: string) {
    const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = escaped.replace(/:([A-Za-z0-9_]+)/g, '[^/]+');
    return new RegExp(`^${pattern}$`);
  }
}
