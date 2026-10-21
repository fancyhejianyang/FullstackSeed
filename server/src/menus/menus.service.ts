import {
  Injectable,
  OnModuleInit,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Menu } from './entities/menu.entity';
import { CreateMenuDto, UpdateMenuDto } from './dto/menu.dto';
import { reorganizeSystemMenus } from './menu-structure';

// 菜单树节点（实体 + children）
export interface MenuTreeNode extends Menu {
  children: MenuTreeNode[];
}

type SeedMenu = Partial<Menu> & {
  parentPath?: string;
  legacyPaths?: string[];
  reconcile?: boolean;
  preserveVisibility?: boolean;
  retired?: boolean;
  matchByName?: boolean;
};

// 内置菜单种子（path 对应前端路由）
// isSystem=true 为系统固定菜单：仅超管可见、不可分配给角色；业务菜单 isSystem=false 可分配。
const BASE_SEED_MENUS: SeedMenu[] = [
  {
    name: 'AI 功能配置',
    path: '/ai-config',
    icon: 'Cpu',
    sort: 74,
    permissionCode: 'Menu.read,AiCommandDefinition.read,AiWorkflow.read',
    isSystem: false,
    reconcile: true,
    preserveVisibility: true,
    matchByName: false,
  },
  {
    name: '内容创作',
    path: '/content-creation',
    icon: 'EditPen',
    sort: 73,
    permissionCode:
      'ContentArticle.read,ContentTemplate.read,AiMaterial.read,HotTopic.read',
    isSystem: false,
    reconcile: true,
    preserveVisibility: true,
    matchByName: false,
  },
  {
    name: 'ComfyUI',
    path: '/comfyui',
    icon: 'MagicStick',
    sort: 71,
    permissionCode:
      'ComfyWorkflow.read,ComfyMaterial.read,ComfyTask.read,VisualPromptTemplate.read',
    isSystem: false,
    reconcile: true,
    preserveVisibility: true,
    matchByName: false,
  },
  {
    name: '写作模板',
    path: '/content-templates',
    icon: '',
    sort: 20,
    permissionCode: 'ContentTemplate.read',
    isSystem: false,
    parentPath: '/content-creation',
    reconcile: true,
    preserveVisibility: true,
  },
  {
    name: '热点选题',
    path: '/hot-topics',
    icon: '',
    sort: 5,
    permissionCode: 'HotTopic.read',
    isSystem: false,
    parentPath: '/content-creation',
    reconcile: true,
    preserveVisibility: true,
  },
  {
    name: '热点来源',
    path: '/third-party-config/hot-topics',
    icon: '',
    sort: 8,
    permissionCode: 'HotTopicSource.read',
    isSystem: false,
    parentPath: '/third-party-config',
    reconcile: true,
    preserveVisibility: true,
  },
  {
    name: '文章创作',
    path: '/content-articles',
    icon: '',
    sort: 10,
    permissionCode: 'ContentArticle.read',
    isSystem: false,
    parentPath: '/content-creation',
    reconcile: true,
    preserveVisibility: true,
  },
  {
    name: '生成记录',
    path: '/content-generation',
    icon: '',
    sort: 30,
    permissionCode: 'ContentArticle.read',
    isSystem: false,
    parentPath: '/content-creation',
    reconcile: true,
    preserveVisibility: true,
    matchByName: false,
  },
  {
    name: '素材管理',
    path: '/ai-materials',
    icon: '',
    sort: 40,
    permissionCode: 'AiMaterial.read',
    isSystem: false,
    parentPath: '/content-creation',
    reconcile: true,
    preserveVisibility: true,
  },
  {
    name: '模型提示词规范',
    path: '/visual-prompt-templates',
    icon: '',
    sort: 40,
    permissionCode: 'VisualPromptTemplate.read',
    isSystem: false,
    parentPath: '/comfyui',
    reconcile: true,
    preserveVisibility: true,
  },
  {
    name: '创作任务',
    path: '/comfyui/create',
    icon: '',
    sort: 10,
    permissionCode: 'ComfyTask.read',
    isSystem: false,
    parentPath: '/comfyui',
    reconcile: true,
    preserveVisibility: true,
  },
  {
    name: '素材库管理',
    path: '/comfyui/materials',
    icon: '',
    sort: 20,
    permissionCode: 'ComfyMaterial.read',
    isSystem: false,
    parentPath: '/comfyui',
    reconcile: true,
    preserveVisibility: true,
  },
  {
    name: '工作流管理',
    path: '/comfyui/workflows',
    icon: '',
    sort: 30,
    permissionCode: 'ComfyWorkflow.read',
    isSystem: false,
    isActive: true,
    parentPath: '/comfyui',
    reconcile: true,
  },
  {
    name: 'ComfyUI 生成记录',
    path: '/comfyui/tasks',
    icon: '',
    sort: 40,
    permissionCode: 'ComfyTask.read',
    isSystem: false,
    parentPath: '/comfyui',
    reconcile: true,
    preserveVisibility: true,
    retired: true,
  },
  {
    name: 'Agent 管理',
    path: '/agent-management',
    icon: 'MagicStick',
    sort: 72,
    permissionCode: 'AgentWorkspace.read',
    isSystem: false,
    reconcile: true,
  },
  {
    name: 'Agent 工作台',
    path: '/agent-management/workspace',
    icon: '',
    sort: 10,
    permissionCode: 'AgentWorkspace.read',
    isSystem: false,
    parentPath: '/agent-management',
    legacyPaths: ['/agent-workspace'],
    reconcile: true,
  },
  {
    name: '客服工作台',
    path: '/customer-service',
    icon: 'Service',
    sort: 74,
    permissionCode: 'CustomerService.read',
    isSystem: false,
  },
  {
    name: '首页',
    path: '/',
    icon: 'HomeFilled',
    sort: 0,
    permissionCode: '',
    isSystem: false,
  },
  {
    name: '示例管理',
    path: '/demo',
    icon: 'Document',
    sort: 10,
    permissionCode: 'Demo.read',
    isSystem: false,
  },
  {
    name: '知识库管理',
    path: '/knowledge-bases',
    icon: 'Collection',
    sort: 20,
    permissionCode: 'KnowledgeBase.read',
    isSystem: false,
  },
  {
    name: '知识库分类',
    path: '/knowledge-bases/categories',
    icon: 'FolderOpened',
    sort: 10,
    permissionCode: 'KnowledgeBase.read',
    isSystem: false,
    parentPath: '/knowledge-bases',
  },
  {
    name: '知识库列表',
    path: '/knowledge-bases/list',
    icon: 'Tickets',
    sort: 20,
    permissionCode: 'KnowledgeBase.read',
    isSystem: false,
    parentPath: '/knowledge-bases',
  },
  {
    name: '分片配置',
    path: '/knowledge-bases/chunk-configs',
    icon: '',
    sort: 30,
    permissionCode: 'KnowledgeBase.read',
    isSystem: false,
    parentPath: '/knowledge-bases',
  },
  {
    name: '账号管理',
    path: '/users',
    icon: 'User',
    sort: 30,
    permissionCode: 'User.read',
    isSystem: true,
  },
  {
    name: '角色管理',
    path: '/roles',
    icon: 'UserFilled',
    sort: 40,
    permissionCode: 'Role.read',
    isSystem: true,
  },
  {
    name: '权限管理',
    path: '/permissions',
    icon: 'Key',
    sort: 50,
    permissionCode: 'Permission.read',
    isSystem: true,
  },
  {
    name: '菜单管理',
    path: '/menus',
    icon: 'Menu',
    sort: 60,
    permissionCode: 'Menu.read',
    isSystem: true,
  },
  {
    name: '系统配置',
    path: '/system-config',
    icon: 'Setting',
    sort: 70,
    permissionCode: 'Menu.read',
    isSystem: true,
  },
  {
    name: '聊天管理',
    path: '/chat-management',
    icon: 'ChatDotRound',
    sort: 75,
    permissionCode: 'Menu.read',
    isSystem: true,
  },
  {
    name: '业务数据',
    path: '/business-data',
    icon: 'Goods',
    sort: 76,
    permissionCode: 'Product.read',
    isSystem: true,
  },
  {
    name: '协作中心',
    path: '/collaboration-center',
    icon: 'Connection',
    sort: 78,
    permissionCode: 'ApprovalRequest.read',
    isSystem: true,
  },
  {
    name: '审批管理',
    path: '/collaboration-center/approvals',
    icon: '',
    sort: 10,
    permissionCode: 'ApprovalRequest.read',
    isSystem: true,
    parentPath: '/collaboration-center',
  },
  {
    name: '配置菜单',
    path: '/system-config/menu',
    icon: 'Operation',
    sort: 10,
    permissionCode: 'Menu.read',
    isSystem: true,
    parentPath: '/system-config',
  },
  {
    name: 'AI 大模型账号',
    path: '/system-config/ai',
    icon: 'Connection',
    sort: 20,
    permissionCode: 'Menu.read',
    isSystem: true,
    parentPath: '/system-config',
  },
  {
    name: 'Agent 调试',
    path: '/agent-management/debug',
    icon: '',
    sort: 40,
    permissionCode: 'AgentApp.read',
    isSystem: true,
    parentPath: '/agent-management',
    legacyPaths: ['/chat-management/ai-chat'],
    reconcile: true,
  },
  {
    name: 'Agent 应用管理',
    path: '/agent-management/apps',
    icon: '',
    sort: 20,
    permissionCode: 'AgentApp.read',
    isSystem: true,
    parentPath: '/agent-management',
    legacyPaths: ['/chat-management/agent-apps'],
    reconcile: true,
  },
  {
    name: 'Agent 执行记录',
    path: '/agent-management/executions',
    icon: '',
    sort: 30,
    permissionCode: 'AgentApp.read',
    isSystem: true,
    parentPath: '/agent-management',
    legacyPaths: ['/chat-management/agent-executions'],
    reconcile: true,
  },
  {
    name: '产品库',
    path: '/business-data/products',
    icon: '',
    sort: 10,
    permissionCode: 'Product.read',
    isSystem: true,
    parentPath: '/business-data',
  },
  {
    name: 'SKU 库',
    path: '/business-data/product-skus',
    icon: '',
    sort: 20,
    permissionCode: 'ProductSku.read',
    isSystem: true,
    parentPath: '/business-data',
  },
  {
    name: '聊天应用',
    path: '/chat-management/apps',
    icon: '',
    sort: 20,
    permissionCode: 'Menu.read',
    isSystem: true,
    parentPath: '/chat-management',
  },
  {
    name: '功能配置',
    path: '/ai-config/features',
    icon: '',
    sort: 10,
    permissionCode: 'Menu.read',
    isSystem: true,
    parentPath: '/ai-config',
    legacyPaths: ['/chat-management/ai-configs'],
    reconcile: true,
    preserveVisibility: true,
    retired: true,
  },
  {
    name: 'AI 指令集',
    path: '/ai-config/commands',
    icon: '',
    sort: 50,
    permissionCode: 'AiCommandDefinition.read',
    isSystem: true,
    parentPath: '/ai-config',
    legacyPaths: ['/agent-management/commands', '/chat-management/commands'],
    reconcile: true,
    preserveVisibility: true,
    retired: true,
  },
  {
    name: '知识库检索配置',
    path: '/chat-management/retrieval-configs',
    icon: '',
    sort: 35,
    permissionCode: 'Menu.read',
    isSystem: true,
    parentPath: '/chat-management',
  },
  {
    name: 'AI 工作流',
    path: '/ai-config/workflows',
    icon: '',
    sort: 60,
    permissionCode: 'AiWorkflow.read',
    isSystem: true,
    parentPath: '/ai-config',
    legacyPaths: ['/agent-management/workflows', '/chat-management/workflows'],
    reconcile: true,
    preserveVisibility: true,
    retired: true,
  },
  {
    name: '知识库路由规则',
    path: '/chat-management/routing-rules',
    icon: '',
    sort: 36,
    permissionCode: 'KnowledgeRoutingRule.read',
    isSystem: true,
    parentPath: '/chat-management',
  },
  {
    name: '标准问答库',
    path: '/chat-management/standard-qas',
    icon: '',
    sort: 37,
    permissionCode: 'KnowledgeStandardQa.read',
    isSystem: true,
    parentPath: '/chat-management',
  },
  {
    name: '口语化表达词库',
    path: '/chat-management/colloquial-terms',
    icon: '',
    sort: 38,
    permissionCode: 'KnowledgeColloquialTerm.read',
    isSystem: true,
    parentPath: '/chat-management',
  },
  {
    name: '问题记录',
    path: '/chat-management/records',
    icon: '',
    sort: 40,
    permissionCode: 'Menu.read',
    isSystem: true,
    parentPath: '/chat-management',
  },
  {
    name: '微信 / 小程序',
    path: '/system-config/wechat',
    icon: 'ChatDotRound',
    sort: 50,
    permissionCode: 'Menu.read',
    isSystem: true,
    parentPath: '/system-config',
  },
  {
    name: '日志记录',
    path: '/system-config/log-record',
    icon: 'Tickets',
    sort: 60,
    permissionCode: 'Menu.read',
    isSystem: true,
    parentPath: '/system-config',
  },
  {
    name: '数据导入',
    path: '/system-config/data-import',
    icon: 'UploadFilled',
    sort: 70,
    permissionCode: 'Menu.read',
    isSystem: true,
    parentPath: '/system-config',
  },
  {
    name: 'OSS/CDN 配置',
    path: '/system-config/storage',
    icon: 'FolderOpened',
    sort: 80,
    permissionCode: 'Menu.read',
    isSystem: true,
    parentPath: '/system-config',
  },
  {
    name: 'MinerU 引擎配置',
    path: '/system-config/mineru',
    icon: 'DocumentChecked',
    sort: 90,
    permissionCode: 'Menu.read',
    isSystem: true,
    parentPath: '/system-config',
  },
  {
    name: '向量化配置',
    path: '/system-config/vector',
    icon: '',
    sort: 100,
    permissionCode: 'Menu.read',
    isSystem: true,
    parentPath: '/system-config',
  },
  {
    name: 'ComfyUI 服务',
    path: '/system-config/comfyui',
    icon: '',
    sort: 105,
    permissionCode: 'ComfyConnection.read',
    isSystem: false,
    parentPath: '/system-config',
  },
  {
    name: '文档上传拆分规则',
    path: '/system-config/document-parse',
    icon: '',
    sort: 110,
    permissionCode: 'Menu.read',
    isSystem: true,
    parentPath: '/system-config',
  },
];

