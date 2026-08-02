import { Module } from '@nestjs/common';
import { ModuleModelsController } from './module-models.controller';
import { ModuleModelsService } from './module-models.service';

@Module({
  controllers: [ModuleModelsController],
  providers: [ModuleModelsService],
})
export class ModuleModelsModule {}
