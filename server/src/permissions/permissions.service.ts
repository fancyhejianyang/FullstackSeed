import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { Permission } from './entities/permission.entity';
import { MenusService } from '../menus/menus.service';
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from './permission-catalog';
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
    private readonly menusService: MenusService,
  ) {}

  /** 角色编辑读取统一目录，避免额外依赖权限定义/菜单管理的授权。 */
  async catalog() {
    const [definitions, menus] = await Promise.all([
      this.permissionRepository.find(),
      this.menusService.findTree(),
    ]);
    const labels = new Map<string, string>(
      PERMISSION_ACTIONS.map((action) => [action.code, action.name]),
    );
    definitions.forEach((action) => labels.set(action.code, action.name));
    return {
      menus,
      modules: PERMISSION_MODULES.map((module) => ({
        code: module.code,
        name: module.name,
        actions: module.actions.map((code) => ({
          code,
          name: labels.get(code) ?? code,
        })),
      })),
    };
  }

  /** 分页查询（支持 code/name 关键字） */
  async findAll(query: QueryPermissionDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const baseWhere = query.type ? { type: query.type } : {};
    const [list, total] = await this.permissionRepository.findAndCount({
      where: query.keyword
        ? [
            { ...baseWhere, code: Like(`%${query.keyword}%`) },
            { ...baseWhere, name: Like(`%${query.keyword}%`) },
          ]
        : baseWhere,
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    // 锁定list 内字段

    return {
      list: list.map(({ id, code, name, type, description, menuId }) => ({
        id,
        code,
        name,
        type,
        description,
        menuId,
        modules: PERMISSION_MODULES.filter((module) =>
          module.actions.includes(code),
        ).map(({ code, name }) => ({ code, name })),
      })),
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
