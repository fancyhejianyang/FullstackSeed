import {
  ContentCoverService,
  parseCoverBrief,
  COVER_BRIEF_PROMPT,
} from './content-cover.service';
import { ContentGenerationTask } from './entities/content-generation-task.entity';
import * as images from '../common/ai/image-utils';

function setup() {
  const providers = {
    resolveContentCoverTarget: jest.fn().mockResolvedValue({
      providerId: 6,
      model: 'image-model',
      secretKey: 'private-secret',
      url: 'https://provider.example/images/generations',
      protocol: 'openai',
    }),
    withExecutionSignal: jest.fn(
      (_signal: AbortSignal, run: () => Promise<unknown>) => run(),
    ),
    callChat: jest.fn().mockResolvedValue({
      isSuccess: true,
      answer: '{"prompt":"破晓的光线穿过阴云，表达希望与坚定"}',
      usage: { totalTokens: 33 },
    }),
  };
  const uploads = {
    saveFile: jest.fn().mockResolvedValue({ url: '/uploads/cover.png' }),
  };
  const service = new ContentCoverService(providers as never, uploads as never);
  const task = {
    snapshot: {
      config: {
        providerId: 6,
        model: 'text-model',
        temperature: 0.4,
        thinkingParameters: null,
      },
    },
    generatedTitle: '希望',
    result: '文章正文',
  } as ContentGenerationTask;
  const png = Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    Buffer.alloc(16),
  ]);
  const fetcher = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }),
      ),
    );
  return {
    providers,
    uploads,
    service,
    task,
    png,
    fetcher,
    signal: new AbortController().signal,
  };
}

describe('独立文章封面生成', () => {
  afterEach(() => jest.restoreAllMocks());
  it('同账号总结情绪后生成一张图片，持久存储且不覆盖文章', async () => {
    const h = setup();
    const result = await h.service.generate(h.task, h.signal);
    expect(result).toMatchObject({
      status: 'succeeded',
      data: {
        url: '/uploads/cover.png',
        model: 'image-model',
        totalTokens: 33,
      },
    });
    expect(h.providers.resolveContentCoverTarget).toHaveBeenCalledWith(6);
    expect(h.providers.callChat).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 6,
        model: 'text-model',
        systemPrompt: COVER_BRIEF_PROMPT,
        question: JSON.stringify({ title: '希望', body: '文章正文' }),
      }),
    );
    const options = h.fetcher.mock.calls[0][1]!;
    expect(options.redirect).toBe('error');
    expect(JSON.parse(options.body as string)).toMatchObject({
      model: 'image-model',
      n: 1,
    });
    expect(h.uploads.saveFile).toHaveBeenCalledWith(
      expect.objectContaining({
        buffer: h.png,
        mimetype: 'image/png',
        originalname: 'content-cover.png',
      }),
    );
    expect(h.fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain('private-secret');
  });
  it('无模型或接口时不调用文本、不生图也不写存储', async () => {
    const h = setup();
    h.providers.resolveContentCoverTarget.mockResolvedValue(null);
    expect((await h.service.generate(h.task, h.signal)).status).toBe('skipped');
    expect(h.providers.callChat).not.toHaveBeenCalled();
    expect(h.fetcher).not.toHaveBeenCalled();
    expect(h.uploads.saveFile).not.toHaveBeenCalled();
  });
  it('DashScope 真实图片 URL 走安全下载，临时地址不作为候选保存', async () => {
    const h = setup();
    h.providers.resolveContentCoverTarget.mockResolvedValue({
      providerId: 6,
      model: 'image-model',
      secretKey: 'private-secret',
      url: 'https://provider.example/generation',
      protocol: 'dashscope',
    });
    h.fetcher.mockResolvedValue(
      new Response(
        JSON.stringify({
          output: {
            choices: [
              {
                message: {
                  content: [{ image: 'https://cdn.example/result.png' }],
                },
              },
            ],
          },
        }),
      ),
    );
    const download = jest
      .spyOn(images, 'downloadGeneratedImage')
      .mockResolvedValue(h.png);
    const result = await h.service.generate(h.task, h.signal);
    expect(result.data.url).toBe('/uploads/cover.png');
    expect(download).toHaveBeenCalledWith(
      'https://cdn.example/result.png',
      h.signal,
    );
    expect(
      JSON.parse(h.fetcher.mock.calls[0][1]!.body as string),
    ).toMatchObject({
      parameters: { n: 1 },
      input: { messages: [{ role: 'user' }] },
    });
  });
  it.each(['provider', 'brief', 'image', 'storage', 'invalidImage'])(
    '%s 失败不重试、不泄漏秘密且返回独立失败状态',
    async (stage) => {
      const h = setup();
      if (stage === 'provider')
        h.providers.resolveContentCoverTarget.mockRejectedValue(
          new Error('private-secret'),
        );
      if (stage === 'brief')
        h.providers.callChat.mockResolvedValue({
          isSuccess: true,
          answer: 'invalid private-secret',
        });
      if (stage === 'image')
        h.fetcher.mockResolvedValue(
          new Response('private-secret', { status: 401 }),
        );
      if (stage === 'storage')
        h.uploads.saveFile.mockRejectedValue(new Error('private-secret'));
      if (stage === 'invalidImage')
        h.fetcher.mockResolvedValue(
          new Response(
            JSON.stringify({
              data: [
                { b64_json: Buffer.from('<svg>bad</svg>').toString('base64') },
              ],
            }),
          ),
        );
      const result = await h.service.generate(h.task, h.signal);
      expect(result.status).toBe('failed');
      expect(result.data.url).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain('private-secret');
      expect(h.fetcher.mock.calls.length).toBeLessThanOrEqual(1);
      expect(h.providers.callChat.mock.calls.length).toBeLessThanOrEqual(1);
    },
  );
  it('取消后不继续生图或存储', async () => {
    const h = setup();
    const controller = new AbortController();
    h.providers.callChat.mockImplementation(() => {
      controller.abort();
      return Promise.resolve({ isSuccess: true, answer: '{"prompt":"希望"}' });
    });
    expect((await h.service.generate(h.task, controller.signal)).status).toBe(
      'interrupted',
    );
    expect(h.fetcher).not.toHaveBeenCalled();
    expect(h.uploads.saveFile).not.toHaveBeenCalled();
  });
  it('构思协议限制长度与结构，保留情感表达要求', () => {
    expect(parseCoverBrief('```json\n{"prompt":"希望"}\n```')).toBe('希望');
    for (const input of [
      'null',
      '[]',
      '{}',
      '{"prompt":""}',
      JSON.stringify({ prompt: 'a'.repeat(1201) }),
    ])
      expect(() => parseCoverBrief(input)).toThrow();
    expect(COVER_BRIEF_PROMPT).toContain('情绪化概念插画');
    expect(COVER_BRIEF_PROMPT).toContain('不模拟新闻现场照片');
  });
});
