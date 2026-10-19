import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { ContentTemplate } from './entities/content-template.entity';
import {
  QueryContentTemplateDto,
  SaveContentTemplateDto,
} from './dto/content-template.dto';

@Injectable()
export class ContentTemplatesService {
  constructor(
    @InjectRepository(ContentTemplate)
    private readonly repository: Repository<ContentTemplate>,
  ) {}
  async findAll(query: QueryContentTemplateDto, userId: number) {
    const [list, total] = await this.repository.findAndCount({
      select: { id: true, name: true, updatedAt: true },
      where: {
        userId,
        ...(query.keyword?.trim()
          ? { name: Like(`%${query.keyword.trim()}%`) }
          : {}),
      },
      order: { id: 'DESC' },
      skip: ((query.page ?? 1) - 1) * (query.pageSize ?? 10),
      take: query.pageSize ?? 10,
    });
    return { list, total };
  }
  async findOne(id: number, userId: number) {
    const row = await this.repository.findOne({ where: { id, userId } });
    if (!row) throw new NotFoundException('写作模板不存在');
    return row;
  }
  create(dto: SaveContentTemplateDto, userId: number) {
    return this.repository.save(
      this.repository.create({
        name: dto.name.trim(),
        instruction: dto.instruction.trim(),
        userId,
      }),
    );
  }
  async update(id: number, dto: SaveContentTemplateDto, userId: number) {
    const row = await this.findOne(id, userId);
    row.name = dto.name.trim();
    row.instruction = dto.instruction.trim();
    return this.repository.save(row);
  }
  async remove(id: number, userId: number) {
    await this.findOne(id, userId);
    await this.repository.softDelete({ id, userId });
    return { id };
  }
  async batchRemove(ids: number[], userId: number) {
    const unique = [...new Set(ids)];
    if (
      (await this.repository.count({ where: { id: In(unique), userId } })) !==
      unique.length
    )
      throw new NotFoundException('部分写作模板不存在');
    await this.repository.softDelete({ id: In(unique), userId });
    return { ids: unique };
  }
}
