import { scanLogApiModules } from '../log-records/log-api-scanner';

describe('热点模块日志路由归属', () => {
  it('分别识别选题和来源控制器，接口不串线或丢失', () => {
    const modules = scanLogApiModules();
    const topics = modules.find((module) => module.routePath === '/hot-topics');
    const sources = modules.find(
      (module) => module.routePath === '/hot-topic-sources',
    );
    expect(topics?.sourceFile).toBe('hot-topics/hot-topics.controller.ts');
    expect(sources?.sourceFile).toBe(
      'hot-topics/hot-topic-sources.controller.ts',
    );
    expect(topics?.actions).toHaveLength(12);
    expect(sources?.actions).toHaveLength(7);
    expect(
      topics?.actions.every(
        (action) =>
          action.path === '/hot-topics' ||
          action.path.startsWith('/hot-topics/'),
      ),
    ).toBe(true);
    expect(
      sources?.actions.every(
        (action) =>
          action.path === '/hot-topic-sources' ||
          action.path.startsWith('/hot-topic-sources/'),
      ),
    ).toBe(true);
    expect(
      sources?.actions.map((action) => `${action.method} ${action.path}`),
    ).toEqual(
      expect.arrayContaining([
        'GET /hot-topic-sources',
        'POST /hot-topic-sources',
        'PATCH /hot-topic-sources/:id',
        'DELETE /hot-topic-sources/:id',
      ]),
    );
    expect(
      topics?.actions.map((action) => `${action.method} ${action.path}`),
    ).not.toContain('POST /hot-topics');
    expect(
      sources?.actions.some((action) => action.path.includes('/runs')),
    ).toBe(false);
  });
});
