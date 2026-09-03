import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentParseRule } from './entities/document-parse-rule.entity';
import { DocumentParseRulesController } from './document-parse-rules.controller';
import { DocumentParseRulesService } from './document-parse-rules.service';

@Module({
  imports: [TypeOrmModule.forFeature([DocumentParseRule])],
  controllers: [DocumentParseRulesController],
  providers: [DocumentParseRulesService],
  exports: [DocumentParseRulesService],
})
export class DocumentParseRulesModule {}
