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
  BatchDeleteKnowledgeRoutingRuleDto,
  CreateKnowledgeRoutingRuleDto,
  QueryKnowledgeRoutingRuleDto,
  UpdateKnowledgeRoutingRuleDto,
} from './dto/knowledge-routing-rule.dto';
import { KnowledgeRoutingRulesService } from './knowledge-routing-rules.service';

@ApiTags('KnowledgeRoutingRule')
@ApiBearerAuth()
@Controller('knowledge-routing-rules')
export class KnowledgeRoutingRulesController {
  constructor(private readonly rulesService: KnowledgeRoutingRulesService) {}

  @Get()
  @RequirePermissions('KnowledgeRoutingRule.read')
  @ApiOperation({ summary: '分页查询知识库路由规则' })
  findAll(@Query() query: QueryKnowledgeRoutingRuleDto) {
    return this.rulesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('KnowledgeRoutingRule.read')
  @ApiOperation({ summary: '知识库路由规则详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.rulesService.findOne(id);
  }

  @Post()
  @RequirePermissions('KnowledgeRoutingRule.create')
  @ApiOperation({ summary: '创建知识库路由规则' })
  create(@Body() dto: CreateKnowledgeRoutingRuleDto) {
    return this.rulesService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('KnowledgeRoutingRule.update')
  @ApiOperation({ summary: '更新知识库路由规则' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateKnowledgeRoutingRuleDto,
  ) {
    return this.rulesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('KnowledgeRoutingRule.delete')
  @ApiOperation({ summary: '删除知识库路由规则' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.rulesService.remove(id);
  }

  @Post('batch-delete')
  @RequirePermissions('KnowledgeRoutingRule.batchDelete')
  @ApiOperation({ summary: '批量删除知识库路由规则' })
  batchRemove(@Body() dto: BatchDeleteKnowledgeRoutingRuleDto) {
    return this.rulesService.batchRemove(dto.ids);
  }
}
