export type ModelFieldType =
  | 'number'
  | 'string'
  | 'text'
  | 'boolean'
  | 'datetime'
  | 'enum'
  | 'array'
  | 'relation';

export interface ModuleModelFieldMeta {
  prop: string;
  label: string;
  type: ModelFieldType;
  required: boolean;
  readonly?: boolean;
  unique?: boolean;
  nullable?: boolean;
  defaultValue?: string | number | boolean | null;
  length?: number;
  enumValues?: string[];
  relation?: {
    type: 'many-to-many' | 'many-to-one' | 'one-to-many' | 'one-to-one';
    targetModuleId: string;
    targetModelName: string;
  };
  description?: string;
}

export interface ModuleModelMeta {
  moduleId: string;
  moduleName: string;
  modelName: string;
  tableName: string;
  routePath: string;
  permissionPrefix: string;
  fields: ModuleModelFieldMeta[];
}

export interface ModuleModelSummary {
  moduleId: string;
  moduleName: string;
  modelName: string;
  tableName: string;
  routePath: string;
  permissionPrefix: string;
}

const BASE_FIELDS: ModuleModelFieldMeta[] = [
  {
    prop: 'id',
    label: 'ID',
    type: 'number',
    required: true,
    readonly: true,
    unique: true,
    description: '主键 ID',
  },
  {
    prop: 'createdAt',
    label: '创建时间',
    type: 'datetime',
    required: true,
    readonly: true,
  },
  {
    prop: 'updatedAt',
    label: '更新时间',
    type: 'datetime',
    required: true,
    readonly: true,
  },
  {
    prop: 'deletedAt',
    label: '删除时间',
    type: 'datetime',
    required: false,
    readonly: true,
    nullable: true,
  },
];

const withBaseFields = (
  fields: ModuleModelFieldMeta[],
): ModuleModelFieldMeta[] => [...BASE_FIELDS, ...fields];

export const MODULE_MODEL_MAP: Record<string, ModuleModelMeta> = {
  user: {
    moduleId: 'user',
    moduleName: '账号管理',
    modelName: 'User',
    tableName: 'users',
    routePath: '/users',
    permissionPrefix: 'User',
    fields: withBaseFields([
      {
        prop: 'username',
        label: '用户名',
        type: 'string',
        required: true,
        unique: true,
      },
      {
        prop: 'password',
        label: '密码',
        type: 'string',
        required: true,
        description: '默认不随查询返回',
      },
      {
        prop: 'nickname',
        label: '昵称',
        type: 'string',
        required: false,
        defaultValue: '',
      },
      {
        prop: 'isActive',
        label: '是否启用',
        type: 'boolean',
        required: false,
        defaultValue: true,
      },
      {
        prop: 'isAdmin',
        label: '是否超级管理员',
        type: 'boolean',
        required: false,
        defaultValue: false,
      },
      {
        prop: 'roles',
        label: '角色',
        type: 'relation',
        required: false,
        relation: {
          type: 'many-to-many',
          targetModuleId: 'role',
          targetModelName: 'Role',
        },
      },
    ]),
  },
  role: {
    moduleId: 'role',
    moduleName: '角色管理',
    modelName: 'Role',
    tableName: 'roles',
    routePath: '/roles',
    permissionPrefix: 'Role',
    fields: withBaseFields([
      {
        prop: 'code',
        label: '角色编码',
        type: 'string',
        required: true,
        unique: true,
      },
      {
        prop: 'name',
        label: '角色名称',
        type: 'string',
        required: true,
      },
      {
        prop: 'description',
        label: '描述',
        type: 'string',
        required: false,
        defaultValue: '',
      },
      {
        prop: 'isActive',
        label: '是否启用',
        type: 'boolean',
        required: false,
        defaultValue: true,
      },
      {
        prop: 'permissionCodes',
        label: '权限码集合',
        type: 'array',
        required: false,
        nullable: true,
      },
      {
        prop: 'permissions',
        label: '权限',
        type: 'relation',
        required: false,
        relation: {
          type: 'many-to-many',
          targetModuleId: 'permission',
          targetModelName: 'Permission',
        },
      },
    ]),
  },
  permission: {
    moduleId: 'permission',
    moduleName: '权限管理',
    modelName: 'Permission',
    tableName: 'permissions',
    routePath: '/permissions',
    permissionPrefix: 'Permission',
    fields: withBaseFields([
      {
        prop: 'code',
        label: '权限码',
        type: 'string',
        required: true,
        unique: true,
      },
      {
        prop: 'name',
        label: '权限名称',
        type: 'string',
        required: true,
      },
      {
        prop: 'type',
        label: '权限类型',
        type: 'enum',
        required: false,
        enumValues: ['menu', 'button', 'api'],
        defaultValue: 'api',
      },
      {
        prop: 'description',
        label: '描述',
        type: 'string',
        required: false,
        defaultValue: '',
      },
      {
        prop: 'menuId',
        label: '归属菜单 ID',
        type: 'number',
        required: false,
        nullable: true,
      },
      {
        prop: 'roles',
        label: '角色',
        type: 'relation',
        required: false,
        relation: {
          type: 'many-to-many',
          targetModuleId: 'role',
          targetModelName: 'Role',
        },
      },
    ]),
  },
  menu: {
    moduleId: 'menu',
    moduleName: '菜单管理',
    modelName: 'Menu',
    tableName: 'menus',
    routePath: '/menus',
    permissionPrefix: 'Menu',
    fields: withBaseFields([
      {
        prop: 'parentId',
        label: '父级菜单 ID',
        type: 'number',
        required: false,
        nullable: true,
      },
      {
        prop: 'name',
        label: '菜单名称',
        type: 'string',
        required: true,
      },
      {
        prop: 'path',
        label: '前端路由',
        type: 'string',
        required: false,
        defaultValue: '',
      },
      {
        prop: 'icon',
        label: '图标',
        type: 'string',
        required: false,
        defaultValue: '',
      },
      {
        prop: 'sort',
        label: '排序',
        type: 'number',
        required: false,
        defaultValue: 0,
      },
      {
        prop: 'type',
        label: '菜单类型',
        type: 'enum',
        required: false,
        enumValues: ['menu', 'button'],
        defaultValue: 'menu',
      },
      {
        prop: 'permissionCode',
        label: '关联权限码',
        type: 'string',
        required: false,
        defaultValue: '',
      },
      {
        prop: 'isSystem',
        label: '是否系统菜单',
        type: 'boolean',
        required: false,
        defaultValue: false,
      },
      {
        prop: 'isActive',
        label: '是否启用',
        type: 'boolean',
        required: false,
        defaultValue: true,
      },
    ]),
  },
  demo: {
    moduleId: 'demo',
    moduleName: '示例管理',
    modelName: 'Demo',
    tableName: 'demo',
    routePath: '/demo',
    permissionPrefix: 'Demo',
    fields: withBaseFields([
      {
        prop: 'title',
        label: '标题',
        type: 'string',
        required: true,
      },
      {
        prop: 'content',
        label: '内容',
        type: 'text',
        required: false,
        nullable: true,
      },
      {
        prop: 'category',
        label: '分类',
        type: 'enum',
        required: false,
        length: 20,
        enumValues: ['original', 'repost'],
        defaultValue: 'original',
      },
      {
        prop: 'status',
        label: '状态',
        type: 'enum',
        required: false,
        length: 20,
        enumValues: ['draft', 'published', 'archived'],
        defaultValue: 'draft',
      },
    ]),
  },
};
