import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Role } from './entities/role.entity';
import { PermissionsService } from '../permissions/permissions.service';
import { CreateRoleDto, UpdateRoleDto, QueryRoleDto } from './dto/role.dto';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    private readonly permissionsService: PermissionsService,
  ) {}

  private normalizePermissionCodes(codes: string[] | undefined): string[] {
    if (!codes) return [];
    return Array.from(new Set(codes.map((code) => code.trim()).filter(Boolean)));
  }

  /** 分页查询（含关联权限） */
  async findAll(query: QueryRoleDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const [list, total] = await this.roleRepository.findAndCount({
      where: query.keyword ? { name: Like(`%${query.keyword}%`) } : {},
      relations: { permissions: true },
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total };
  }

  /** 详情（含关联权限） */
  async findOne(id: number) {
    const role = await this.roleRepository.findOne({
      where: { id },
      relations: { permissions: true },
    });
    if (!role) {
      throw new NotFoundException('角色不存在');
    }
    return role;
  }

  /** 创建（code 唯一，可同时绑定权限） */
  async create(dto: CreateRoleDto) {
    const exist = await this.roleRepository.findOne({
      where: { code: dto.code },
    });
    if (exist) {
      throw new ConflictException('角色编码已存在');
    }
    const { permissionIds, permissionCodes, ...rest } = dto;
    const role = this.roleRepository.create(rest);
    if (permissionCodes) {
      role.permissionCodes = this.normalizePermissionCodes(permissionCodes);
    } else if (permissionIds) {
      role.permissions = await this.permissionsService.findByIds(permissionIds);
    }
    return this.roleRepository.save(role);
  }

  /** 更新（permissionIds 传入时整体覆盖角色权限） */
  async update(id: number, dto: UpdateRoleDto) {
    const role = await this.findOne(id);
    const { permissionIds, permissionCodes, ...rest } = dto;
    Object.assign(role, rest);
    if (permissionCodes) {
      role.permissionCodes = this.normalizePermissionCodes(permissionCodes);
    } else if (permissionIds) {
      role.permissions = await this.permissionsService.findByIds(permissionIds);
    }
    return this.roleRepository.save(role);
  }

  /** 删除（软删除） */
  async remove(id: number) {
    await this.findOne(id);
    await this.roleRepository.softDelete(id);
    return { id };
  }
}
