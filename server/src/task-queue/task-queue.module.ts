import { Module } from '@nestjs/common';
import { LogRecordsModule } from '../log-records/log-records.module';
import { TaskQueueService } from './task-queue.service';

@Module({
  imports: [LogRecordsModule],
  providers: [TaskQueueService],
  exports: [TaskQueueService],
})
export class TaskQueueModule {}
