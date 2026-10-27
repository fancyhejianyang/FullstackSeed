/* eslint-disable @typescript-eslint/unbound-method -- 仅读取方法上的权限元数据，不直接调用 controller 方法。 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  getRegisteredPermissionCodes,
} from './permission-catalog';
import { PERMISSIONS_KEY } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { ContentArticlesController } from '../content-articles/content-articles.controller';
import { AiMaterialsController } from '../ai-materials/ai-materials.controller';
import { VisualPromptTemplatesController } from '../visual-prompt-templates/visual-prompt-templates.controller';
import { ComfyTasksController } from '../comfyui/comfy-tasks.controller';
import { ComfyWorkflowsController } from '../comfyui/comfy-workflows.controller';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { AGENT_BUSINESS_TOOLS } from '../agent-apps/agent-business.registry';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFiles(join(dir, entry.name))
      : [join(dir, entry.name)],
  );
}

describe('实际模块权限目录', () => {
  it('覆盖所有接口字面量声明，不产生重复或未定义动作', () => {
    const codes = getRegisteredPermissionCodes();
    expect(new Set(codes).size).toBe(codes.length);
    const actions = new Set<string>(
      PERMISSION_ACTIONS.map((action) => action.code),
    );
    for (const module of PERMISSION_MODULES)
      for (const action of module.actions)
        expect(actions.has(action)).toBe(true);
    for (const file of sourceFiles(join(__dirname, '..')).filter((file) =>
      file.endsWith('.controller.ts'),
    )) {
      for (const declaration of readFileSync(file, 'utf8').matchAll(
        /@RequirePermissions\(([\s\S]*?)\)/g,
      ))
        for (const code of declaration[1].matchAll(/['"]([A-Z]\w*\.\w+)['"]/g))
          expect(codes).toContain(code[1]);
    }
    expect(codes).not.toContain('AgentWorkspace.delete');
    expect(codes).not.toContain('User.aiRefine');
    expect(codes).toContain('WechatConfig.read');
  });

  const cases = [
    [
      ContentArticlesController.prototype.regenerate,
      ['ContentArticle.aiGenerate'],
      ['ContentArticle.update'],
    ],
    [
      AiMaterialsController.prototype.generate,
      ['AiMaterial.aiGenerate'],
      ['AiMaterial.update'],
    ],
    [
      VisualPromptTemplatesController.prototype.extract,
      ['VisualPromptTemplate.aiRefine'],
      ['VisualPromptTemplate.update'],
    ],
    [
      VisualPromptTemplatesController.prototype.compose,
      ['VisualPromptTemplate.read', 'VisualPromptTemplate.aiGenerate'],
      ['VisualPromptTemplate.read'],
    ],
    [
      ComfyTasksController.prototype.create,
      ['ComfyTask.create', 'ComfyTask.aiGenerate'],
      ['ComfyTask.create'],
    ],
    [
      ComfyTasksController.prototype.retry,
      ['ComfyTask.create', 'ComfyTask.aiGenerate'],
      ['ComfyTask.create'],
    ],
    [
      ComfyWorkflowsController.prototype.composePrompt,
      ['ComfyTask.create', 'ComfyTask.aiGenerate'],
      ['ComfyTask.create'],
    ],
  ] as const;
  it.each(cases)('AI 入口独立校验授权（%#）', (handler, required, legacy) => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(required);
    const guard = new PermissionsGuard(new Reflector());
    const context = (permissions: readonly string[], isAdmin = false) =>
      ({
        getHandler: () => handler,
        getClass: () => ContentArticlesController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { permissions, isAdmin } }),
        }),
      }) as unknown as ExecutionContext;
    expect(() => guard.canActivate(context(legacy))).toThrow(
      ForbiddenException,
    );
    expect(guard.canActivate(context(required))).toBe(true);
    expect(guard.canActivate(context([], true))).toBe(true);
  });

  it('Agent 文章生成同样需要新增权限', () => {
    expect(
      AGENT_BUSINESS_TOOLS.find(
        (tool) => tool.commandKey === 'contentArticle.generate',
      )?.extraPermissions,
    ).toEqual(['ContentArticle.aiGenerate']);
  });

  it('角色目录无需额外的权限定义/菜单管理读取权限，动作名称取定义并兜底', async () => {
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        PermissionsController.prototype.catalog,
      ),
    ).toEqual(['Role.read']);
    const service = new PermissionsService(
      {
        find: jest
          .fn()
          .mockResolvedValue([{ code: 'aiGenerate', name: '智能生成' }]),
      } as never,
      { findTree: jest.fn().mockResolvedValue([{ id: 1 }]) } as never,
    );
    const catalog = await service.catalog();
    expect(catalog.menus).toEqual([{ id: 1 }]);
    expect(
      catalog.modules.find((module) => module.code === 'ContentArticle')
        ?.actions,
    ).toEqual(
      expect.arrayContaining([
        { code: 'aiGenerate', name: '智能生成' },
        { code: 'read', name: '查看' },
      ]),
    );
  });
});
