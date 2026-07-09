import { Entity, Column, ManyToMany, JoinTable } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Role } from '../../roles/entities/role.entity';

@Entity('users')
export class User extends BaseEntity {
  @Column({ unique: true })
  username: string;

  // 密码默认不返回
  @Column({ select: false })
  password: string;

  @Column({ default: '' })
  nickname: string;

  @Column({ type: 'tinyint', default: true })
  isActive: boolean;

  // 超级管理员：放行一切权限（绕过 RBAC 校验）
  @Column({ type: 'tinyint', default: false })
  isAdmin: boolean;

  // 用户角色（多对多）
  @ManyToMany(() => Role, { cascade: true })
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'userId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'roleId', referencedColumnName: 'id' },
  })
  roles: Role[];
}
