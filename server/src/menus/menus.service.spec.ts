import type { Repository } from 'typeorm';
import { Menu } from './entities/menu.entity';
import { MenusService } from './menus.service';

describe('MenusService Agent menu reconciliation', () => {
  let rows: Menu[];
  let nextId: number;
  let service: MenusService;

  const legacyMenus = [
    menu({
      id: 1,
      name: '聊天管理',
      path: '/chat-management',
      icon: 'ChatDotRound',
      sort: 75,
      permissionCode: 'Menu.read',
      isSystem: true,
    }),
    menu({
      id: 2,
      name: 'Agent 工作台',
      path: '/agent-workspace',
      icon: 'MagicStick',
      sort: 72,
      permissionCode: 'AgentWorkspace.read',
    }),
    menu({
      id: 3,
      parentId: 1,
      name: 'Agent 调试',
      path: '/chat-management/ai-chat',
      permissionCode: 'Menu.read',
      isSystem: true,
    }),
    menu({
      id: 4,
      parentId: 1,
      name: 'Agent 应用管理',
      path: '/chat-management/agent-apps',
      permissionCode: 'AgentApp.read',
      isSystem: true,
    }),
    menu({
      id: 5,
      parentId: 1,
      name: 'Agent 执行记录',
      path: '/chat-management/agent-executions',
      permissionCode: 'AgentApp.read',
      isSystem: true,
    }),
    menu({
      id: 6,
      parentId: 1,
      name: 'AI 指令集',
      path: '/chat-management/commands',
      permissionCode: 'AiCommandDefinition.read',
      isSystem: true,
    }),
    menu({
      id: 7,
      parentId: 1,
      name: 'AI 工作流',
      path: '/chat-management/workflows',
      permissionCode: 'AiWorkflow.read',
      isSystem: true,
    }),
  ];

  beforeEach(() => {
    rows = legacyMenus.map((item) => ({ ...item }));
    nextId = 100;
    const repository = {
      findOne: jest.fn(({ where }: { where: unknown }) => {
        const conditions = Array.isArray(where) ? where : [where];
        return Promise.resolve(
          rows.find((row) =>
            conditions.some((condition) =>
              Object.entries(condition as Record<string, unknown>).every(
                ([key, value]) => row[key as keyof Menu] === value,
              ),
            ),
          ) ?? null,
        );
      }),
      create: jest.fn((value: Partial<Menu>) => menu(value)),
      save: jest.fn((value: Menu) => {
        const saved = { ...value, id: value.id || nextId++ };
        const index = rows.findIndex((row) => row.id === saved.id);
        if (index >= 0) rows[index] = saved;
        else rows.push(saved);
        return Promise.resolve(saved);
      }),
      update: jest.fn((id: number, value: Partial<Menu>) => {
        const target = rows.find((row) => row.id === id);
        if (target) Object.assign(target, value);
        return Promise.resolve({ affected: target ? 1 : 0 });
      }),
      find: jest.fn(() =>
        Promise.resolve(
          [...rows].sort(
            (left, right) => left.sort - right.sort || left.id - right.id,
          ),
        ),
      ),
    };
    service = new MenusService(repository as unknown as Repository<Menu>);
  });

  it('moves every legacy Agent menu under the independent Agent management root', async () => {
    await service.onModuleInit();

    const root = rows.find((item) => item.path === '/agent-management');
    expect(root).toEqual(
      expect.objectContaining({
        name: 'Agent 管理',
        isSystem: false,
        permissionCode: 'AgentWorkspace.read',
      }),
    );

    expect(
      rows
        .filter((item) => item.parentId === root!.id)
        .map((item) => item.path)
        .sort(),
    ).toEqual(
      [
        '/agent-management/apps',
        '/agent-management/debug',
        '/agent-management/executions',
        '/agent-management/workspace',
      ].sort(),
    );

    const chat = rows.find((item) => item.path === '/chat-management')!;
    const chatChildren = rows.filter((item) => item.parentId === chat.id);
    expect(chatChildren.some((item) => item.name.includes('Agent'))).toBe(
      false,
    );
    expect(
      chatChildren.some((item) =>
        ['AI 指令集', 'AI 工作流'].includes(item.name),
      ),
    ).toBe(false);
  });

  it('shows only the Agent workspace child to ordinary authorized employees', async () => {
    await service.onModuleInit();

    const tree = await service.findMine(false, ['AgentWorkspace.read']);
    const root = tree.find((item) => item.path === '/agent-management');

    expect(root).toBeDefined();
    expect(root!.children.map((item) => item.path)).toEqual([
      '/agent-management/workspace',
    ]);
  });

  it('seeds a single assignable content menu and requires its own read permission', async () => {
    await service.onModuleInit();
    await service.onModuleInit();
    const entries = rows.filter((item) => item.path === '/content-articles');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: '文章创作',
      permissionCode: 'ContentArticle.read',
      isSystem: false,
    });
    const authorized = await service.findMine(false, ['ContentArticle.read']);
    const records = rows.filter((item) => item.path === '/content-generation');
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      name: '生成记录',
      permissionCode: 'ContentArticle.read',
      isSystem: false,
    });
    expect(
      authorized
        .flatMap((item) => item.children)
        .some((item) => item.path === '/content-generation'),
    ).toBe(true);
    expect(
      authorized
        .flatMap((item) => item.children)
        .some((item) => item.path === '/content-articles'),
    ).toBe(true);
    const unauthorized = await service.findMine(false, [
      'AgentWorkspace.read',
      'Menu.read',
    ]);
    expect(
      unauthorized
        .flatMap((item) => item.children)
        .some((item) => item.path === '/content-generation'),
    ).toBe(false);
    expect(
      unauthorized
        .flatMap((item) => item.children)
        .some((item) => item.path === '/content-articles'),
    ).toBe(false);
  });

  it('uses concise ComfyUI child names and retires the duplicate task-record menu', async () => {
    rows.push(
      menu({
        id: 20,
        name: 'ComfyUI 生成记录',
        path: '/comfyui/tasks',
        permissionCode: 'ComfyTask.read',
      }),
    );
    await service.onModuleInit();

    const retired = rows.find((item) => item.path === '/comfyui/tasks');
    expect(retired).toMatchObject({ id: 20, isActive: false });
    const tree = await service.findMine(false, [
      'ComfyTask.read',
      'ComfyMaterial.read',
      'ComfyWorkflow.read',
    ]);
    const root = tree.find((item) => item.path === '/comfyui');
    expect(root?.children.map(({ name, path }) => ({ name, path }))).toEqual([
      { name: '创作任务', path: '/comfyui/create' },
      { name: '素材库管理', path: '/comfyui/materials' },
      { name: '工作流管理', path: '/comfyui/workflows' },
    ]);
  });

  it('AI 配置收敛为单一菜单并停用历史子菜单', async () => {
    rows.push(
      menu({
        id: 8,
        name: 'AI 功能配置',
        path: '/chat-management/ai-configs',
        isSystem: true,
        isActive: false,
      }),
    );
    rows.push(
      menu({
        id: 9,
        name: '内容创作',
        path: '/content-articles',
        isSystem: false,
      }),
    );
    rows.find((row) => row.id === 6)!.isSystem = false;
    await service.onModuleInit();
    const count = rows.length;
    await service.onModuleInit();
    expect(rows).toHaveLength(count);
    const root = rows.find((row) => row.path === '/ai-config')!;
    expect(root.id).not.toBe(8);
    expect(rows.find((row) => row.id === 8)).toMatchObject({
      path: '/ai-config/features',
      parentId: root.id,
      isSystem: true,
      isActive: false,
    });
    expect(rows.find((row) => row.id === 6)).toMatchObject({
      path: '/ai-config/commands',
      parentId: root.id,
      isSystem: false,
      isActive: false,
    });
    expect(rows.find((row) => row.id === 7)).toMatchObject({
      path: '/ai-config/workflows',
      parentId: root.id,
      isActive: false,
    });
    expect(rows.find((row) => row.id === 9)).toMatchObject({
      path: '/content-articles',
      name: '文章创作',
    });
    const tree = await service.findMine(false, ['AiCommandDefinition.read']);
    expect(tree.find((row) => row.path === '/ai-config')).toMatchObject({
      children: [],
    });
  });

  it('reconciles debug to AgentApp.read with a stable id and the existing admin-only default', async () => {
    await service.onModuleInit();
    await service.onModuleInit();
    const debug = rows.find((item) => item.path === '/agent-management/debug')!;
    expect(debug).toMatchObject({
      id: 3,
      permissionCode: 'AgentApp.read',
      isSystem: true,
    });
    const menuOnly = await service.findMine(false, [
      'Menu.read',
      'AgentWorkspace.read',
    ]);
    expect(
      menuOnly
        .flatMap((item) => item.children)
        .some((item) => item.id === debug.id),
    ).toBe(false);
    // 默认仍为超管菜单；管理员主动允许角色分配后按新的读取权限过滤。
    debug.isSystem = false;
    const agentManager = await service.findMine(false, [
      'AgentApp.read',
      'AgentWorkspace.read',
    ]);
    expect(
      agentManager
        .flatMap((item) => item.children)
        .some((item) => item.id === debug.id),
    ).toBe(true);
  });
});

function menu(value: Partial<Menu>): Menu {
  return {
    id: 0,
    parentId: null,
    name: '',
    path: '',
    icon: '',
    sort: 0,
    type: 'menu',
    permissionCode: '',
    isSystem: false,
    isActive: true,
    createdAt: new Date('2026-10-15T00:00:00.000Z'),
    updatedAt: new Date('2026-10-15T00:00:00.000Z'),
    deletedAt: null,
    ...value,
  };
}
