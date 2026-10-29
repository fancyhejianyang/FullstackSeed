import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManagedFile } from '../managed-files/entities/managed-file.entity';
import { StorageConfigModule } from '../storage-config/storage-config.module';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { OrdinaryUploadsService } from './ordinary-uploads.service';
import { OrdinaryUploadReferenceSubscriber } from './ordinary-upload-reference.subscriber';

@Module({
  imports: [StorageConfigModule, TypeOrmModule.forFeature([ManagedFile])],
  controllers: [UploadsController],
  providers: [
    UploadsService,
    OrdinaryUploadsService,
    OrdinaryUploadReferenceSubscriber,
  ],
  exports: [UploadsService, OrdinaryUploadsService],
})
export class UploadsModule {}
