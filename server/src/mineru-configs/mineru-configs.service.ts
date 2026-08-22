import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Not, Repository } from 'typeorm';
import {
  CreateMineruConfigDto,
  QueryMineruConfigDto,
  UpdateMineruConfigDto,
} from './dto/mineru-config.dto';
import { MineruConfig } from './entities/mineru-config.entity';
import { StorageConfigService } from '../storage-config/storage-config.service';

interface MineruCreateTaskResponse {
  task_id?: string;
  taskId?: string;
  taskID?: string;
  id?: string;
  task_ids?: string[];
  taskIds?: string[];
  code?: string | number;
  message?: string;
  msg?: string;
  error?: string | { message?: string };
  data?: unknown;
}

interface MineruQueryTaskResponse {
  status?: string;
  progress?: number;
  message?: string;
  markdown?: string;
  data?: {
    status?: string;
    progress?: number;
    message?: string;
    markdown?: string;
  };
}

export interface MineruTaskStatus {
  taskId: string;
  status: string;
  progress: number | null;
  message: string;
  markdown: string;
  raw: unknown;
}

export interface MineruCreateTaskResult {
  taskId: string;
  configId: number;
  configName: string;
  pollIntervalSeconds: number;
  timeoutMinutes: number;
  raw: unknown;
}

@Injectable()
export class MineruConfigsService {
  constructor(
    @InjectRepository(MineruConfig)
    private readonly configRepository: Repository<MineruConfig>,
    private readonly storageConfigService: StorageConfigService,
  ) {}

