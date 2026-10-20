import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManagedFile } from '../managed-files/entities/managed-file.entity';
import { ManagedFileReference } from '../managed-files/entities/managed-file-reference.entity';
import { StoredFilesModule } from '../stored-files/stored-files.module';
import { UploadsModule } from '../uploads/uploads.module';
import { VisualPromptTemplatesModule } from '../visual-prompt-templates/visual-prompt-templates.module';
import { ComfyClientService } from './comfy-client.service';
import { ComfyConnectionsController } from './comfy-connections.controller';
import { ComfyConnectionsService } from './comfy-connections.service';
import { ComfyFilesService } from './comfy-files.service';
import { ComfyMaterialsController } from './comfy-materials.controller';
import { ComfyMaterialsService } from './comfy-materials.service';
import { ComfyTasksController } from './comfy-tasks.controller';
import { ComfyTasksService } from './comfy-tasks.service';
import { ComfyWorkflowsController } from './comfy-workflows.controller';
import { ComfyWorkflowsService } from './comfy-workflows.service';
import { ComfyConnection } from './entities/comfy-connection.entity';
import { ComfyMaterial } from './entities/comfy-material.entity';
import { ComfyTaskOutput } from './entities/comfy-task-output.entity';
import { ComfyTask } from './entities/comfy-task.entity';
import { ComfyWorkflowVersion } from './entities/comfy-workflow-version.entity';
import { ComfyWorkflow } from './entities/comfy-workflow.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ComfyConnection,
      ComfyWorkflow,
      ComfyWorkflowVersion,
      ComfyMaterial,
      ComfyTask,
      ComfyTaskOutput,
      ManagedFile,
      ManagedFileReference,
    ]),
    UploadsModule,
    StoredFilesModule,
    VisualPromptTemplatesModule,
  ],
  controllers: [
    ComfyConnectionsController,
    ComfyWorkflowsController,
    ComfyMaterialsController,
    ComfyTasksController,
  ],
  providers: [
    ComfyClientService,
    ComfyConnectionsService,
    ComfyWorkflowsService,
    ComfyFilesService,
    ComfyMaterialsService,
    ComfyTasksService,
  ],
  exports: [ComfyConnectionsService, ComfyWorkflowsService],
})
export class ComfyUiModule {}
