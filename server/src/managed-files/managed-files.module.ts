import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadsModule } from '../uploads/uploads.module';
import { StoredFilesModule } from '../stored-files/stored-files.module';
import { ManagedFile } from './entities/managed-file.entity';
import { ManagedFileReference } from './entities/managed-file-reference.entity';
import { ManagedFilesController } from './managed-files.controller';
import { ManagedFilesService } from './managed-files.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ManagedFile, ManagedFileReference]),
    UploadsModule,
    StoredFilesModule,
  ],
  controllers: [ManagedFilesController],
  providers: [ManagedFilesService],
  exports: [ManagedFilesService],
})
export class ManagedFilesModule {}
