import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export type MenuType = 'menu' | 'button';

@Entity('menus')
export class Menu extends BaseEntity {
  // 父菜单 id，根菜单为 null
  @Column({ type: 'int', nullable: true })
  parentId: number | null;

  // 菜单名称
  @Column()
  name: string;

  // 前端路由路径（type=menu 时有效）
  @Column({ default: '' })
  path: string;

  // 图标名（Element Plus 图标组件名）
  @Column({ default: '' })
  icon: string;

  // 排序，越小越靠前
  @Column({ type: 'int', default: 0 })
  sort: number;

  // 类型：菜单 / 按钮
  @Column({ type: 'varchar', length: 20, default: 'menu' })
  type: MenuType;

  // 关联权限码（为空则所有登录用户可见，有则按权限过滤）
  @Column({ default: '' })
  permissionCode: string;

  // 系统固定菜单：仅超级管理员可见，不可分配给角色（由「系统配置 > 配置菜单」维护）
  @Column({ type: 'tinyint', default: false })
  isSystem: boolean;

  @Column({ type: 'tinyint', default: true })
  isActive: boolean;
}
