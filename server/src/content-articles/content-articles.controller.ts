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
import { ContentArticlesService } from './content-articles.service';
import {
  BatchDeleteContentArticleDto,
  CreateContentArticleDto,
  GenerateContentArticleDto,
  QueryContentArticleDto,
  UpdateContentArticleDto,
} from './dto/content-article.dto';

@ApiTags('ContentArticle')
@ApiBearerAuth()
@Controller('content-articles')
export class ContentArticlesController {
  constructor(private readonly service: ContentArticlesService) {}

  @Get()
  @RequirePermissions('ContentArticle.read')
  @ApiOperation({ summary: '分页查询本人创作内容' })
  findAll(
    @Query() query: QueryContentArticleDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.findAll(query, userId);
  }

  @Get(':id')
  @RequirePermissions('ContentArticle.read')
  @ApiOperation({ summary: '本人创作内容详情' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.findOne(id, userId);
  }

  @Post()
  @RequirePermissions('ContentArticle.create')
  @ApiOperation({ summary: '创建内容' })
  create(
    @Body() dto: CreateContentArticleDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermissions('ContentArticle.update')
  @ApiOperation({ summary: '保存本人创作内容' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContentArticleDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermissions('ContentArticle.delete')
  @ApiOperation({ summary: '软删除本人创作内容' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.remove(id, userId);
  }

  @Post('batch-delete')
  @RequirePermissions('ContentArticle.batchDelete')
  @ApiOperation({ summary: '批量软删除本人创作内容' })
  batchRemove(
    @Body() dto: BatchDeleteContentArticleDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.batchRemove(dto.ids, userId);
  }

  @Post('generate')
  @RequirePermissions('ContentArticle.create')
  @ApiOperation({ summary: '为新内容生成候选正文（不保存）' })
  generate(
    @Body() dto: GenerateContentArticleDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.generate(dto, userId);
  }

  @Post(':id/generate')
  @RequirePermissions('ContentArticle.update')
  @ApiOperation({ summary: '为本人已有内容生成候选正文（不保存）' })
  regenerate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GenerateContentArticleDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.generate(dto, userId, id);
  }
}
