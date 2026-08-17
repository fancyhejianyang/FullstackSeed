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
  ParseKnowledgeBaseDocumentDto,
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
import { MineruConfigsService } from '../mineru-configs/mineru-configs.service';

export interface KnowledgeBaseCategoryTreeNode extends KnowledgeBaseCategory {
  children: KnowledgeBaseCategoryTreeNode[];
}

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
    private readonly mineruConfigsService: MineruConfigsService,
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
    return base;
  }

  async createBase(dto: CreateKnowledgeBaseDto) {
    await this.assertRequiredCategory(dto.categoryId);
    return this.baseRepository.save(
      this.baseRepository.create({
        categoryId: dto.categoryId,
        name: dto.name.trim(),
        code: dto.code?.trim() ?? '',
        description: dto.description?.trim() || null,
        contentType: dto.contentType ?? 'text',
        containsImages: dto.containsImages ?? false,
        allowFileUpload:
          dto.allowFileUpload ??
          (dto.contentType === 'file' || dto.contentType === 'mixed'),
        isEnabled: dto.isEnabled ?? true,
        sort: dto.sort ?? 0,
      }),
    );
  }

  async updateBase(id: number, dto: UpdateKnowledgeBaseDto) {
    const base = await this.findBase(id);
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
    if (dto.containsImages !== undefined) {
      base.containsImages = dto.containsImages;
    }
    if (dto.allowFileUpload !== undefined) {
      base.allowFileUpload = dto.allowFileUpload;
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
    await this.findDocument(id);
    this.assertSupportedDocumentFile(dto.fileUrl, dto.fileName);
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
    const saved = await this.applyMineruMarkdown(document, result.markdown);
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
    this.assertSupportedDocumentFile(dto.fileUrl, dto.fileName);
    const task = await this.mineruConfigsService.createParseTask(
      dto.fileUrl.trim(),
      dto.fileName?.trim(),
    );
    if (dto.waitForResult === false) {
      return {
        ...task,
        documentId: id,
        isCompleted: false,
        chunkCount: 0,
      };
    }
    const result = await this.mineruConfigsService.waitForSuccess(task.taskId);
    const saved = await this.applyMineruMarkdown(
      document,
      result.markdown,
      dto.fileName || this.resolveFileName(dto.fileUrl),
    );
    return {
      ...result,
      documentId: id,
      isCompleted: true,
      chunkCount: saved.chunkCount,
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

  private async applyMineruMarkdown(
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
    document.sourceType = 'mineru';
    if (fileName) document.sourceName = fileName;
    const saved = await this.documentRepository.save(document);
    await this.chunkRepository.softDelete({ documentId: saved.id });
    const chunks = this.splitMarkdown(content);
    if (chunks.length) {
      await this.chunkRepository.save(
        chunks.map((chunk, index) =>
          this.chunkRepository.create({
            knowledgeBaseId: saved.knowledgeBaseId,
            categoryId: saved.categoryId,
            documentId: saved.id,
            chunkIndex: index,
            title: `${saved.title} #${index + 1}`,
            content: chunk,
            tokenCount: chunk.length,
            sort: index,
          }),
        ),
      );
    }
    return { document: saved, chunkCount: chunks.length };
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
