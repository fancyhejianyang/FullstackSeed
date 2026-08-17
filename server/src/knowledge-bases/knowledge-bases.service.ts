import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
import { KnowledgeBaseCategory } from './entities/knowledge-base-category.entity';
import { KnowledgeBaseChunk } from './entities/knowledge-base-chunk.entity';
import { KnowledgeBaseDocument } from './entities/knowledge-base-document.entity';
import { KnowledgeBase } from './entities/knowledge-base.entity';

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
    const [list, total] = await qb.getManyAndCount();
    return { list, total };
  }

  async findBase(id: number) {
    const base = await this.baseRepository.findOne({ where: { id } });
    if (!base) throw new NotFoundException('知识库不存在');
    return base;
  }

  createBase(dto: CreateKnowledgeBaseDto) {
    return this.baseRepository.save(
      this.baseRepository.create({
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
    await this.categoryRepository.softDelete({ knowledgeBaseId: id });
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
    await this.categoryRepository.softDelete({ knowledgeBaseId: In(ids) });
    await this.baseRepository.softDelete(ids);
    return { ids };
  }

  async findCategories(query: QueryKnowledgeBaseCategoryDto) {
    const qb = this.categoryRepository
      .createQueryBuilder('category')
      .orderBy('category.sort', 'ASC')
      .addOrderBy('category.id', 'ASC');
    if (query.knowledgeBaseId) {
      qb.andWhere('category.knowledgeBaseId = :knowledgeBaseId', {
        knowledgeBaseId: query.knowledgeBaseId,
      });
    }
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
      knowledgeBaseId: query.knowledgeBaseId,
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
    await this.findBase(dto.knowledgeBaseId);
    await this.assertParentCategory(dto.knowledgeBaseId, dto.parentId);
    return this.categoryRepository.save(
      this.categoryRepository.create({
        knowledgeBaseId: dto.knowledgeBaseId,
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
    const knowledgeBaseId = dto.knowledgeBaseId ?? category.knowledgeBaseId;
    await this.findBase(knowledgeBaseId);
    await this.assertParentCategory(knowledgeBaseId, dto.parentId, id);
    if (dto.knowledgeBaseId !== undefined) category.knowledgeBaseId = dto.knowledgeBaseId;
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
    const category = await this.findCategory(id);
    const categories = await this.categoryRepository.find({
      where: { knowledgeBaseId: category.knowledgeBaseId },
    });
    const categoryIds = [id, ...this.collectDescendantIds(categories, id)];
    const documents = await this.documentRepository.find({
      where: { categoryId: In(categoryIds) },
    });
    const documentIds = documents.map((item) => item.id);
    if (documentIds.length) {
      await this.chunkRepository.softDelete({ documentId: In(documentIds) });
    }
    await this.chunkRepository.softDelete({ categoryId: In(categoryIds) });
    await this.documentRepository.softDelete({ categoryId: In(categoryIds) });
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
    await this.findBase(dto.knowledgeBaseId);
    await this.assertCategory(dto.knowledgeBaseId, dto.categoryId);
    return this.documentRepository.save(
      this.documentRepository.create({
        knowledgeBaseId: dto.knowledgeBaseId,
        categoryId: dto.categoryId ?? null,
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

  async updateDocument(id: number, dto: UpdateKnowledgeBaseDocumentDto) {
    const document = await this.findDocument(id);
    const knowledgeBaseId = dto.knowledgeBaseId ?? document.knowledgeBaseId;
    await this.findBase(knowledgeBaseId);
    await this.assertCategory(knowledgeBaseId, dto.categoryId);
    if (dto.knowledgeBaseId !== undefined) document.knowledgeBaseId = dto.knowledgeBaseId;
    if (dto.categoryId !== undefined) document.categoryId = dto.categoryId ?? null;
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

  private async assertCategory(
    knowledgeBaseId: number,
    categoryId?: number | null,
  ) {
    if (!categoryId) return;
    const category = await this.findCategory(categoryId);
    if (category.knowledgeBaseId !== knowledgeBaseId) {
      throw new BadRequestException('分类不属于当前知识库');
    }
  }

  private async assertParentCategory(
    knowledgeBaseId: number,
    parentId?: number | null,
    currentId?: number,
  ) {
    if (!parentId) return;
    if (currentId && parentId === currentId) {
      throw new BadRequestException('上级分类不能选择自己');
    }
    const parent = await this.findCategory(parentId);
    if (parent.knowledgeBaseId !== knowledgeBaseId) {
      throw new BadRequestException('上级分类不属于当前知识库');
    }
  }
}
