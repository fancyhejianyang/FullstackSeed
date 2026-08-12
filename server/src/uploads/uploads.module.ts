import { Module } from '@nestjs/common';
import { StorageConfigModule } from '../storage-config/storage-config.module';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  imports: [StorageConfigModule],
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
