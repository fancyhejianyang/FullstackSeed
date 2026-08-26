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
  BatchDeleteKnowledgeChunkConfigDto,
  CreateKnowledgeChunkConfigDto,
  QueryKnowledgeChunkConfigDto,
  UpdateKnowledgeChunkConfigDto,
} from './dto/knowledge-chunk-config.dto';
import { KnowledgeChunkConfigsService } from './knowledge-chunk-configs.service';

@ApiTags('KnowledgeChunkConfigs')
@ApiBearerAuth()
@Controller('knowledge-chunk-configs')
export class KnowledgeChunkConfigsController {
  constructor(private readonly service: KnowledgeChunkConfigsService) {}

  @Get()
  @RequirePermissions('KnowledgeBase.read')
  @ApiOperation({ summary: '分页查询知识库分片配置' })
  findAll(@Query() query: QueryKnowledgeChunkConfigDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('KnowledgeBase.read')
  @ApiOperation({ summary: '知识库分片配置详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('KnowledgeBase.update')
  @ApiOperation({ summary: '创建知识库分片配置' })
  create(@Body() dto: CreateKnowledgeChunkConfigDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('KnowledgeBase.update')
  @ApiOperation({ summary: '更新知识库分片配置' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateKnowledgeChunkConfigDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('KnowledgeBase.delete')
  @ApiOperation({ summary: '删除知识库分片配置' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post('batch-delete')
  @RequirePermissions('KnowledgeBase.batchDelete')
  @ApiOperation({ summary: '批量删除知识库分片配置' })
  batchRemove(@Body() dto: BatchDeleteKnowledgeChunkConfigDto) {
    return this.service.batchRemove(dto.ids);
  }
}
