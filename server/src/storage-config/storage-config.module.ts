import { Module } from '@nestjs/common';
import { StorageConfigController } from './storage-config.controller';
import { StorageConfigService } from './storage-config.service';

@Module({
  controllers: [StorageConfigController],
  providers: [StorageConfigService],
  exports: [StorageConfigService],
})
export class StorageConfigModule {}
