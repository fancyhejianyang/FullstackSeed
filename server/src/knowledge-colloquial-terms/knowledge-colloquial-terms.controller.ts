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
  BatchDeleteKnowledgeColloquialTermDto,
  CreateKnowledgeColloquialTermDto,
  QueryKnowledgeColloquialTermDto,
  UpdateKnowledgeColloquialTermDto,
} from './dto/knowledge-colloquial-term.dto';
import { KnowledgeColloquialTermsService } from './knowledge-colloquial-terms.service';

@ApiTags('KnowledgeColloquialTerm')
@ApiBearerAuth()
@Controller('knowledge-colloquial-terms')
export class KnowledgeColloquialTermsController {
  constructor(private readonly termsService: KnowledgeColloquialTermsService) {}

  @Get()
  @RequirePermissions('KnowledgeColloquialTerm.read')
  @ApiOperation({ summary: '分页查询口语化表达词库' })
  findAll(@Query() query: QueryKnowledgeColloquialTermDto) {
    return this.termsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('KnowledgeColloquialTerm.read')
  @ApiOperation({ summary: '口语化表达词条详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.termsService.findOne(id);
  }

  @Post()
  @RequirePermissions('KnowledgeColloquialTerm.create')
  @ApiOperation({ summary: '创建口语化表达词条' })
  create(@Body() dto: CreateKnowledgeColloquialTermDto) {
    return this.termsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('KnowledgeColloquialTerm.update')
  @ApiOperation({ summary: '更新口语化表达词条' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateKnowledgeColloquialTermDto,
  ) {
    return this.termsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('KnowledgeColloquialTerm.delete')
  @ApiOperation({ summary: '删除口语化表达词条' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.termsService.remove(id);
  }

  @Post('batch-delete')
  @RequirePermissions('KnowledgeColloquialTerm.batchDelete')
  @ApiOperation({ summary: '批量删除口语化表达词条' })
  batchRemove(@Body() dto: BatchDeleteKnowledgeColloquialTermDto) {
    return this.termsService.batchRemove(dto);
  }
}
