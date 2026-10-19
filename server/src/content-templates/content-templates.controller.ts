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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { BatchDeleteContentArticleDto } from '../content-articles/dto/content-article.dto';
import {
  QueryContentTemplateDto,
  SaveContentTemplateDto,
} from './dto/content-template.dto';
import { ContentTemplatesService } from './content-templates.service';

@ApiTags('ContentTemplate')
@ApiBearerAuth()
@Controller('content-templates')
export class ContentTemplatesController {
  constructor(private readonly service: ContentTemplatesService) {}
  @Get()
  @RequirePermissions('ContentTemplate.read')
  @ApiOperation({ summary: '本人写作模板列表' })
  findAll(
    @Query() query: QueryContentTemplateDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.findAll(query, userId);
  }
  @Get(':id')
  @RequirePermissions('ContentTemplate.read')
  @ApiOperation({ summary: '本人写作模板详情' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.findOne(id, userId);
  }
  @Post()
  @RequirePermissions('ContentTemplate.create')
  @ApiOperation({ summary: '创建写作模板' })
  create(
    @Body() dto: SaveContentTemplateDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.create(dto, userId);
  }
  @Patch(':id')
  @RequirePermissions('ContentTemplate.update')
  @ApiOperation({ summary: '更新写作模板' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveContentTemplateDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.update(id, dto, userId);
  }
  @Delete(':id')
  @RequirePermissions('ContentTemplate.delete')
  @ApiOperation({ summary: '删除写作模板' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.remove(id, userId);
  }
  @Post('batch-delete')
  @RequirePermissions('ContentTemplate.batchDelete')
  @ApiOperation({ summary: '批量删除写作模板' })
  batchRemove(
    @Body() dto: BatchDeleteContentArticleDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.batchRemove(dto.ids, userId);
  }
}
