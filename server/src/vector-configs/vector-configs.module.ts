import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeAiProvidersModule } from '../knowledge-ai-providers/knowledge-ai-providers.module';
import { VectorConfig } from './entities/vector-config.entity';
import { VectorConfigsController } from './vector-configs.controller';
import { VectorConfigsService } from './vector-configs.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([VectorConfig]),
    KnowledgeAiProvidersModule,
  ],
  controllers: [VectorConfigsController],
  providers: [VectorConfigsService],
  exports: [VectorConfigsService],
})
export class VectorConfigsModule {}
