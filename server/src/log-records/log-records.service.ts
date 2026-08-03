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
}
