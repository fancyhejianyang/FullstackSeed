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
  BatchDeleteHotTopicsDto,
  HotTopicSourceQueryDto,
  SaveHotTopicSourceDto,
  UpdateHotTopicSourceDto,
} from './dto/hot-topic.dto';
import { HotTopicSourcesService } from './hot-topic-sources.service';

@ApiTags('热点来源')
@ApiBearerAuth()
@Controller('hot-topic-sources')
export class HotTopicSourcesController {
  constructor(private readonly service: HotTopicSourcesService) {}
  @Get()
  @RequirePermissions('HotTopicSource.read')
  @ApiOperation({ summary: '分页查询热点来源' })
  findAll(@Query() query: HotTopicSourceQueryDto) {
    return this.service.findAll(query);
  }
  @Get('options')
  @RequirePermissions('HotTopicSource.read')
  @ApiOperation({ summary: '启用的来源概要' })
  options() {
    return this.service.options();
  }
  @Post('batch-delete')
  @RequirePermissions('HotTopicSource.batchDelete')
  @ApiOperation({ summary: '批量删除热点来源' })
  batchDelete(@Body() dto: BatchDeleteHotTopicsDto) {
    return this.service.batchRemove(dto.ids);
  }
  @Get(':id')
  @RequirePermissions('HotTopicSource.read')
  @ApiOperation({ summary: '热点来源详情，不返回密钥' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
  @Post()
  @RequirePermissions('HotTopicSource.create')
  @ApiOperation({ summary: '创建热点来源' })
  create(@Body() dto: SaveHotTopicSourceDto) {
    return this.service.create(dto);
  }
  @Patch(':id')
  @RequirePermissions('HotTopicSource.update')
  @ApiOperation({ summary: '更新热点来源，空密钥保留原值' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHotTopicSourceDto,
  ) {
    return this.service.update(id, dto);
  }
  @Delete(':id')
  @RequirePermissions('HotTopicSource.delete')
  @ApiOperation({ summary: '删除热点来源' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
