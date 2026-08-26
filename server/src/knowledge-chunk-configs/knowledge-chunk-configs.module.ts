import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeChunkConfig } from './entities/knowledge-chunk-config.entity';
import { KnowledgeChunkConfigsController } from './knowledge-chunk-configs.controller';
import { KnowledgeChunkConfigsService } from './knowledge-chunk-configs.service';

@Module({
  imports: [TypeOrmModule.forFeature([KnowledgeChunkConfig])],
  controllers: [KnowledgeChunkConfigsController],
  providers: [KnowledgeChunkConfigsService],
  exports: [KnowledgeChunkConfigsService],
})
export class KnowledgeChunkConfigsModule {}
