import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiCommandDefinitionsController } from './ai-command-definitions.controller';
import { AiCommandDefinitionsService } from './ai-command-definitions.service';
import { AiCommandDefinition } from './entities/ai-command-definition.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AiCommandDefinition])],
  controllers: [AiCommandDefinitionsController],
  providers: [AiCommandDefinitionsService],
  exports: [AiCommandDefinitionsService],
})
export class AiCommandDefinitionsModule {}