const SEED_MENUS = reorganizeSystemMenus(BASE_SEED_MENUS);

// 锁定菜单路径：前端不限制操作，后端 API 对此类菜单统一做管理员身份校验
const PROTECTED_MENU_PATHS = [
  '/ai-config',
  '/content-creation',
  '/comfyui',
  '/menus',
  '/system-config',
  '/access-control',
  '/third-party-config',
  '/agent-management',
  '/chat-management',
];

@Injectable()
export class MenusService implements OnModuleInit {
  constructor(
    @InjectRepository(Menu)
    private readonly menuRepository: Repository<Menu>,
  ) {}

  /**
   * 启动时补齐缺失的内置菜单。
   * 普通种子仍保持“只补不改”；reconcile 种子用于受控迁移系统菜单的
   * 路径和父级，确保历史环境也能获得最新的固定菜单结构。
   */
  async onModuleInit() {
    for (const seed of SEED_MENUS) {
      const {
        parentPath,
        legacyPaths = [],
        reconcile = false,
        preserveVisibility = false,
        retired = false,
        matchByName = true,
        ...menuSeed
      } = seed;
      const parent = parentPath
        ? await this.menuRepository.findOne({
            where: { path: parentPath },
          })
        : null;
      let exist = menuSeed.path
        ? await this.menuRepository.findOne({
            where: { path: menuSeed.path },
          })
        : null;
      if (!exist && legacyPaths.length) {
        exist = await this.menuRepository.findOne({
          where: legacyPaths.map((path) => ({ path })),
        });
      }
      if (!exist && matchByName && menuSeed.name) {
        exist = await this.menuRepository.findOne({
          where: { name: menuSeed.name },
        });
      }
      if (exist) {
        if (reconcile) {
          await this.menuRepository.update(exist.id, {
            ...menuSeed,
            ...(preserveVisibility
              ? { isSystem: exist.isSystem, isActive: exist.isActive }
              : {}),
            ...(retired ? { isActive: false } : {}),
            parentId: parent?.id ?? menuSeed.parentId ?? null,
          });
          continue;
        }
        if (
          menuSeed.path === '/chat-management/retrieval-configs' &&
          exist.name === 'AI 工作流配置'
        ) {
          await this.menuRepository.update(exist.id, {
            name: '知识库检索配置',
          });
        }
        continue;
      }

      // 合并入口只停用旧记录以保留 ID；新环境不再创建重复入口。
      if (retired) continue;
      await this.menuRepository.save(
        this.menuRepository.create({
          ...menuSeed,
          parentId: parent?.id ?? menuSeed.parentId ?? null,
        }),
      );
    }
  }

