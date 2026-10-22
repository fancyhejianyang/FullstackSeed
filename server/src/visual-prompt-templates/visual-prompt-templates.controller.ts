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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import {
  BatchDeleteVisualPromptTemplateDto,
  ComposeVisualPromptDto,
  QueryVisualPromptTemplateDto,
  SaveVisualPromptTemplateDto,
  SubmitVisualPromptTaskDto,
} from './dto/visual-prompt-template.dto';
import { VisualPromptTemplatesService } from './visual-prompt-templates.service';

@ApiTags('VisualPromptTemplate')
@ApiBearerAuth()
@Controller('visual-prompt-templates')
export class VisualPromptTemplatesController {
  constructor(private readonly service: VisualPromptTemplatesService) {}
  @Get()
  @RequirePermissions('VisualPromptTemplate.read')
  findAll(
    @Query() query: QueryVisualPromptTemplateDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.findAll(query, userId);
  }
  @Get('options')
  @RequirePermissions('VisualPromptTemplate.read')
  options(
    @Query() query: QueryVisualPromptTemplateDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.options(query, userId);
  }
  @Get('ai-config-options')
  @RequirePermissions('VisualPromptTemplate.read')
  aiConfigOptions() {
    return this.service.aiConfigOptions();
  }
  @Get('extract-tasks/:taskId')
  @RequirePermissions('VisualPromptTemplate.read')
  extractTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.taskDetail(taskId, userId, 'extract');
  }
  @Get('compose-tasks/:taskId')
  @RequirePermissions('VisualPromptTemplate.read')
  composeTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.taskDetail(taskId, userId, 'compose');
  }
  @Get(':id')
  @RequirePermissions('VisualPromptTemplate.read')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.findOne(id, userId);
  }
  @Post()
  @RequirePermissions('VisualPromptTemplate.create', 'ComfyWorkflow.update')
  create(
    @Body() dto: SaveVisualPromptTemplateDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.create(dto, userId);
  }
  @Patch(':id')
  @RequirePermissions('VisualPromptTemplate.update', 'ComfyWorkflow.update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveVisualPromptTemplateDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.update(id, dto, userId);
  }
  @Post(':id/extract')
  @RequirePermissions('VisualPromptTemplate.update')
  extract(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitVisualPromptTaskDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.submitExtraction(id, userId, dto.requestId);
  }
  @Post(':id/compose')
  @RequirePermissions('VisualPromptTemplate.read')
  compose(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ComposeVisualPromptDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.submitComposition(id, dto, userId, dto.requestId);
  }
  @Post('batch-delete')
  @RequirePermissions('VisualPromptTemplate.batchDelete')
  batchRemove(
    @Body() dto: BatchDeleteVisualPromptTemplateDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.batchRemove(dto.ids, userId);
  }
  @Delete(':id')
  @RequirePermissions('VisualPromptTemplate.delete')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.remove(id, userId);
  }
}
