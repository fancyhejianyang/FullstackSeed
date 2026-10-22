import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ComfyWorkflowsService } from './comfy-workflows.service';
import {
  BatchIdsDto,
  ComposeComfyWorkflowPromptDto,
  CreateComfyWorkflowDto,
  QueryComfyWorkflowDto,
  UpdateComfyWorkflowDto,
} from './dto/comfyui.dto';

@ApiTags('ComfyWorkflow')
@ApiBearerAuth()
@Controller('comfyui/workflows')
export class ComfyWorkflowsController {
  constructor(private readonly service: ComfyWorkflowsService) {}

  @Get()
  @RequirePermissions('ComfyWorkflow.read')
  findAll(@Query() query: QueryComfyWorkflowDto) {
    return this.service.findAll(query);
  }

  @Get('options')
  @RequirePermissions('ComfyTask.read')
  options() {
    return this.service.options();
  }

  @Get('prompt-summary-options')
  @RequirePermissions('VisualPromptTemplate.read')
  promptSummaryOptions() {
    return this.service.promptSummaryOptions();
  }

  @Get(':id/prompt-summary-draft')
  @RequirePermissions('VisualPromptTemplate.read')
  promptSummaryDraft(@Param('id', ParseIntPipe) id: number) {
    return this.service.promptSummaryDraft(id);
  }

  @Get('compose-tasks/:taskId')
  @RequirePermissions('ComfyTask.read')
  composeTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.composeTask(taskId, userId);
  }

  @Get(':id')
  @RequirePermissions('ComfyWorkflow.read')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('ComfyWorkflow.create')
  create(
    @Body() dto: CreateComfyWorkflowDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.create(dto, userId);
  }

  @Post(':id/compose-prompt')
  @RequirePermissions('ComfyTask.create')
  composePrompt(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ComposeComfyWorkflowPromptDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.composePrompt(id, dto, userId);
  }

  @Patch(':id')
  @RequirePermissions('ComfyWorkflow.update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateComfyWorkflowDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.update(id, dto, userId);
  }

  @Delete('batch')
  @RequirePermissions('ComfyWorkflow.batchDelete')
  batchRemove(@Body() dto: BatchIdsDto) {
    return this.service.batchRemove(dto.ids);
  }

  @Delete(':id')
  @RequirePermissions('ComfyWorkflow.delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
