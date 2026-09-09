import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeStandardQa } from '../knowledge-standard-qas/entities/knowledge-standard-qa.entity';
import { ApprovalRequestsController } from './approval-requests.controller';
import { ApprovalRequestsService } from './approval-requests.service';
import { ApprovalRequest } from './entities/approval-request.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ApprovalRequest, KnowledgeStandardQa])],
  controllers: [ApprovalRequestsController],
  providers: [ApprovalRequestsService],
})
export class ApprovalRequestsModule {}
