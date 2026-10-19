import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Like, Repository } from 'typeorm';
import { ContentGenerationService } from './content-generation.service';
import { ContentArticle } from './entities/content-article.entity';
import {
  CreateContentArticleDto,
  QueryContentArticleDto,
  UpdateContentArticleDto,
} from './dto/content-article.dto';

@Injectable()
export class ContentArticlesService {
  constructor(
    @InjectRepository(ContentArticle)
    private readonly repository: Repository<ContentArticle>,
    private readonly generation: ContentGenerationService,
  ) {}

  async findAll(query: QueryContentArticleDto, userId: number) {
    const keyword = query.keyword?.trim();
    const [list, total] = await this.repository.findAndCount({
      select: {
        id: true,
        title: true,
        coverUrl: true,
        createdAt: true,
        updatedAt: true,
        version: true,
      },
      where: { userId, ...(keyword ? { title: Like(`%${keyword}%`) } : {}) },
      order: { id: 'DESC' },
      skip: ((query.page ?? 1) - 1) * (query.pageSize ?? 10),
      take: query.pageSize ?? 10,
    });
    const tasks = await this.generation.latest(
      list.map((row) => row.id),
      userId,
    );
    const latest = new Map(tasks.map((task) => [task.articleId, task]));
    return {
      list: list.map((row) => ({
        ...row,
        latestTask: latest.get(row.id) ?? null,
      })),
      total,
    };
  }

  async findOne(id: number, userId: number) {
    const article = await this.repository.findOne({ where: { id, userId } });
    if (!article) throw new NotFoundException('内容不存在');
    return article;
  }

  create(dto: CreateContentArticleDto, userId: number) {
    return this.repository.save(
      this.repository.create({ ...this.fields(dto), userId }),
    );
  }

  async update(id: number, dto: UpdateContentArticleDto, userId: number) {
    await this.findOne(id, userId);
    const result = await this.repository.update(
      { id, userId, version: dto.version, deletedAt: IsNull() },
      {
        title: dto.title.trim(),
        ...(dto.coverUrl !== undefined ? { coverUrl: dto.coverUrl ?? '' } : {}),
        ...(dto.idea !== undefined ? { idea: dto.idea ?? '' } : {}),
        ...(dto.content !== undefined ? { content: dto.content ?? '' } : {}),
        version: dto.version + 1,
      },
    );
    if (result.affected !== 1)
      throw new ConflictException(
        '内容已被更新或删除，请保留当前文字并重新打开后编辑',
      );
    return this.findOne(id, userId);
  }

  async remove(id: number, userId: number) {
    await this.findOne(id, userId);
    await this.repository.softDelete({ id, userId });
    return { id };
  }

  async batchRemove(ids: number[], userId: number) {
    const uniqueIds = [...new Set(ids)];
    const count = await this.repository.count({
      where: { id: In(uniqueIds), userId },
    });
    if (count !== uniqueIds.length)
      throw new NotFoundException('部分内容不存在');
    await this.repository.softDelete({ id: In(uniqueIds), userId });
    return { ids: uniqueIds };
  }

  private fields(dto: CreateContentArticleDto) {
    return {
      title: dto.title.trim(),
      coverUrl: dto.coverUrl ?? '',
      idea: dto.idea ?? '',
      content: dto.content ?? '',
    };
  }
}
