import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataImportController } from './data-import.controller';
import { DataImportService } from './data-import.service';
import { DataImportConfig } from './entities/data-import-config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DataImportConfig])],
  controllers: [DataImportController],
  providers: [DataImportService],
})
export class DataImportModule {}
