import { scanLogApiModules } from './log-api-scanner';

describe('scanLogApiModules', () => {
  it('扫描后的 HTTP 方法与完整路径保持唯一', () => {
    const keys = scanLogApiModules().flatMap((module) =>
      module.actions.map((action) => `${action.method} ${action.path}`),
    );
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);

    expect(duplicates).toEqual([]);
  });

  it('分别识别素材接口与素材生成任务接口', () => {
    const modules = scanLogApiModules();
    const material = modules.find(
      (module) => module.routePath === '/ai-materials',
    );
    const tasks = modules.find(
      (module) => module.routePath === '/material-generation-tasks',
    );

    expect(material?.actions.map((action) => action.path)).toContain(
      '/ai-materials',
    );
    expect(tasks?.actions.map((action) => action.path)).toEqual(
      expect.arrayContaining([
        '/material-generation-tasks',
        '/material-generation-tasks/:id',
      ]),
    );
  });

  it('不把控制器注释中的装饰器示例识别为接口', () => {
    const actions = scanLogApiModules().flatMap((module) => module.actions);
    const details = actions.filter(
      (action) =>
        action.method === 'GET' && action.path === '/knowledge-bases/:id',
    );

    expect(details).toHaveLength(1);
    expect(details[0].label).toBe('知识库详情');
  });
});
