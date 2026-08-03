import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MODULE_MODEL_MAP } from '../module-models/module-models.map';
import { QueryLogRecordDto } from './dto/log-record.dto';
import { LogModuleConfig } from './entities/log-module-config.entity';
import { LogRecord } from './entities/log-record.entity';

export interface LogModuleConfigItem {
  moduleId: string;
  moduleName: string;
  modelName: string;
  tableName: string;
  enabled: boolean;
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

type LogAction = 'read' | 'create' | 'update' | 'delete' | 'batchDelete';

const ACTION_LABEL_MAP: Record<LogAction, string> = {
  read: '查看',
  create: '新增',
  update: '编辑',
  delete: '删除',
  batchDelete: '批量删除',
};

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
    return Object.values(MODULE_MODEL_MAP).map((meta) => ({
      moduleId: meta.moduleId,
      moduleName: meta.moduleName,
      modelName: meta.modelName,
      tableName: meta.tableName,
      enabled: !!configMap.get(meta.moduleId)?.enabled,
    }));
  }

  async updateModuleConfigs(moduleIds: string[]) {
    const selected = new Set(
      moduleIds.map((moduleId) => moduleId.trim().toLowerCase()),
    );
    const invalid = Array.from(selected).filter(
      (moduleId) => !MODULE_MODEL_MAP[moduleId],
    );
    if (invalid.length) {
      throw new BadRequestException(`未知模块：${invalid.join(', ')}`);
    }

    for (const meta of Object.values(MODULE_MODEL_MAP)) {
      const enabled = selected.has(meta.moduleId);
      const exist = await this.logModuleConfigRepository.findOne({
        where: { moduleId: meta.moduleId },
      });
      await this.logModuleConfigRepository.save({
        ...(exist ?? {}),
        moduleId: meta.moduleId,
        moduleName: meta.moduleName,
        modelName: meta.modelName,
        enabled,
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
    if (!config?.enabled) return;

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
}
