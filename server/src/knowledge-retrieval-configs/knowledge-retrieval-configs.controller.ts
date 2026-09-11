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
  BatchDeleteKnowledgeRetrievalConfigDto,
  CreateKnowledgeRetrievalConfigDto,
  QueryKnowledgeRetrievalConfigDto,
  UpdateKnowledgeRetrievalConfigDto,
} from './dto/knowledge-retrieval-config.dto';
import { KnowledgeRetrievalConfigsService } from './knowledge-retrieval-configs.service';

@ApiTags('AiWorkflow')
@ApiBearerAuth()
@Controller('knowledge-retrieval-configs')
export class KnowledgeRetrievalConfigsController {
  constructor(
    private readonly configsService: KnowledgeRetrievalConfigsService,
  ) {}

  @Get()
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '分页查询 AI 工作流配置' })
  findAll(@Query() query: QueryKnowledgeRetrievalConfigDto) {
    return this.configsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: 'AI 工作流配置详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.configsService.findOne(id);
  }

  @Post()
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '创建 AI 工作流配置' })
  create(@Body() dto: CreateKnowledgeRetrievalConfigDto) {
    return this.configsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '更新 AI 工作流配置' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateKnowledgeRetrievalConfigDto,
  ) {
    return this.configsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '删除 AI 工作流配置' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.configsService.remove(id);
  }

  @Post('batch-delete')
  @RequirePermissions('Menu.read')
  @ApiOperation({ summary: '批量删除 AI 工作流配置' })
  batchRemove(@Body() dto: BatchDeleteKnowledgeRetrievalConfigDto) {
    return this.configsService.batchRemove(dto.ids);
  }
}
