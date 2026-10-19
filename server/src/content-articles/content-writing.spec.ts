import {
  buildContentWritingPrompt,
  parseContentWritingResponse,
} from './content-writing';
import type { ContentGenerationSnapshot } from './entities/content-generation-task.entity';
import { AddContentEditorNotes1792378800000 } from '../migrations/1792378800000-AddContentEditorNotes';

describe('文章成稿协议', () => {
  const snapshot = {
    config: { systemPrompt: '默认口吻', responseFormat: 'text' },
    template: { instruction: '用 Markdown 写一篇评论' },
  } as ContentGenerationSnapshot;
  it('最终格式约束独立于模板；旧快照仍按 Markdown', () => {
    const prompt = buildContentWritingPrompt(snapshot);
    expect(prompt).toContain('替作者成稿');
    expect(prompt).toContain('不写“作者认为”');
    expect(prompt).toContain('未执行新闻检索');
    expect(prompt).toContain('不冒充已经独立核实');
    expect(prompt).toContain('普通随笔');
    expect(prompt).toContain('notes');
    expect(prompt.lastIndexOf('body 使用纯文本')).toBeGreaterThan(
      prompt.indexOf('用 Markdown 写一篇评论'),
    );
    expect(
      buildContentWritingPrompt({
        ...snapshot,
        config: { ...snapshot.config, responseFormat: 'markdown' },
      }),
    ).toContain('body 使用 Markdown');
    expect(
      buildContentWritingPrompt({
        ...snapshot,
        config: { ...snapshot.config, responseFormat: undefined },
      }),
    ).toContain('body 使用 Markdown');
  });
  it('取消新闻素材门槛，默认成稿，不由身份自动附加审核流程', () => {
    const preferences = {
      ...snapshot,
      config: { ...snapshot.config, systemPrompt: '你是一名新闻工作者' },
      template: { id: 8, name: '评论', instruction: '表达我的观点，简短有力' },
    };
    const before = JSON.stringify(preferences);
    const prompt = buildContentWritingPrompt(preferences);
    expect(prompt).toContain('你是一名新闻工作者');
    expect(prompt).toContain('表达我的观点，简短有力');
    expect(prompt).toContain(
      '身份称谓（如新闻工作者）不自动附加采访、核验或审核流程',
    );
    expect(prompt).toContain(
      '默认直接输出 draft 正文，不设置新闻类素材审核门槛',
    );
    expect(prompt).toContain('不输出核查清单');
    expect(prompt).toContain('完全无法理解写作主题');
    expect(prompt).toContain('不编造事实、来源、引语或现场细节');
    expect(prompt).toContain('不在歧义的具体行为上自行定性');
    expect(prompt).not.toContain(
      '时间或核心事实不足以准确叙述，返回 needs_input',
    );
    expect(prompt).not.toContain('核心素材不足时');
    expect(prompt.lastIndexOf('成稿原则')).toBeGreaterThan(
      prompt.indexOf('表达我的观点'),
    );
    expect(JSON.stringify(preferences)).toBe(before);
  });
  it('当前时间与提交时间使用上海时区，跨日任务不把提交日当事件日', () => {
    const prompt = buildContentWritingPrompt(
      snapshot,
      new Date('2026-10-19T16:05:06.000Z'),
      new Date('2026-10-18T16:00:00.000Z'),
    );
    expect(prompt).toContain(
      '当前服务器时间为 2026-10-20 00:05:06（Asia/Shanghai，UTC+08:00）',
    );
    expect(prompt).toContain('任务提交时间为 2026-10-19 00:00:00');
    expect(prompt).toContain('这不是事件发生日期');
    expect(prompt).toContain('不得用模型知识截止日期推断当前日期');
    expect(
      buildContentWritingPrompt(snapshot, new Date('2027-01-01T00:00:00Z')),
    ).toContain('2027-01-01 08:00:00');
    expect(buildContentWritingPrompt(snapshot)).toContain(
      '任务提交时间为 未提供',
    );
  });
  it('旧版六条编辑提示仍可读取，协议解析不改写为成功或丢弃提示', () => {
    const value = {
      outcome: 'needs_input',
      body: '',
      notes: Array(6).fill('历史提示'),
    };
    expect(parseContentWritingResponse(JSON.stringify(value))).toEqual(value);
  });
  it('只提取正文与编辑提示，不将协议标记或提示加入正文', () => {
    const expected = {
      outcome: 'draft',
      body: '普通小标题\n\n第一段。\n\n第二段。',
      notes: ['核对日期'],
    };
    expect(parseContentWritingResponse(JSON.stringify(expected))).toEqual(
      expected,
    );
    const markdown = {
      outcome: 'draft',
      body: '### 小标题\n\n**正文**',
      notes: [],
    };
    expect(parseContentWritingResponse(JSON.stringify(markdown))).toEqual(
      markdown,
    );
    expect(
      parseContentWritingResponse(
        '\x60\x60\x60json\n' + JSON.stringify(expected) + '\n\x60\x60\x60',
      ),
    ).toEqual(expected);
    expect(
      parseContentWritingResponse(
        JSON.stringify({
          outcome: 'needs_input',
          body: '',
          notes: ['请提供关键行为与来源'],
        }),
      ),
    ).toMatchObject({ outcome: 'needs_input', body: '' });
  });
  it.each([
    '',
    '普通响应',
    'null',
    '[]',
    '{',
    '{"outcome":"draft","body":"正文"}',
    JSON.stringify({ outcome: ['draft'], body: '', notes: ['提示'] }),
    JSON.stringify({ outcome: 'draft', body: ' ', notes: [] }),
    JSON.stringify({
      outcome: 'needs_input',
      body: '这不是正文',
      notes: ['提示'],
    }),
    JSON.stringify({ outcome: 'needs_input', body: '', notes: [] }),
    JSON.stringify({ outcome: 'draft', body: '正文', notes: [123] }),
    JSON.stringify({ outcome: 'draft', body: '正文', notes: [' '] }),
    JSON.stringify({
      outcome: 'draft',
      body: '正文',
      notes: ['a'.repeat(501)],
    }),
    JSON.stringify({
      outcome: 'draft',
      body: '正文',
      notes: Array(7).fill('提示'),
    }),
    JSON.stringify({ outcome: 'draft', body: 'a'.repeat(50001), notes: [] }),
    JSON.stringify({
      outcome: 'draft',
      body: '正文',
      notes: [],
      reasoning: '内部推理',
    }),
    'x'.repeat(330001),
  ])('无效/超长协议拒绝，不退回原始文本 (%#)', (value) => {
    expect(parseContentWritingResponse(value)).toBeNull();
  });
  it('迁移仅新增可空提示列，可重复执行，回退不丢弃已有提示', async () => {
    const runner = {
      hasColumn: jest.fn().mockResolvedValue(false),
      addColumn: jest.fn(),
      dropColumn: jest.fn(),
      query: jest.fn().mockResolvedValue([{ total: 0 }]),
    };
    const migration = new AddContentEditorNotes1792378800000();
    await migration.up(runner as never);
    expect(runner.addColumn).toHaveBeenCalledWith(
      'content_generation_tasks',
      expect.objectContaining({
        name: 'editorNotes',
        type: 'json',
        isNullable: true,
      }),
    );
    runner.hasColumn.mockResolvedValue(true);
    await migration.up(runner as never);
    expect(runner.addColumn).toHaveBeenCalledTimes(1);
    runner.query.mockResolvedValue([{ total: 1 }]);
    await expect(migration.down(runner as never)).rejects.toThrow('人工归档');
    expect(runner.dropColumn).not.toHaveBeenCalled();
    runner.query.mockResolvedValue([{ total: 0 }]);
    await migration.down(runner as never);
    expect(runner.dropColumn).toHaveBeenCalledWith(
      'content_generation_tasks',
      'editorNotes',
    );
  });
});
