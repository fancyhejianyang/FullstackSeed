import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LogApiSource } from './entities/log-api-source.entity';
import { LogModuleConfig } from './entities/log-module-config.entity';
import { LogRecord } from './entities/log-record.entity';
import { LogRecordsController } from './log-records.controller';
import { LogRecordsInterceptor } from './log-records.interceptor';
import { LogRecordsService } from './log-records.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([LogRecord, LogModuleConfig, LogApiSource]),
  ],
  controllers: [LogRecordsController],
  providers: [
    LogRecordsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: LogRecordsInterceptor,
    },
  ],
})
export class LogRecordsModule {}
