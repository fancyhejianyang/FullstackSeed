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
  BatchDeleteKnowledgeStandardQaDto,
  CreateKnowledgeStandardQaDto,
  QueryKnowledgeStandardQaDto,
  UpdateKnowledgeStandardQaDto,
} from './dto/knowledge-standard-qa.dto';
import { KnowledgeStandardQasService } from './knowledge-standard-qas.service';

@ApiTags('KnowledgeStandardQa')
@ApiBearerAuth()
@Controller('knowledge-standard-qas')
export class KnowledgeStandardQasController {
  constructor(private readonly standardQasService: KnowledgeStandardQasService) {}

  @Get()
  @RequirePermissions('KnowledgeStandardQa.read')
  @ApiOperation({ summary: '分页查询标准问答' })
  findAll(@Query() query: QueryKnowledgeStandardQaDto) {
    return this.standardQasService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('KnowledgeStandardQa.read')
  @ApiOperation({ summary: '查询标准问答详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.standardQasService.findOne(id);
  }

  @Post()
  @RequirePermissions('KnowledgeStandardQa.create')
  @ApiOperation({ summary: '创建标准问答' })
  create(@Body() dto: CreateKnowledgeStandardQaDto) {
    return this.standardQasService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('KnowledgeStandardQa.update')
  @ApiOperation({ summary: '更新标准问答' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateKnowledgeStandardQaDto) {
    return this.standardQasService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('KnowledgeStandardQa.delete')
  @ApiOperation({ summary: '删除标准问答' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.standardQasService.remove(id);
  }

  @Post('batch-delete')
  @RequirePermissions('KnowledgeStandardQa.batchDelete')
  @ApiOperation({ summary: '批量删除标准问答' })
  batchRemove(@Body() dto: BatchDeleteKnowledgeStandardQaDto) {
    return this.standardQasService.batchRemove(dto.ids);
  }
}
