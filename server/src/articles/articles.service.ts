import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Article } from './entities/article.entity';
import {
  CreateArticleDto,
  UpdateArticleDto,
  QueryArticleDto,
} from './dto/article.dto';

@Injectable()
export class ArticlesService {
  constructor(
    @InjectRepository(Article)
    private readonly articleRepository: Repository<Article>,
  ) {}

  /** 分页查询（支持标题关键字搜索） */
  async findAll(query: QueryArticleDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const [list, total] = await this.articleRepository.findAndCount({
      where: query.keyword ? { title: Like(`%${query.keyword}%`) } : {},
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total };
  }

  /** 详情 */
  async findOne(id: number) {
    const article = await this.articleRepository.findOne({ where: { id } });
    if (!article) {
      throw new NotFoundException('文章不存在');
    }
    return article;
  }

  /** 创建 */
  create(dto: CreateArticleDto) {
    return this.articleRepository.save(this.articleRepository.create(dto));
  }

  /** 更新 */
  async update(id: number, dto: UpdateArticleDto) {
    const article = await this.findOne(id);
    Object.assign(article, dto);
    return this.articleRepository.save(article);
  }

  /** 删除（软删除） */
  async remove(id: number) {
    await this.findOne(id);
    await this.articleRepository.softDelete(id);
    return { id };
  }
  /** 批量删除（软删除） */
  async batchRemove(ids: number[]) {
    for (const id of ids) {
      await this.remove(id);
    }
    return { ids };
  }
}