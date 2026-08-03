import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogModuleConfig } from './entities/log-module-config.entity';
import { LogRecord } from './entities/log-record.entity';
import { LogRecordsController } from './log-records.controller';
import { LogRecordsService } from './log-records.service';

@Module({
  imports: [TypeOrmModule.forFeature([LogRecord, LogModuleConfig])],
  controllers: [LogRecordsController],
  providers: [LogRecordsService],
})
export class LogRecordsModule {}
