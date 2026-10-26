import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import {
  BatchDeleteHotTopicsDto,
  CreateHotTopicArticleDto,
  HotTopicDecisionDto,
  HotTopicQueryDto,
  SaveHotTopicPreferenceDto,
  SubmitHotTopicRunDto,
} from './dto/hot-topic.dto';
import { HotTopicsService } from './hot-topics.service';

@ApiTags('热点选题')
@ApiBearerAuth()
@Controller('hot-topics')
export class HotTopicsController {
  constructor(private readonly service: HotTopicsService) {}

  @Get()
  @RequirePermissions('HotTopic.read')
  @ApiOperation({ summary: '分页查询我的热点选题' })
  findAll(
    @Query() query: HotTopicQueryDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.findAll(query, userId);
  }
  @Get('preferences')
  @RequirePermissions('HotTopic.read')
  @ApiOperation({ summary: '获取个人热点偏好' })
  preferences(@CurrentUser('userId') userId: number) {
    return this.service.getPreferences(userId);
  }
  @Put('preferences')
  @RequirePermissions('HotTopic.update')
  @ApiOperation({ summary: '保存个人热点偏好及定时计划' })
  savePreferences(
    @Body() dto: SaveHotTopicPreferenceDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.savePreferences(dto, userId);
  }
  @Get('options')
  @RequirePermissions('HotTopic.read')
  @ApiOperation({ summary: '可用热点 AI 配置与来源概要' })
  options() {
    return this.service.options();
  }
  @Post('runs')
  @RequirePermissions('HotTopic.create')
  @ApiOperation({ summary: '提交热点获取或重新推荐异步任务' })
  submit(
    @Body() dto: SubmitHotTopicRunDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.submit(dto, userId);
  }
  @Get('runs')
  @RequirePermissions('HotTopic.read')
  @ApiOperation({ summary: '分页查询我的热点执行记录' })
  runs(
    @Query() query: HotTopicQueryDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.findRuns(query, userId);
  }
  @Get('runs/:id')
  @RequirePermissions('HotTopic.read')
  @ApiOperation({ summary: '热点执行详情及来源状态' })
  run(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.findRun(id, userId);
  }
  @Get('runs/:id/search-response/:sourceIndex')
  @RequirePermissions('HotTopic.read')
  @ApiOperation({ summary: '查看本人热点任务的脱敏联网响应及解析结果' })
  searchResponse(
    @Param('id', ParseIntPipe) id: number,
    @Param('sourceIndex', ParseIntPipe) sourceIndex: number,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.findRunSearchResponse(id, sourceIndex, userId);
  }
  @Post('batch-delete')
  @RequirePermissions('HotTopic.batchDelete')
  @ApiOperation({ summary: '批量删除我的热点' })
  batchDelete(
    @Body() dto: BatchDeleteHotTopicsDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.batchRemove(dto.ids, userId);
  }
  @Get(':id')
  @RequirePermissions('HotTopic.read')
  @ApiOperation({ summary: '热点详情与来源材料' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.findOne(id, userId);
  }
  @Patch(':id/decision')
  @RequirePermissions('HotTopic.update')
  @ApiOperation({ summary: '忽略或恢复选题' })
  decision(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: HotTopicDecisionDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.setDecision(id, dto.decision, userId);
  }
  @Post(':id/create-article')
  @RequirePermissions('HotTopic.create', 'ContentArticle.create')
  @ApiOperation({ summary: '从热点创建文章，可同时异步生成' })
  createArticle(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateHotTopicArticleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createArticle(id, dto, user);
  }
  @Delete(':id')
  @RequirePermissions('HotTopic.delete')
  @ApiOperation({ summary: '删除我的热点' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.remove(id, userId);
  }
}
