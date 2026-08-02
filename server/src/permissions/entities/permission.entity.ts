import { Entity, Column, ManyToMany } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Role } from '../../roles/entities/role.entity';

/**
 * 权限点实体：只维护基础动作集合（如 read / create / batchDelete）。
 * 角色授权时由菜单模块与动作组合成完整权限码（如 User.read）。
 */
@Entity('permissions')
export class Permission extends BaseEntity {
  // 权限编码，全局唯一，如 read
  @Column({ unique: true })
  code: string;

  // 权限名称（中文展示）
  @Column()
  name: string;

  // 权限类型：菜单 / 按钮 / 接口
  @Column({ type: 'enum', enum: ['menu', 'button', 'api'], default: 'api' })
  type: 'menu' | 'button' | 'api';

  // 兼容旧数据列，业务表单不再维护。
  @Column({ default: '' })
  description: string;

  // 兼容旧数据列，菜单归属改由角色授权时组合。
  @Column({ type: 'int', nullable: true })
  menuId: number | null;

  @ManyToMany(() => Role, (role) => role.permissions)
  roles: Role[];
}
