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
  BatchDeleteKnowledgeBaseDto,
  CreateKnowledgeBaseCategoryDto,
  CreateKnowledgeBaseChunkDto,
  CreateKnowledgeBaseDocumentDto,
  CreateKnowledgeBaseDto,
  QueryKnowledgeBaseCategoryDto,
  QueryKnowledgeBaseChunkDto,
  QueryKnowledgeBaseDocumentDto,
  QueryKnowledgeBaseDto,
  UpdateKnowledgeBaseCategoryDto,
  UpdateKnowledgeBaseChunkDto,
  UpdateKnowledgeBaseDocumentDto,
  UpdateKnowledgeBaseDto,
} from './dto/knowledge-base.dto';
import { KnowledgeBasesService } from './knowledge-bases.service';

@ApiTags('KnowledgeBase')
@ApiBearerAuth()
@Controller('knowledge-bases')
export class KnowledgeBasesController {
  constructor(private readonly knowledgeBasesService: KnowledgeBasesService) {}

  @Get()
  @RequirePermissions('KnowledgeBase.read')
  @ApiOperation({ summary: '分页查询知识库' })
  findBases(@Query() query: QueryKnowledgeBaseDto) {
    return this.knowledgeBasesService.findBases(query);
  }

  @Get('categories')
  @RequirePermissions('KnowledgeBase.read')
  @ApiOperation({ summary: '查询知识库分类' })
  findCategories(@Query() query: QueryKnowledgeBaseCategoryDto) {
    return this.knowledgeBasesService.findCategories(query);
  }

  @Get('categories/tree')
  @RequirePermissions('KnowledgeBase.read')
  @ApiOperation({ summary: '查询知识库分类树' })
  findCategoryTree(@Query() query: QueryKnowledgeBaseCategoryDto) {
    return this.knowledgeBasesService.findCategoryTree(query);
  }

  @Get('documents')
  @RequirePermissions('KnowledgeBase.read')
  @ApiOperation({ summary: '分页查询知识库文档' })
  findDocuments(@Query() query: QueryKnowledgeBaseDocumentDto) {
    return this.knowledgeBasesService.findDocuments(query);
  }

  @Get('documents/:id')
  @RequirePermissions('KnowledgeBase.read')
  @ApiOperation({ summary: '知识库文档详情' })
  findDocument(@Param('id', ParseIntPipe) id: number) {
    return this.knowledgeBasesService.findDocument(id);
  }

  @Get('chunks')
  @RequirePermissions('KnowledgeBase.read')
  @ApiOperation({ summary: '分页查询知识库分片' })
  findChunks(@Query() query: QueryKnowledgeBaseChunkDto) {
    return this.knowledgeBasesService.findChunks(query);
  }

  @Get('chunks/:id')
  @RequirePermissions('KnowledgeBase.read')
  @ApiOperation({ summary: '知识库分片详情' })
  findChunk(@Param('id', ParseIntPipe) id: number) {
    return this.knowledgeBasesService.findChunk(id);
  }

  @Get(':id')
  @RequirePermissions('KnowledgeBase.read')
  @ApiOperation({ summary: '知识库详情' })
  findBase(@Param('id', ParseIntPipe) id: number) {
    return this.knowledgeBasesService.findBase(id);
  }

  @Post()
  @RequirePermissions('KnowledgeBase.create')
  @ApiOperation({ summary: '创建知识库' })
  createBase(@Body() dto: CreateKnowledgeBaseDto) {
    return this.knowledgeBasesService.createBase(dto);
  }

  @Post('categories')
  @RequirePermissions('KnowledgeBase.create')
  @ApiOperation({ summary: '创建知识库分类' })
  createCategory(@Body() dto: CreateKnowledgeBaseCategoryDto) {
    return this.knowledgeBasesService.createCategory(dto);
  }

  @Post('documents')
  @RequirePermissions('KnowledgeBase.create')
  @ApiOperation({ summary: '创建知识库文档' })
  createDocument(@Body() dto: CreateKnowledgeBaseDocumentDto) {
    return this.knowledgeBasesService.createDocument(dto);
  }

  @Post('chunks')
  @RequirePermissions('KnowledgeBase.create')
  @ApiOperation({ summary: '创建知识库分片' })
  createChunk(@Body() dto: CreateKnowledgeBaseChunkDto) {
    return this.knowledgeBasesService.createChunk(dto);
  }

  @Patch('categories/:id')
  @RequirePermissions('KnowledgeBase.update')
  @ApiOperation({ summary: '更新知识库分类' })
  updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateKnowledgeBaseCategoryDto,
  ) {
    return this.knowledgeBasesService.updateCategory(id, dto);
  }

  @Patch('documents/:id')
  @RequirePermissions('KnowledgeBase.update')
  @ApiOperation({ summary: '更新知识库文档' })
  updateDocument(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateKnowledgeBaseDocumentDto,
  ) {
    return this.knowledgeBasesService.updateDocument(id, dto);
  }

  @Patch('chunks/:id')
  @RequirePermissions('KnowledgeBase.update')
  @ApiOperation({ summary: '更新知识库分片' })
  updateChunk(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateKnowledgeBaseChunkDto,
  ) {
    return this.knowledgeBasesService.updateChunk(id, dto);
  }

  @Patch(':id')
  @RequirePermissions('KnowledgeBase.update')
  @ApiOperation({ summary: '更新知识库' })
  updateBase(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateKnowledgeBaseDto,
  ) {
    return this.knowledgeBasesService.updateBase(id, dto);
  }

  @Delete('categories/:id')
  @RequirePermissions('KnowledgeBase.delete')
  @ApiOperation({ summary: '删除知识库分类' })
  removeCategory(@Param('id', ParseIntPipe) id: number) {
    return this.knowledgeBasesService.removeCategory(id);
  }

  @Delete('documents/:id')
  @RequirePermissions('KnowledgeBase.delete')
  @ApiOperation({ summary: '删除知识库文档' })
  removeDocument(@Param('id', ParseIntPipe) id: number) {
    return this.knowledgeBasesService.removeDocument(id);
  }

  @Delete('chunks/:id')
  @RequirePermissions('KnowledgeBase.delete')
  @ApiOperation({ summary: '删除知识库分片' })
  removeChunk(@Param('id', ParseIntPipe) id: number) {
    return this.knowledgeBasesService.removeChunk(id);
  }

  @Delete(':id')
  @RequirePermissions('KnowledgeBase.delete')
  @ApiOperation({ summary: '删除知识库' })
  removeBase(@Param('id', ParseIntPipe) id: number) {
    return this.knowledgeBasesService.removeBase(id);
  }

  @Post('batch-delete')
  @RequirePermissions('KnowledgeBase.batchDelete')
  @ApiOperation({ summary: '批量删除知识库' })
  batchRemoveBases(@Body() dto: BatchDeleteKnowledgeBaseDto) {
    return this.knowledgeBasesService.batchRemoveBases(dto);
  }
}
