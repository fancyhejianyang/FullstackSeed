import { Module } from '@nestjs/common';
import { StorageConfigModule } from '../storage-config/storage-config.module';
import { StoredFilesService } from './stored-files.service';

@Module({
  imports: [StorageConfigModule],
  providers: [StoredFilesService],
  exports: [StoredFilesService],
})
export class StoredFilesModule {}
