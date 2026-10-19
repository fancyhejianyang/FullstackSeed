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
    expect(prompt).toContain('不代表已核实');
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
