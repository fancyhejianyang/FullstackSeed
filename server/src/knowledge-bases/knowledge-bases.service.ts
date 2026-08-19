import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  BatchDeleteKnowledgeBaseDto,
  CreateKnowledgeBaseCategoryDto,
  CreateKnowledgeBaseChunkDto,
  CreateKnowledgeBaseDocumentDto,
  CreateKnowledgeBaseMineruTaskDto,
  CreateKnowledgeBaseDto,
  ParseKnowledgeBaseDto,
  ParseKnowledgeBaseDocumentDto,
  ParseKnowledgeBaseDocumentRequestDto,
  QueryKnowledgeBaseCategoryDto,
  QueryKnowledgeBaseChunkDto,
  QueryKnowledgeBaseDocumentDto,
  QueryKnowledgeBaseDto,
  UpdateKnowledgeBaseCategoryDto,
  UpdateKnowledgeBaseChunkDto,
  UpdateKnowledgeBaseDocumentDto,
  UpdateKnowledgeBaseDto,
} from './dto/knowledge-base.dto';
import { KnowledgeBaseCategory } from './entities/knowledge-base-category.entity';
import { KnowledgeBaseChunk } from './entities/knowledge-base-chunk.entity';
import { KnowledgeBaseDocument } from './entities/knowledge-base-document.entity';
import { KnowledgeBase } from './entities/knowledge-base.entity';
import { DocumentParsersService } from '../document-parsers/document-parsers.service';
import { MineruConfigsService } from '../mineru-configs/mineru-configs.service';
import { TaskQueueService } from '../task-queue/task-queue.service';

export interface KnowledgeBaseCategoryTreeNode extends KnowledgeBaseCategory {
  children: KnowledgeBaseCategoryTreeNode[];
}

const KNOWLEDGE_PARSE_MODE = {
  manual: 'manual',
  mineru: 'mineru',
} as const;

type KnowledgeParseMode =
  (typeof KNOWLEDGE_PARSE_MODE)[keyof typeof KNOWLEDGE_PARSE_MODE];

@Injectable()
export class KnowledgeBasesService {
  constructor(
    @InjectRepository(KnowledgeBase)
    private readonly baseRepository: Repository<KnowledgeBase>,
    @InjectRepository(KnowledgeBaseCategory)
    private readonly categoryRepository: Repository<KnowledgeBaseCategory>,
    @InjectRepository(KnowledgeBaseDocument)
    private readonly documentRepository: Repository<KnowledgeBaseDocument>,
    @InjectRepository(KnowledgeBaseChunk)
    private readonly chunkRepository: Repository<KnowledgeBaseChunk>,
    private readonly documentParsersService: DocumentParsersService,
    private readonly mineruConfigsService: MineruConfigsService,
    private readonly taskQueueService: TaskQueueService,
  ) {}

  async findBases(query: QueryKnowledgeBaseDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const qb = this.baseRepository
      .createQueryBuilder('base')
      .orderBy('base.sort', 'ASC')
      .addOrderBy('base.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (query.keyword?.trim()) {
      qb.where(
        'base.name LIKE :keyword OR base.code LIKE :keyword OR base.description LIKE :keyword',
        { keyword: `%${query.keyword.trim()}%` },
      );
    }
    if (query.categoryId) {
      qb.andWhere('base.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }
    const [list, total] = await qb.getManyAndCount();
    return { list, total };
  }

  async findBase(id: number) {
    const base = await this.baseRepository.findOne({ where: { id } });
    if (!base) throw new NotFoundException('知识库不存在');
    if (base.contentText?.trim()) return base;

    const document = await this.documentRepository.findOne({
      where: { knowledgeBaseId: id, status: 'parsed' },
      order: { id: 'DESC' },
    });
    if (document?.content) {
      base.contentText = document.content;
    }
    return base;
  }

  async createBase(dto: CreateKnowledgeBaseDto) {
    await this.assertRequiredCategory(dto.categoryId);
    const contentType = dto.contentType ?? 'text';
    return this.baseRepository.save(
      this.baseRepository.create({
        categoryId: dto.categoryId,
        name: dto.name.trim(),
        code: dto.code?.trim() ?? '',
        description: dto.description?.trim() || null,
        contentType,
        contentText:
          contentType === 'text'
            ? dto.contentText?.trim() || null
            : null,
        fileName: contentType === 'text' ? '' : dto.fileName?.trim() ?? '',
        fileUrl: contentType === 'text' ? '' : dto.fileUrl?.trim() ?? '',
        processStage: this.resolveInitialProcessStage(
          contentType,
          dto.contentText,
          dto.fileUrl,
        ),
        parseStatus: 'pending',
        chunkStatus: 'pending',
        indexStatus: 'pending',
        lastProcessMessage: null,
        containsImages: false,
        allowFileUpload: contentType !== 'text',
        isEnabled: dto.isEnabled ?? true,
        sort: dto.sort ?? 0,
      }),
    );
  }

  async updateBase(id: number, dto: UpdateKnowledgeBaseDto) {
    const base = await this.findBase(id);
    const contentChanged =
      dto.contentType !== undefined ||
      dto.contentText !== undefined ||
      dto.fileName !== undefined ||
      dto.fileUrl !== undefined;
    if (dto.categoryId !== undefined) {
      await this.assertRequiredCategory(dto.categoryId);
      base.categoryId = dto.categoryId;
    }
    if (dto.name !== undefined) base.name = dto.name.trim();
    if (dto.code !== undefined) base.code = dto.code.trim();
    if (dto.description !== undefined) {
      base.description = dto.description.trim() || null;
    }
    if (dto.contentType !== undefined) base.contentType = dto.contentType;
    if (dto.contentText !== undefined) {
      base.contentText = dto.contentText.trim() || null;
    }
    if (dto.fileName !== undefined) base.fileName = dto.fileName.trim();
    if (dto.fileUrl !== undefined) base.fileUrl = dto.fileUrl.trim();
    if (dto.contentType !== undefined) {
      if (dto.contentType === 'text') {
        base.fileName = '';
        base.fileUrl = '';
        base.allowFileUpload = false;
      } else {
        base.contentText = null;
        base.allowFileUpload = true;
      }
    }
    if (dto.containsImages !== undefined) {
      base.containsImages = dto.containsImages;
    }
    if (dto.allowFileUpload !== undefined) {
      base.allowFileUpload = dto.allowFileUpload;
    }
    if (contentChanged) {
      base.processStage = this.resolveInitialProcessStage(
        base.contentType,
        base.contentText,
        base.fileUrl,
      );
      base.parseStatus = 'pending';
      base.chunkStatus = 'pending';
      base.indexStatus = 'pending';
      base.lastProcessMessage = null;
    }
    if (dto.isEnabled !== undefined) base.isEnabled = dto.isEnabled;
    if (dto.sort !== undefined) base.sort = dto.sort;
    return this.baseRepository.save(base);
  }

  async removeBase(id: number) {
    await this.findBase(id);
    await this.chunkRepository.softDelete({ knowledgeBaseId: id });
    await this.documentRepository.softDelete({ knowledgeBaseId: id });
    await this.baseRepository.softDelete(id);
    return { id };
  }

  async batchRemoveBases(dto: BatchDeleteKnowledgeBaseDto) {
    const ids = Array.from(new Set(dto.ids));
    if (!ids.length) return { ids: [] };
    const count = await this.baseRepository.count({ where: { id: In(ids) } });
    if (count !== ids.length) throw new NotFoundException('部分知识库不存在');
    await this.chunkRepository.softDelete({ knowledgeBaseId: In(ids) });
    await this.documentRepository.softDelete({ knowledgeBaseId: In(ids) });
    await this.baseRepository.softDelete(ids);
    return { ids };
  }

  async parseBase(id: number, dto: ParseKnowledgeBaseDto = {}) {
    const base = await this.findBase(id);
    const parseMode = this.resolveParseMode(dto.parseMode);
    await this.updateBaseProcess(base, {
      processStage: 'parsing',
      parseStatus: 'processing',
      chunkStatus: 'pending',
      indexStatus: 'pending',
      lastProcessMessage: `${this.getParseModeLabel(parseMode)}任务已提交，等待执行`,
    });
    return this.taskQueueService.add(
      'knowledge-base.parse',
      { knowledgeBaseId: id, parseMode },
      () => this.executeParseBase(id, dto),
    );
  }

  private async executeParseBase(id: number, dto: ParseKnowledgeBaseDto = {}) {
    const base = await this.findBase(id);
    const parseMode = this.resolveParseMode(dto.parseMode);
    await this.updateBaseProcess(base, {
      processStage: 'parsing',
      parseStatus: 'processing',
      chunkStatus: 'pending',
      indexStatus: 'pending',
      lastProcessMessage: `正在${this.getParseModeLabel(parseMode)}内容`,
    });
    try {
      const content = await this.parseBaseContentByMode(base, parseMode);
      const document = await this.saveBaseDocument(base, content, parseMode);
      await this.updateBaseProcess(base, {
        processStage: 'parsed',
        parseStatus: 'success',
        chunkStatus: 'pending',
        indexStatus: 'pending',
        lastProcessMessage: `${this.getParseModeLabel(parseMode)}完成，等待分片`,
      });
      return { id, documentId: document.id, processStage: 'parsed', parseMode };
    } catch (error) {
      await this.updateBaseProcess(base, {
        processStage: 'failed',
        parseStatus: 'failed',
        lastProcessMessage:
          error instanceof Error ? error.message : '解析失败',
      });
      throw error;
    }
  }

  async chunkBase(id: number) {
    const base = await this.findBase(id);
    if (base.parseStatus !== 'success') {
      throw new BadRequestException('请先完成解析');
    }
    await this.updateBaseProcess(base, {
      processStage: 'chunking',
      chunkStatus: 'processing',
      indexStatus: 'pending',
      lastProcessMessage: '分片任务已提交，等待执行',
    });
    return this.taskQueueService.add(
      'knowledge-base.chunk',
      { knowledgeBaseId: id },
      () => this.executeChunkBase(id),
    );
  }

  private async executeChunkBase(id: number) {
    const base = await this.findBase(id);
    if (base.parseStatus !== 'success') {
      throw new BadRequestException('请先完成解析');
    }
    await this.updateBaseProcess(base, {
      processStage: 'chunking',
      chunkStatus: 'processing',
      indexStatus: 'pending',
      lastProcessMessage: '正在生成分片',
    });
    try {
      const document = await this.findBaseDocument(base.id);
      if (!document?.content) {
        throw new BadRequestException('当前知识库文档缺少正文内容');
      }
      await this.chunkRepository.softDelete({ documentId: document.id });
      const chunkCount = await this.saveDocumentChunks(document);
      await this.updateBaseProcess(base, {
        processStage: 'chunked',
        chunkStatus: 'success',
        indexStatus: 'pending',
        lastProcessMessage: `分片完成，共 ${chunkCount} 个分片`,
      });
      return { id, documentId: document.id, chunkCount, processStage: 'chunked' };
    } catch (error) {
      await this.updateBaseProcess(base, {
        processStage: 'failed',
        chunkStatus: 'failed',
        lastProcessMessage:
          error instanceof Error ? error.message : '分片失败',
      });
      throw error;
    }
  }

  async indexBase(id: number) {
    const base = await this.findBase(id);
    if (base.chunkStatus !== 'success') {
      throw new BadRequestException('请先完成分片');
    }
    await this.updateBaseProcess(base, {
      processStage: 'indexing',
      indexStatus: 'processing',
      lastProcessMessage: '索引任务已提交，等待执行',
    });
    return this.taskQueueService.add(
      'knowledge-base.index',
      { knowledgeBaseId: id },
      () => this.executeIndexBase(id),
    );
  }

  private async executeIndexBase(id: number) {
    const base = await this.findBase(id);
    if (base.chunkStatus !== 'success') {
      throw new BadRequestException('请先完成分片');
    }
    await this.updateBaseProcess(base, {
      processStage: 'indexing',
      indexStatus: 'processing',
      lastProcessMessage: '正在写入索引',
    });
    try {
      const chunkCount = await this.chunkRepository.count({
        where: { knowledgeBaseId: id },
      });
      if (!chunkCount) {
        throw new BadRequestException('当前知识库没有可索引的分片');
      }
      await this.updateBaseProcess(base, {
        processStage: 'indexed',
        indexStatus: 'success',
        lastProcessMessage:
          '索引标记已完成，向量数据库写入逻辑已预留',
      });
      return { id, chunkCount, processStage: 'indexed' };
    } catch (error) {
      await this.updateBaseProcess(base, {
        processStage: 'failed',
        indexStatus: 'failed',
        lastProcessMessage:
          error instanceof Error ? error.message : '索引失败',
      });
      throw error;
    }
  }

  async findCategories(query: QueryKnowledgeBaseCategoryDto) {
    const qb = this.categoryRepository
      .createQueryBuilder('category')
      .orderBy('category.sort', 'ASC')
      .addOrderBy('category.id', 'ASC');
    if (query.parentId) {
      qb.andWhere('category.parentId = :parentId', { parentId: query.parentId });
    }
    if (query.keyword?.trim()) {
      qb.andWhere(
        '(category.name LIKE :keyword OR category.code LIKE :keyword OR category.description LIKE :keyword)',
        { keyword: `%${query.keyword.trim()}%` },
      );
    }
    return qb.getMany();
  }

  async findCategoryTree(query: QueryKnowledgeBaseCategoryDto) {
    const categories = await this.findCategories({
      keyword: query.keyword,
    });
    return this.buildCategoryTree(categories);
  }

  async findCategory(id: number) {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) throw new NotFoundException('知识库分类不存在');
    return category;
  }

  async createCategory(dto: CreateKnowledgeBaseCategoryDto) {
    await this.assertParentCategory(dto.parentId);
    return this.categoryRepository.save(
      this.categoryRepository.create({
        parentId: dto.parentId ?? null,
        name: dto.name.trim(),
        code: dto.code?.trim() ?? '',
        description: dto.description?.trim() || null,
        sort: dto.sort ?? 0,
      }),
    );
  }

  async updateCategory(id: number, dto: UpdateKnowledgeBaseCategoryDto) {
    const category = await this.findCategory(id);
    await this.assertParentCategory(dto.parentId, id);
    if (dto.parentId !== undefined) category.parentId = dto.parentId ?? null;
    if (dto.name !== undefined) category.name = dto.name.trim();
    if (dto.code !== undefined) category.code = dto.code.trim();
    if (dto.description !== undefined) {
      category.description = dto.description.trim() || null;
    }
    if (dto.sort !== undefined) category.sort = dto.sort;
    return this.categoryRepository.save(category);
  }

  async removeCategory(id: number) {
    await this.findCategory(id);
    const categories = await this.categoryRepository.find();
    const categoryIds = [id, ...this.collectDescendantIds(categories, id)];
    const usedCount = await this.baseRepository.count({
      where: { categoryId: In(categoryIds) },
    });
    const documentCount = await this.documentRepository.count({
      where: { categoryId: In(categoryIds) },
    });
    if (usedCount > 0 || documentCount > 0) {
      throw new BadRequestException('该分类下存在知识库或文档，不能删除');
    }
    await this.categoryRepository.softDelete(categoryIds);
    return { id, ids: categoryIds };
  }

  async findDocuments(query: QueryKnowledgeBaseDocumentDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const qb = this.documentRepository
      .createQueryBuilder('document')
      .orderBy('document.sort', 'ASC')
      .addOrderBy('document.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (query.knowledgeBaseId) {
      qb.andWhere('document.knowledgeBaseId = :knowledgeBaseId', {
        knowledgeBaseId: query.knowledgeBaseId,
      });
    }
    if (query.categoryId) {
      qb.andWhere('document.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }
    if (query.keyword?.trim()) {
      qb.andWhere(
        '(document.title LIKE :keyword OR document.sourceName LIKE :keyword OR document.content LIKE :keyword)',
        { keyword: `%${query.keyword.trim()}%` },
      );
    }
    const [list, total] = await qb.getManyAndCount();
    return { list, total };
  }

  async findDocument(id: number) {
    const document = await this.documentRepository.findOne({ where: { id } });
    if (!document) throw new NotFoundException('知识库文档不存在');
    return document;
  }

  async createDocument(dto: CreateKnowledgeBaseDocumentDto) {
    const base = await this.findBase(dto.knowledgeBaseId);
    const categoryId = dto.categoryId ?? base.categoryId;
    await this.assertCategoryExists(categoryId);
    return this.documentRepository.save(
      this.documentRepository.create({
        knowledgeBaseId: dto.knowledgeBaseId,
        categoryId,
        title: dto.title.trim(),
        sourceType: dto.sourceType?.trim() || 'manual',
        sourceName: dto.sourceName?.trim() ?? '',
        content: dto.content?.trim() || null,
        status: dto.status?.trim() || 'draft',
        description: dto.description?.trim() || null,
        sort: dto.sort ?? 0,
      }),
    );
  }

  async createMineruTask(id: number, dto: CreateKnowledgeBaseMineruTaskDto) {
    const document = await this.findDocument(id);
    await this.assertSupportedDocumentFileForDocument(
      document,
      dto.fileUrl,
      dto.fileName,
    );
    return this.mineruConfigsService.createParseTask(
      dto.fileUrl.trim(),
      dto.fileName?.trim(),
    );
  }

  async queryMineruTask(id: number, taskId: string) {
    const document = await this.findDocument(id);
    const result = await this.mineruConfigsService.queryParseTask(taskId);
    if (!this.mineruConfigsService.isSuccessStatus(result.status)) {
      return {
        ...result,
        isCompleted: false,
        documentId: id,
        chunkCount: 0,
      };
    }
    const saved = await this.applyThirdPartyMarkdown(document, result.markdown);
    return {
      ...result,
      isCompleted: true,
      documentId: id,
      chunkCount: saved.chunkCount,
    };
  }

  async parseDocumentWithMineru(
    id: number,
    dto: ParseKnowledgeBaseDocumentDto,
  ) {
    const document = await this.findDocument(id);
    await this.assertSupportedDocumentFileForDocument(
      document,
      dto.fileUrl,
      dto.fileName,
    );
    if (dto.waitForResult === false) {
      const task = await this.mineruConfigsService.createParseTask(
        dto.fileUrl.trim(),
        dto.fileName?.trim(),
      );
      return {
        ...task,
        documentId: id,
        isCompleted: false,
        chunkCount: 0,
      };
    }
    return this.executeDocumentThirdPartyParse(document, dto);
  }

  async parseDocument(
    id: number,
    dto: ParseKnowledgeBaseDocumentRequestDto,
  ) {
    const parseMode = this.resolveParseMode(dto.parseMode);
    const document = await this.findDocument(id);
    if (parseMode === KNOWLEDGE_PARSE_MODE.mineru && !dto.fileUrl) {
      document.status = 'failed';
      document.description = 'MinerU 解析需要提供文件 URL';
      await this.documentRepository.save(document);
      throw new BadRequestException('MinerU 解析需要提供文件 URL');
    }
    if (parseMode === KNOWLEDGE_PARSE_MODE.mineru) {
      await this.assertSupportedDocumentFileForDocument(
        document,
        dto.fileUrl!,
        dto.fileName,
      );
    }
    document.status = 'processing';
    document.description = `${this.getParseModeLabel(parseMode)}任务已提交，等待执行`;
    await this.documentRepository.save(document);
    return this.taskQueueService.add(
      'knowledge-base-document.parse',
      { documentId: id, parseMode },
      () => this.executeParseDocument(id, dto),
    );
  }

  private async executeParseDocument(
    id: number,
    dto: ParseKnowledgeBaseDocumentRequestDto,
  ) {
    const parseMode = this.resolveParseMode(dto.parseMode);
    const document = await this.findDocument(id);
    try {
      return this.parseDocumentByMode(document, dto, parseMode);
    } catch (error) {
      document.status = 'failed';
      document.description = error instanceof Error ? error.message : '解析失败';
      await this.documentRepository.save(document);
      throw error;
    }
  }

  private async parseDocumentByMode(
    document: KnowledgeBaseDocument,
    dto: ParseKnowledgeBaseDocumentRequestDto,
    parseMode: KnowledgeParseMode,
  ) {
    if (parseMode === KNOWLEDGE_PARSE_MODE.mineru) {
      return this.executeDocumentThirdPartyParse(document, {
        fileUrl: dto.fileUrl!,
        fileName: dto.fileName,
        waitForResult: dto.waitForResult,
      });
    }

    const content = await this.documentParsersService.parse({
      contentType: this.resolveDocumentManualContentType(document),
      contentText: document.content,
      fileUrl: dto.fileUrl,
      fileName: document.sourceName,
    });
    document.content = content.trim();
    document.status = 'parsed';
    document.sourceType = KNOWLEDGE_PARSE_MODE.manual;
    const saved = await this.documentRepository.save(document);
    await this.syncBaseParsedContent(saved, content);
    await this.chunkRepository.softDelete({ documentId: saved.id });
    const chunkCount = await this.saveDocumentChunks(saved);
    saved.description = `手动解析完成，共 ${chunkCount} 个分片`;
    await this.documentRepository.save(saved);
    return {
      document: saved,
      documentId: saved.id,
      isCompleted: true,
      chunkCount,
      parseMode,
    };
  }

  private async executeDocumentThirdPartyParse(
    document: KnowledgeBaseDocument,
    dto: ParseKnowledgeBaseDocumentDto,
  ) {
    const result = await this.mineruConfigsService.waitForSuccess(
      (
        await this.mineruConfigsService.createParseTask(
          dto.fileUrl.trim(),
          dto.fileName?.trim(),
        )
      ).taskId,
    );
    const saved = await this.applyThirdPartyMarkdown(
      document,
      result.markdown,
      dto.fileName || this.resolveFileName(dto.fileUrl),
    );
    return {
      ...result,
      documentId: document.id,
      isCompleted: true,
      chunkCount: saved.chunkCount,
      parseMode: KNOWLEDGE_PARSE_MODE.mineru,
    };
  }

  async updateDocument(id: number, dto: UpdateKnowledgeBaseDocumentDto) {
    const document = await this.findDocument(id);
    const knowledgeBaseId = dto.knowledgeBaseId ?? document.knowledgeBaseId;
    const base = await this.findBase(knowledgeBaseId);
    const categoryId =
      dto.categoryId !== undefined
        ? dto.categoryId
        : dto.knowledgeBaseId !== undefined
          ? base.categoryId
          : document.categoryId;
    await this.assertCategoryExists(categoryId);
    if (dto.knowledgeBaseId !== undefined) document.knowledgeBaseId = dto.knowledgeBaseId;
    if (dto.knowledgeBaseId !== undefined || dto.categoryId !== undefined) {
      document.categoryId = categoryId ?? null;
    }
    if (dto.title !== undefined) document.title = dto.title.trim();
    if (dto.sourceType !== undefined) document.sourceType = dto.sourceType.trim() || 'manual';
    if (dto.sourceName !== undefined) document.sourceName = dto.sourceName.trim();
    if (dto.content !== undefined) document.content = dto.content.trim() || null;
    if (dto.status !== undefined) document.status = dto.status.trim() || 'draft';
    if (dto.description !== undefined) {
      document.description = dto.description.trim() || null;
    }
    if (dto.sort !== undefined) document.sort = dto.sort;
    const saved = await this.documentRepository.save(document);
    await this.chunkRepository.update(
      { documentId: saved.id },
      {
        knowledgeBaseId: saved.knowledgeBaseId,
        categoryId: saved.categoryId,
      },
    );
    return saved;
  }

  async removeDocument(id: number) {
    await this.findDocument(id);
    await this.chunkRepository.softDelete({ documentId: id });
    await this.documentRepository.softDelete(id);
    return { id };
  }

  async findChunks(query: QueryKnowledgeBaseChunkDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const qb = this.chunkRepository
      .createQueryBuilder('chunk')
      .orderBy('chunk.sort', 'ASC')
      .addOrderBy('chunk.chunkIndex', 'ASC')
      .addOrderBy('chunk.id', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (query.knowledgeBaseId) {
      qb.andWhere('chunk.knowledgeBaseId = :knowledgeBaseId', {
        knowledgeBaseId: query.knowledgeBaseId,
      });
    }
    if (query.documentId) {
      qb.andWhere('chunk.documentId = :documentId', {
        documentId: query.documentId,
      });
    }
    if (query.keyword?.trim()) {
      qb.andWhere(
        '(chunk.title LIKE :keyword OR chunk.content LIKE :keyword)',
        { keyword: `%${query.keyword.trim()}%` },
      );
    }
    const [list, total] = await qb.getManyAndCount();
    return { list, total };
  }

  async findChunk(id: number) {
    const chunk = await this.chunkRepository.findOne({ where: { id } });
    if (!chunk) throw new NotFoundException('知识库分片不存在');
    return chunk;
  }

  async createChunk(dto: CreateKnowledgeBaseChunkDto) {
    const document = await this.findDocument(dto.documentId);
    return this.chunkRepository.save(
      this.chunkRepository.create({
        knowledgeBaseId: document.knowledgeBaseId,
        categoryId: document.categoryId,
        documentId: document.id,
        chunkIndex: dto.chunkIndex ?? 0,
        title: dto.title?.trim() ?? '',
        content: dto.content.trim(),
        tokenCount: dto.tokenCount ?? 0,
        sort: dto.sort ?? 0,
      }),
    );
  }

  async updateChunk(id: number, dto: UpdateKnowledgeBaseChunkDto) {
    const chunk = await this.findChunk(id);
    if (dto.documentId !== undefined) {
      const document = await this.findDocument(dto.documentId);
      chunk.documentId = document.id;
      chunk.knowledgeBaseId = document.knowledgeBaseId;
      chunk.categoryId = document.categoryId;
    }
    if (dto.chunkIndex !== undefined) chunk.chunkIndex = dto.chunkIndex;
    if (dto.title !== undefined) chunk.title = dto.title.trim();
    if (dto.content !== undefined) chunk.content = dto.content.trim();
    if (dto.tokenCount !== undefined) chunk.tokenCount = dto.tokenCount;
    if (dto.sort !== undefined) chunk.sort = dto.sort;
    return this.chunkRepository.save(chunk);
  }

  async removeChunk(id: number) {
    await this.findChunk(id);
    await this.chunkRepository.softDelete(id);
    return { id };
  }

  private buildCategoryTree(list: KnowledgeBaseCategory[]) {
    const map = new Map<number, KnowledgeBaseCategoryTreeNode>();
    const roots: KnowledgeBaseCategoryTreeNode[] = [];
    list.forEach((item) =>
      map.set(item.id, { ...(item as KnowledgeBaseCategory), children: [] }),
    );
    map.forEach((node) => {
      if (node.parentId && map.has(node.parentId)) {
        map.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }

  private resolveInitialProcessStage(
    contentType: string,
    contentText?: string | null,
    fileUrl?: string | null,
  ) {
    if (contentType === 'text') {
      return contentText?.trim() ? 'ready' : 'draft';
    }
    return fileUrl?.trim() ? 'uploaded' : 'draft';
  }

  private async updateBaseProcess(
    base: KnowledgeBase,
    payload: Partial<
      Pick<
        KnowledgeBase,
        | 'processStage'
        | 'parseStatus'
        | 'chunkStatus'
        | 'indexStatus'
        | 'lastProcessMessage'
      >
    >,
  ) {
    Object.assign(base, payload);
    return this.baseRepository.save(base);
  }

  private resolveParseMode(mode?: string | null): KnowledgeParseMode {
    return mode === KNOWLEDGE_PARSE_MODE.mineru
      ? KNOWLEDGE_PARSE_MODE.mineru
      : KNOWLEDGE_PARSE_MODE.manual;
  }

  private getParseModeLabel(mode: KnowledgeParseMode) {
    return mode === KNOWLEDGE_PARSE_MODE.mineru ? 'MinerU 解析' : '手动解析';
  }

  private async parseBaseContentByMode(
    base: KnowledgeBase,
    parseMode: KnowledgeParseMode,
  ) {
    if (base.contentType === 'text') {
      const content = base.contentText?.trim();
      if (!content) {
        throw new BadRequestException('文本知识库缺少文本内容');
      }
      return content;
    }
    if (!base.fileUrl) {
      throw new BadRequestException('文件知识库缺少上传文件');
    }
    this.assertSupportedDocumentFile(base.fileUrl, base.fileName);

    if (parseMode === KNOWLEDGE_PARSE_MODE.manual) {
      return this.documentParsersService.parse({
        contentType: base.contentType as 'text' | 'pdf' | 'word',
        contentText: base.contentText,
        fileUrl: base.fileUrl,
        fileName: base.fileName,
      });
    }

    return this.parseBaseWithThirdParty(base);
  }

  private async parseBaseWithThirdParty(base: KnowledgeBase) {
    const task = await this.mineruConfigsService.createParseTask(
      base.fileUrl,
      base.fileName,
    );
    const result = await this.mineruConfigsService.waitForSuccess(task.taskId);
    return result.markdown;
  }

  private async findBaseDocument(knowledgeBaseId: number) {
    const document = await this.documentRepository.findOne({
      where: { knowledgeBaseId },
      order: { id: 'DESC' },
    });
    if (!document) {
      throw new BadRequestException('请先解析生成知识库文档');
    }
    return document;
  }

  private async saveBaseDocument(
    base: KnowledgeBase,
    content: string,
    parseMode: KnowledgeParseMode,
  ) {
    const current = await this.documentRepository.findOne({
      where: { knowledgeBaseId: base.id },
      order: { id: 'DESC' },
    });
    const document =
      current ??
      this.documentRepository.create({
        knowledgeBaseId: base.id,
        categoryId: base.categoryId,
        sort: 0,
      });
    document.knowledgeBaseId = base.id;
    document.categoryId = base.categoryId;
    document.title = base.name;
    document.sourceType =
      base.contentType === 'text' ? 'text' : parseMode;
    document.sourceName =
      base.contentType === 'text' ? base.name : base.fileName || base.name;
    document.content = content.trim();
    document.status = 'parsed';
    document.description = null;
    const saved = await this.documentRepository.save(document);
    base.contentText = content.trim();
    return saved;
  }

  private async saveDocumentChunks(document: KnowledgeBaseDocument) {
    const chunks = this.splitMarkdown(document.content ?? '');
    if (!chunks.length) return 0;
    await this.chunkRepository.save(
      chunks.map((chunk, index) =>
        this.chunkRepository.create({
          knowledgeBaseId: document.knowledgeBaseId,
          categoryId: document.categoryId,
          documentId: document.id,
          chunkIndex: index,
          title: `${document.title} #${index + 1}`,
          content: chunk,
          tokenCount: chunk.length,
          sort: index,
        }),
      ),
    );
    return chunks.length;
  }

  private async applyThirdPartyMarkdown(
    document: KnowledgeBaseDocument,
    markdown: string,
    fileName?: string,
  ) {
    const content = markdown.trim();
    if (!content) {
      throw new BadRequestException('MinerU 解析结果缺少 Markdown 正文');
    }
    document.content = content;
    document.status = 'parsed';
    document.sourceType = KNOWLEDGE_PARSE_MODE.mineru;
    if (fileName) document.sourceName = fileName;
    let saved = await this.documentRepository.save(document);
    await this.syncBaseParsedContent(saved, content);
    await this.chunkRepository.softDelete({ documentId: saved.id });
    const chunkCount = await this.saveDocumentChunks(saved);
    saved.description = `MinerU 解析完成，共 ${chunkCount} 个分片`;
    saved = await this.documentRepository.save(saved);
    return { document: saved, chunkCount };
  }

  private resolveDocumentManualContentType(
    document: KnowledgeBaseDocument,
  ): 'text' | 'pdf' | 'word' {
    if (document.sourceType === 'pdf') return 'pdf';
    if (document.sourceType === 'word') return 'word';
    return 'text';
  }

  private async syncBaseParsedContent(
    document: KnowledgeBaseDocument,
    content: string,
  ) {
    await this.baseRepository.update(document.knowledgeBaseId, {
      contentText: content.trim(),
    });
  }

  private splitMarkdown(content: string, chunkSize = 1200, overlap = 120) {
    const text = content.trim();
    if (!text) return [];
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.slice(start, end).trim());
      if (end >= text.length) break;
      start = Math.max(end - overlap, start + 1);
    }
    return chunks.filter(Boolean);
  }

  private assertSupportedDocumentFile(fileUrl: string, fileName?: string) {
    const supported = new Set([
      '.pdf',
      '.doc',
      '.docx',
      '.xls',
      '.xlsx',
      '.ppt',
      '.pptx',
      '.txt',
      '.md',
    ]);
    const name = (fileName || this.resolveFileName(fileUrl)).toLowerCase();
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
    if (!supported.has(ext)) {
      throw new BadRequestException(
        'MinerU 仅支持 .pdf .doc .docx .xls .xlsx .ppt .pptx .txt .md',
      );
    }
  }

  private async assertSupportedDocumentFileForDocument(
    document: KnowledgeBaseDocument,
    fileUrl: string,
    fileName?: string,
  ) {
    try {
      this.assertSupportedDocumentFile(fileUrl, fileName);
    } catch (error) {
      document.status = 'failed';
      document.description =
        error instanceof Error ? error.message : '文档格式不支持';
      await this.documentRepository.save(document);
      throw error;
    }
  }

  private resolveFileName(fileUrl: string) {
    try {
      const pathname = new URL(fileUrl).pathname;
      return decodeURIComponent(pathname.split('/').pop() || '');
    } catch {
      return fileUrl.split('/').pop() || '';
    }
  }

  private collectDescendantIds(list: KnowledgeBaseCategory[], parentId: number) {
    const childrenMap = new Map<number, KnowledgeBaseCategory[]>();
    list.forEach((item) => {
      if (!item.parentId) return;
      const children = childrenMap.get(item.parentId) ?? [];
      children.push(item);
      childrenMap.set(item.parentId, children);
    });
    const ids: number[] = [];
    const stack = [...(childrenMap.get(parentId) ?? [])];
    while (stack.length) {
      const current = stack.pop()!;
      ids.push(current.id);
      stack.push(...(childrenMap.get(current.id) ?? []));
    }
    return ids;
  }

  private async assertCategoryExists(categoryId?: number | null) {
    if (!categoryId) return;
    await this.findCategory(categoryId);
  }

  private async assertRequiredCategory(categoryId?: number | null) {
    if (!categoryId) {
      throw new BadRequestException('请选择知识库分类');
    }
    await this.assertCategoryExists(categoryId);
  }

  private async assertParentCategory(
    parentId?: number | null,
    currentId?: number,
  ) {
    if (!parentId) return;
    if (currentId && parentId === currentId) {
      throw new BadRequestException('上级分类不能选择自己');
    }
    await this.findCategory(parentId);
  }
}
