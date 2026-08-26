import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { Permission } from './entities/permission.entity';
import {
  CreatePermissionDto,
  UpdatePermissionDto,
  QueryPermissionDto,
} from './dto/permission.dto';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
  ) {}

  /** 分页查询（支持 code/name 关键字） */
  async findAll(query: QueryPermissionDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const [list, total] = await this.permissionRepository.findAndCount({
      where: query.keyword
        ? [
            { code: Like(`%${query.keyword}%`) },
            { name: Like(`%${query.keyword}%`) },
          ]
        : {},
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    // 锁定list 内字段

    return {
      list: list.map(({ createdAt, updatedAt, deletedAt, ...rest }) => rest),
      total,
    };
  }

  /** 详情 */
  async findOne(id: number) {
    const permission = await this.permissionRepository.findOne({
      where: { id },
    });
    if (!permission) {
      throw new NotFoundException('权限不存在');
    }
    return permission;
  }

  /** 按 id 列表查询（供角色关联校验） */
  findByIds(ids: number[]) {
    if (!ids || ids.length === 0) {
      return Promise.resolve([] as Permission[]);
    }
    return this.permissionRepository.findBy({ id: In(ids) });
  }

  /** 创建（code 唯一） */
  async create(dto: CreatePermissionDto) {
    const exist = await this.permissionRepository.findOne({
      where: { code: dto.code },
    });
    if (exist) {
      throw new ConflictException('权限编码已存在');
    }
    return this.permissionRepository.save(
      this.permissionRepository.create(dto),
    );
  }

  /** 更新 */
  async update(id: number, dto: UpdatePermissionDto) {
    const permission = await this.findOne(id);
    Object.assign(permission, dto);
    return this.permissionRepository.save(permission);
  }

  /** 删除（软删除） */
  async remove(id: number) {
    await this.findOne(id);
    await this.permissionRepository.softDelete(id);
    return { id };
  }
}
