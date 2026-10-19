import {
  Body,
  Controller,
  Delete,
  Get,
  ForbiddenException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { ContentGenerationService } from './content-generation.service';
import { ContentArticlesService } from './content-articles.service';
import {
  BatchDeleteContentArticleDto,
  CreateContentArticleDto,
  GenerateContentTaskDto,
  AdoptContentTaskDto,
  QueryContentArticleDto,
  UpdateContentArticleDto,
} from './dto/content-article.dto';

@ApiTags('ContentArticle')
@ApiBearerAuth()
@Controller('content-articles')
export class ContentArticlesController {
  constructor(
    private readonly service: ContentArticlesService,
    private readonly generation: ContentGenerationService,
  ) {}

  @Get()
  @RequirePermissions('ContentArticle.read')
  @ApiOperation({ summary: '分页查询本人创作内容' })
  findAll(
    @Query() query: QueryContentArticleDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.findAll(query, userId);
  }

  @Get('generation-configs')
  @RequirePermissions('ContentArticle.update')
  @ApiOperation({ summary: '文章生成可选配置（仅启用的内容创作配置概要）' })
  generationConfigs(@Query() query: QueryContentArticleDto) {
    return this.generation.configOptions(query);
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
  create(@Body() dto: CreateContentArticleDto, @CurrentUser() user: AuthUser) {
    return this.service.create(
      dto,
      user.userId,
      user.isAdmin || user.permissions.includes('ContentTemplate.read'),
    );
  }

  @Patch(':id')
  @RequirePermissions('ContentArticle.update')
  @ApiOperation({ summary: '保存本人创作内容' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContentArticleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(
      id,
      dto,
      user.userId,
      user.isAdmin || user.permissions.includes('ContentTemplate.read'),
    );
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

  @Post(':id/generate')
  @RequirePermissions('ContentArticle.update')
  @ApiOperation({ summary: '提交持久化正文生成任务' })
  regenerate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GenerateContentTaskDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (
      dto.templateId &&
      !user.isAdmin &&
      !user.permissions.includes('ContentTemplate.read')
    ) {
      throw new ForbiddenException('无权使用写作模板');
    }
    return this.generation.submit(id, dto, user.userId);
  }

  @Get(':id/tasks')
  @RequirePermissions('ContentArticle.read')
  tasks(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: QueryContentArticleDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.generation.list(id, query, userId);
  }

  @Get('tasks/:taskId')
  @RequirePermissions('ContentArticle.read')
  task(
    @Param('taskId', ParseIntPipe) id: number,
    @CurrentUser('userId') userId: number,
  ) {
    return this.generation.detail(id, userId);
  }

  @Post('tasks/:taskId/adopt')
  @RequirePermissions('ContentArticle.update')
  adopt(
    @Param('taskId', ParseIntPipe) id: number,
    @Body() dto: AdoptContentTaskDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.generation.adopt(id, dto.version, userId);
  }
}