  /** 全部菜单（扁平，按 sort 升序） */
  private findAllFlat(): Promise<Menu[]> {
    return this.menuRepository.find({ order: { sort: 'ASC', id: 'ASC' } });
  }

  /** 扁平列表构建成树 */
  private buildTree(list: Menu[]): MenuTreeNode[] {
    const map = new Map<number, MenuTreeNode>();
    const roots: MenuTreeNode[] = [];
    list.forEach((m) => map.set(m.id, { ...m, children: [] }));
    map.forEach((node) => {
      if (node.parentId && map.has(node.parentId)) {
        map.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }

  /** 完整菜单树（管理用） */
  async findTree(): Promise<MenuTreeNode[]> {
    return this.buildTree(await this.findAllFlat());
  }

  private splitPermissionCodes(code: string | undefined | null): string[] {
    if (!code) return [];
    return code
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  /**
   * 当前用户可见菜单树：
   * - 超管返回全部启用菜单
   * - 系统固定菜单（isSystem）仅超管可见
   * - 否则过滤掉 permissionCode 非空且用户无任一权限的项
   */
  async findMine(
    isAdmin: boolean,
    permissions: string[],
  ): Promise<MenuTreeNode[]> {
    const all = await this.findAllFlat();
    const visible = all.filter((m) => {
      if (!m.isActive) return false;
      if (isAdmin) return true;
      if (m.isSystem) return false;
      const codes = this.splitPermissionCodes(m.permissionCode);
      if (codes.length === 0) return true;
      return codes.some((code) => permissions.includes(code));
    });
    return this.buildTree(visible).filter(
      (node) =>
        ![
          '/system-config',
          '/access-control',
          '/third-party-config',
          '/content-creation',
          '/comfyui',
        ].includes(node.path) || node.children.length > 0,
    );
  }

  findOne(id: number) {
    return this.menuRepository.findOne({ where: { id } });
  }

  private isLockedMenu(menu: Pick<Menu, 'path' | 'isSystem'>): boolean {
    return (
      menu.isSystem || (!!menu.path && PROTECTED_MENU_PATHS.includes(menu.path))
    );
  }

  private isLockedPath(path: string | undefined): boolean {
    return (
      !!path &&
      PROTECTED_MENU_PATHS.some(
        (protectedPath) =>
          path === protectedPath || path.startsWith(`${protectedPath}/`),
      )
    );
  }

  private assertAdminForLockedMenu(isAdmin: boolean, locked: boolean) {
    if (!isAdmin && locked) {
      throw new ForbiddenException('锁定菜单仅管理员可操作');
    }
  }

  private async assertCreateOrMoveAllowed(
    dto: Pick<CreateMenuDto, 'parentId' | 'path' | 'isSystem'>,
    isAdmin: boolean,
  ) {
    this.assertAdminForLockedMenu(
      isAdmin,
      !!dto.isSystem || this.isLockedPath(dto.path),
    );
    if (!dto.parentId) return;

    const parent = await this.menuRepository.findOne({
      where: { id: dto.parentId },
    });
    if (!parent) {
      throw new NotFoundException('上级菜单不存在');
    }
    this.assertAdminForLockedMenu(isAdmin, this.isLockedMenu(parent));
  }

  private collectDescendantIds(list: Menu[], parentId: number): number[] {
    const childrenMap = new Map<number, Menu[]>();
    list.forEach((item) => {
      if (!item.parentId) return;
      const children = childrenMap.get(item.parentId) ?? [];
      children.push(item);
      childrenMap.set(item.parentId, children);
    });

    const ids: number[] = [];
    const stack = [...(childrenMap.get(parentId) ?? [])];
    while (stack.length) {
      const current = stack.pop()!;
      ids.push(current.id);
      stack.push(...(childrenMap.get(current.id) ?? []));
    }
    return ids;
  }

  async create(dto: CreateMenuDto, isAdmin: boolean) {
    await this.assertCreateOrMoveAllowed(dto, isAdmin);
    return this.menuRepository.save(this.menuRepository.create(dto));
  }

  async update(id: number, dto: UpdateMenuDto, isAdmin: boolean) {
    const menu = await this.menuRepository.findOne({ where: { id } });
    if (!menu) {
      throw new NotFoundException('菜单不存在');
    }
    this.assertAdminForLockedMenu(
      isAdmin,
      this.isLockedMenu(menu) ||
        dto.isSystem === true ||
        this.isLockedPath(dto.path),
    );
    if (dto.parentId !== undefined) {
      await this.assertCreateOrMoveAllowed(dto, isAdmin);
    }
    Object.assign(menu, dto);
    return this.menuRepository.save(menu);
  }

  async remove(id: number, isAdmin: boolean) {
    const menu = await this.menuRepository.findOne({ where: { id } });
    if (!menu) {
      throw new NotFoundException('菜单不存在');
    }
    this.assertAdminForLockedMenu(isAdmin, this.isLockedMenu(menu));
    const descendants = this.collectDescendantIds(await this.findAllFlat(), id);
    const ids = [id, ...descendants];
    await this.menuRepository.softDelete(ids);
    return { id, ids };
  }
}
