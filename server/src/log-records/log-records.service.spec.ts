import { Repository } from 'typeorm';
import { LogApiSource } from './entities/log-api-source.entity';
import { LogModuleConfig } from './entities/log-module-config.entity';
import { LogRecord } from './entities/log-record.entity';
import { LogRecordsService } from './log-records.service';

describe('LogRecordsService source synchronization', () => {
  it('使用唯一键 upsert 原子登记扫描接口', async () => {
    const upsertSources = jest.fn().mockResolvedValue({});
    const saveSources = jest.fn();
    const createSource = jest.fn(
      (value: Partial<LogApiSource>) => value as LogApiSource,
    );
    const sourceRepository = {
      find: jest.fn().mockResolvedValue([]),
      upsert: upsertSources,
      save: saveSources,
      create: createSource,
    } as unknown as Repository<LogApiSource>;
    const configRepository = {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<LogModuleConfig>;
    const service = new LogRecordsService(
      {} as Repository<LogRecord>,
      configRepository,
      sourceRepository,
    );

    await service.onModuleInit();

    expect(upsertSources).toHaveBeenCalledTimes(1);
    expect(upsertSources).toHaveBeenCalledWith(expect.any(Array), {
      conflictPaths: ['method', 'apiPath'],
    });
    expect(saveSources).not.toHaveBeenCalled();
  });
});
