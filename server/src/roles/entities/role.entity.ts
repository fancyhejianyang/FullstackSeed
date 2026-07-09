import { Entity, Column, ManyToMany, JoinTable } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Permission } from '../../permissions/entities/permission.entity';

/**
 * 角色实体：通过 role_permissions 关联权限点
 */
@Entity('roles')
export class Role extends BaseEntity {
  // 角色编码，全局唯一，如 admin
  @Column({ unique: true })
  code: string;

  // 角色名称（中文展示）
  @Column()
  name: string;

  @Column({ default: '' })
  description: string;

  @Column({ type: 'tinyint', default: true })
  isActive: boolean;

  @ManyToMany(() => Permission, (permission) => permission.roles, {
    cascade: true,
  })
  @JoinTable({
    name: 'role_permissions',
    joinColumn: { name: 'roleId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permissionId', referencedColumnName: 'id' },
  })
  permissions: Permission[];
}
