import { Entity, Column, ManyToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Role } from '../../roles/entities/role.entity';

/**
 * 权限点实体：命名约定 资源:动作（如 user:create / user:read）
 */
@Entity('permissions')
export class Permission extends BaseEntity {
  // 权限编码，全局唯一，如 user:create
  @Column({ unique: true })
  code: string;

  // 权限名称（中文展示）
  @Column()
  name: string;

  // 权限类型：菜单 / 按钮 / 接口
  @Column({ type: 'enum', enum: ['menu', 'button', 'api'], default: 'api' })
  type: 'menu' | 'button' | 'api';

  @Column({ default: '' })
  description: string;

  // 归属菜单 id（null 表示未分组），前端按此挂到菜单树
  @Column({ type: 'int', nullable: true })
  menuId: number | null;

  @ManyToMany(() => Role, (role) => role.permissions)
  roles: Role[];
}
