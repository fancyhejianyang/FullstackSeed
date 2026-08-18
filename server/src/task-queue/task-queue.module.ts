import { Module } from '@nestjs/common';
import { TaskQueueService } from './task-queue.service';

@Module({
  providers: [TaskQueueService],
  exports: [TaskQueueService],
})
export class TaskQueueModule {}
