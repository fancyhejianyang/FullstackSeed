import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogRecordsModule } from '../log-records/log-records.module';
import { KnowledgeAiProvider } from './entities/knowledge-ai-provider.entity';
import { KnowledgeAiProvidersController } from './knowledge-ai-providers.controller';
import { KnowledgeAiProvidersService } from './knowledge-ai-providers.service';

@Module({
  imports: [LogRecordsModule, TypeOrmModule.forFeature([KnowledgeAiProvider])],
  controllers: [KnowledgeAiProvidersController],
  providers: [KnowledgeAiProvidersService],
  exports: [KnowledgeAiProvidersService],
})
export class KnowledgeAiProvidersModule {}