  async findAll(query: QueryMineruConfigDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const keyword = query.keyword?.trim();
    const where = keyword
      ? [
          { name: Like(`%${keyword}%`) },
          { baseUrl: Like(`%${keyword}%`) },
          { modelVersion: Like(`%${keyword}%`) },
        ]
      : {};
    const [list, total] = await this.configRepository.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list: list.map((item) => this.toView(item)), total };
  }

  async findOne(id: number) {
    return this.toView(await this.findEntity(id));
  }

  async create(dto: CreateMineruConfigDto) {
    if (dto.isEnabled) {
      await this.disableOtherConfigs();
    }
    const config = await this.configRepository.save(
      this.configRepository.create(this.toEntityPayload(dto, true)),
    );
    return this.toView(config);
  }

  async update(id: number, dto: UpdateMineruConfigDto) {
    const config = await this.findEntity(id);
    if (dto.isEnabled) {
      await this.disableOtherConfigs(id);
    }
    Object.assign(config, this.toEntityPayload(dto, false));
    const saved = await this.configRepository.save(config);
    return this.toView(saved);
  }

  async remove(id: number) {
    await this.findEntity(id);
    await this.configRepository.softDelete(id);
    return { id };
  }

  async batchRemove(ids: number[]) {
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) return { ids: [] };
    const count = await this.configRepository.count({
      where: { id: In(uniqueIds) },
    });
    if (count !== uniqueIds.length) {
      throw new NotFoundException('部分 MinerU 配置不存在');
    }
    await this.configRepository.softDelete(uniqueIds);
    return { ids: uniqueIds };
  }

  async findEnabledEntity() {
    const configs = await this.configRepository.find({
      where: { isEnabled: true },
      order: { id: 'DESC' },
    });
    if (!configs.length) {
      throw new BadRequestException('未找到已启用的 MinerU 配置');
    }
    if (configs.length > 1) {
      throw new BadRequestException('当前存在多个已启用的 MinerU 配置，请仅保留一个启用');
    }
    const config = configs[0];
    if (!config.token) {
      throw new BadRequestException('当前 MinerU 配置未设置访问令牌');
    }
    return config;
  }

  async findUsableEntity(id: number) {
    const config = await this.findEntity(id);
    if (!config.token) {
      throw new BadRequestException('当前 MinerU 配置未设置访问令牌');
    }
    return config;
  }

  async createParseTask(
    fileUrl: string,
    fileName?: string,
    configId?: number | null,
  ): Promise<MineruCreateTaskResult> {
    const config = configId
      ? await this.findUsableEntity(configId)
      : await this.findEnabledEntity();
    const readableFileUrl = await this.storageConfigService.resolveReadableUrl(
      fileUrl,
      Math.max(config.timeoutMinutes * 60 + 600, 3600),
    );
    const resolvedFileName = fileName || this.resolveFileName(fileUrl);
    const response = await fetch(this.buildUrl(config.baseUrl, config.createTaskPath), {
      method: 'POST',
      headers: this.buildHeaders(config),
      body: JSON.stringify({
        url: readableFileUrl,
        file_url: readableFileUrl,
        files: [
          {
            url: readableFileUrl,
            file_name: resolvedFileName,
          },
        ],
        model_version: config.modelVersion,
        is_ocr: !!config.isOcr,
        enable_formula: !!config.enableFormula,
        enable_table: !!config.enableTable,
      }),
    });
    const data = await this.readJson<MineruCreateTaskResponse>(response);
    const taskId = this.extractTaskId(data);
    if (!taskId) {
      throw new BadRequestException(
        `MinerU 创建任务响应缺少 task_id：${this.buildMineruErrorMessage(data)}`,
      );
    }
    return {
      taskId,
      configId: config.id,
      configName: config.name,
      pollIntervalSeconds: config.pollIntervalSeconds,
      timeoutMinutes: config.timeoutMinutes,
      raw: data,
    };
  }

  async queryParseTask(taskId: string): Promise<MineruTaskStatus> {
    const config = await this.findEnabledEntity();
    return this.queryParseTaskWithConfig(config, taskId);
  }

  async queryParseTaskByConfig(
    taskId: string,
    configId: number,
  ): Promise<MineruTaskStatus> {
    const config = await this.findUsableEntity(configId);
    return this.queryParseTaskWithConfig(config, taskId);
  }

  private async queryParseTaskWithConfig(
    config: MineruConfig,
    taskId: string,
  ): Promise<MineruTaskStatus> {
    const path = config.queryTaskPath.replace(
      '{task_id}',
      encodeURIComponent(taskId),
    );
    const response = await fetch(this.buildUrl(config.baseUrl, path), {
      method: 'GET',
      headers: this.buildHeaders(config),
    });
    const data = await this.readJson<MineruQueryTaskResponse>(response);
    const payload = data.data ?? data;
    return {
      taskId,
      status: payload.status || '',
      progress: payload.progress ?? null,
      message: payload.message || '',
      markdown: payload.markdown || '',
      raw: data,
    };
  }

  async waitForSuccess(taskId: string, configId?: number | null) {
    const config = configId
      ? await this.findUsableEntity(configId)
      : await this.findEnabledEntity();
    const startedAt = Date.now();
    const timeoutMs = config.timeoutMinutes * 60 * 1000;
    const intervalMs = config.pollIntervalSeconds * 1000;
    while (Date.now() - startedAt <= timeoutMs) {
      const result = await this.queryParseTaskWithConfig(config, taskId);
      if (this.isSuccessStatus(result.status)) return result;
      if (this.isFailedStatus(result.status)) {
        throw new BadRequestException(result.message || 'MinerU 解析任务失败');
      }
      await this.sleep(intervalMs);
    }
    throw new BadRequestException('MinerU 解析任务超时');
  }

  isSuccessStatus(status: string) {
    return ['success', 'succeeded', 'completed', 'done'].includes(
      status.toLowerCase(),
    );
  }

  isFailedStatus(status: string) {
    return ['fail', 'failed', 'error', 'canceled', 'cancelled'].includes(
      status.toLowerCase(),
    );
  }

  private async findEntity(id: number) {
    const config = await this.configRepository.findOne({ where: { id } });
    if (!config) {
      throw new NotFoundException('MinerU 配置不存在');
    }
    return config;
  }

  private async disableOtherConfigs(currentId?: number) {
    const where = currentId
      ? { isEnabled: true, id: Not(currentId) }
      : { isEnabled: true };
    await this.configRepository.update(where, { isEnabled: false });
  }

  private toEntityPayload(
    dto: CreateMineruConfigDto | UpdateMineruConfigDto,
    isCreate: boolean,
  ): Partial<MineruConfig> {
    const payload: Partial<MineruConfig> = {};
    if (dto.name !== undefined) payload.name = dto.name.trim();
    if (dto.baseUrl !== undefined) payload.baseUrl = this.trimUrl(dto.baseUrl);
    if (dto.token !== undefined) {
      const token = dto.token.trim();
      if (token || isCreate) payload.token = token || null;
    }
    if (dto.authMode !== undefined || isCreate) {
      payload.authMode = dto.authMode || 'Bearer';
    }
    if (dto.modelVersion !== undefined || isCreate) {
      payload.modelVersion = dto.modelVersion?.trim() || 'vlm';
    }
    if (dto.createTaskPath !== undefined || isCreate) {
      payload.createTaskPath = dto.createTaskPath?.trim() || '/api/v4/extract/task';
    }
    if (dto.queryTaskPath !== undefined || isCreate) {
      payload.queryTaskPath =
        dto.queryTaskPath?.trim() || '/api/v4/extract/task/{task_id}';
    }
    if (dto.pollIntervalSeconds !== undefined || isCreate) {
      payload.pollIntervalSeconds = dto.pollIntervalSeconds ?? 5;
    }
    if (dto.timeoutMinutes !== undefined || isCreate) {
      payload.timeoutMinutes = dto.timeoutMinutes ?? 30;
    }
    if (dto.isOcr !== undefined || isCreate) payload.isOcr = dto.isOcr ?? true;
    if (dto.enableFormula !== undefined || isCreate) {
      payload.enableFormula = dto.enableFormula ?? true;
    }
    if (dto.enableTable !== undefined || isCreate) {
      payload.enableTable = dto.enableTable ?? true;
    }
    if (dto.isEnabled !== undefined || isCreate) {
      payload.isEnabled = dto.isEnabled ?? false;
    }
    return payload;
  }

  private toView(config: MineruConfig) {
    return {
      id: config.id,
      name: config.name,
      baseUrl: config.baseUrl,
      authMode: config.authMode,
      modelVersion: config.modelVersion,
      createTaskPath: config.createTaskPath,
      queryTaskPath: config.queryTaskPath,
      pollIntervalSeconds: config.pollIntervalSeconds,
      timeoutMinutes: config.timeoutMinutes,
      isOcr: !!config.isOcr,
      enableFormula: !!config.enableFormula,
      enableTable: !!config.enableTable,
      isEnabled: !!config.isEnabled,
      tokenSet: !!config.token,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  private buildHeaders(config: MineruConfig) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.authMode === 'TokenHeader') {
      headers.token = config.token || '';
    } else {
      headers.Authorization = `Bearer ${config.token}`;
    }
    return headers;
  }

  private buildUrl(baseUrl: string, path: string) {
    return `${this.trimUrl(baseUrl)}/${path.replace(/^\/+/, '')}`;
  }

  private async readJson<T>(response: Response): Promise<T> {
    const text = await response.text();
    if (!response.ok) {
      throw new BadRequestException(
        `MinerU 接口调用失败：${response.status} ${text}`,
      );
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new BadRequestException('MinerU 接口响应不是合法 JSON');
    }
  }

  private extractTaskId(value: unknown): string {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) {
      for (const item of value) {
        const taskId = this.extractTaskId(item);
        if (taskId) return taskId;
      }
      return '';
    }
    if (typeof value !== 'object') return '';

    const record = value as Record<string, unknown>;
    const directValue =
      record.task_id ??
      record.taskId ??
      record.taskID ??
      record.id ??
      record.job_id ??
      record.jobId;
    if (typeof directValue === 'string' && directValue.trim()) {
      return directValue.trim();
    }

    const taskIds = record.task_ids ?? record.taskIds;
    if (Array.isArray(taskIds)) {
      const taskId = this.extractTaskId(taskIds);
      if (taskId) return taskId;
    }

    for (const key of ['data', 'result', 'task', 'tasks']) {
      const taskId = this.extractTaskId(record[key]);
      if (taskId) return taskId;
    }
    return '';
  }

  private buildMineruErrorMessage(data: MineruCreateTaskResponse) {
    const error = data.error;
    const messageParts = [
      data.message,
      data.msg,
      typeof error === 'string' ? error : error?.message,
    ].filter(Boolean);
    const message = messageParts.length ? `${messageParts.join('；')}；` : '';
    return `${message}响应摘要 ${this.stringifyForError(data)}`;
  }

  private stringifyForError(value: unknown) {
    try {
      return JSON.stringify(value).slice(0, 1000);
    } catch {
      return '响应无法序列化';
    }
  }

  private resolveFileName(fileUrl: string) {
    try {
      const pathname = new URL(fileUrl).pathname;
      return decodeURIComponent(pathname.split('/').pop() || 'document');
    } catch {
      return 'document';
    }
  }

  private trimUrl(value: string) {
    return value.trim().replace(/\/+$/, '');
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
