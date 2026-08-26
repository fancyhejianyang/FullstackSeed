import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { Demo } from './entities/demo.entity';
import { CreateDemoDto, UpdateDemoDto, QueryDemoDto } from './dto/demo.dto';

@Injectable()
export class DemoService {
  constructor(
    @InjectRepository(Demo)
    private readonly demoRepository: Repository<Demo>,
  ) {}

  /** 分页查询（支持标题关键字搜索） */
  async findAll(query: QueryDemoDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const [list, total] = await this.demoRepository.findAndCount({
      where: query.keyword ? { title: Like(`%${query.keyword}%`) } : {},
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total };
  }

  /** 详情 */
  async findOne(id: number) {
    const demo = await this.demoRepository.findOne({ where: { id } });
    if (!demo) {
      throw new NotFoundException('示例不存在');
    }
    return demo;
  }

  /** 创建 */
  create(dto: CreateDemoDto) {
    return this.demoRepository.save(this.demoRepository.create(dto));
  }

  /** 更新 */
  async update(id: number, dto: UpdateDemoDto) {
    const demo = await this.findOne(id);
    Object.assign(demo, dto);
    return this.demoRepository.save(demo);
  }

  /** 删除（软删除） */
  async remove(id: number) {
    await this.findOne(id);
    await this.demoRepository.softDelete(id);
    return { id };
  }
  /** 批量删除（软删除） */
  async batchRemove(ids: number[]) {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) {
      return { ids: [] };
    }
    const count = await this.demoRepository.count({
      where: { id: In(uniqueIds) },
    });
    if (count !== uniqueIds.length) {
      throw new NotFoundException('部分示例不存在');
    }
    await this.demoRepository.softDelete(uniqueIds);
    return { ids: uniqueIds };
  }
}
