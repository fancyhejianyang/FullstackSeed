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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import {
  BatchDeleteAiWorkflowDto,
  CreateAiWorkflowDto,
  QueryAiWorkflowDto,
  UpdateAiWorkflowDto,
} from './dto/ai-workflow.dto';
import { AiWorkflowsService } from './ai-workflows.service';

@ApiTags('AiWorkflow')
@ApiBearerAuth()
@Controller('ai-workflows')
export class AiWorkflowsController {
  constructor(private readonly workflowsService: AiWorkflowsService) {}

  @Get()
  @RequirePermissions('AiWorkflow.read')
  @ApiOperation({ summary: '分页查询 AI 工作流' })
  findAll(@Query() query: QueryAiWorkflowDto) {
    return this.workflowsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('AiWorkflow.read')
  @ApiOperation({ summary: 'AI 工作流详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.workflowsService.findOne(id);
  }

  @Post()
  @RequirePermissions('AiWorkflow.create')
  @ApiOperation({ summary: '创建 AI 工作流' })
  create(@Body() dto: CreateAiWorkflowDto) {
    return this.workflowsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('AiWorkflow.update')
  @ApiOperation({ summary: '更新 AI 工作流' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAiWorkflowDto,
  ) {
    return this.workflowsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('AiWorkflow.delete')
  @ApiOperation({ summary: '删除 AI 工作流' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.workflowsService.remove(id);
  }

  @Post('batch-delete')
  @RequirePermissions('AiWorkflow.batchDelete')
  @ApiOperation({ summary: '批量删除 AI 工作流' })
  batchRemove(@Body() dto: BatchDeleteAiWorkflowDto) {
    return this.workflowsService.batchRemove(dto.ids);
  }
}
