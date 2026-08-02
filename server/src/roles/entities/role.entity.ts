import { Entity, Column, ManyToMany, JoinTable } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Permission } from '../../permissions/entities/permission.entity';

/**
 * 角色实体：permissionCodes 存最终授权结果，role_permissions 保留基础动作关联兼容。
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

  // 角色最终授权结果：完整权限码，如 Demo.read / User.update。
  @Column({ type: 'simple-json', nullable: true })
  permissionCodes: string[] | null;

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
