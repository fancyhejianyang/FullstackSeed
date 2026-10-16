import { BadRequestException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { AgentMediaService, generationResult } from './agent-media.service';
import { AgentImage } from './entities/agent-image.entity';
import { AgentApp } from './entities/agent-app.entity';
import type { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import {
  AGENT_IMAGE_LIMIT,
  AGENT_UPLOAD_LIMIT,
  imageMime,
  isPublicImageAddress,
  readMediaJson,
} from './agent-image-utils';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=',
  'base64',
);

function jsonBody(body: RequestInit['body']) {
  if (typeof body !== 'string') throw new Error('Expected a JSON string body');
  return JSON.parse(body) as Record<string, unknown>;
}

function harness() {
  const images = {
    count: jest.fn().mockResolvedValue(0),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((value: Partial<AgentImage>) => ({ ...value, id: 1 })),
    save: jest.fn((value: AgentImage) => Promise.resolve(value)),
  };
  const providers = {
    resolveAgentMediaTarget: jest.fn().mockResolvedValue({
      providerId: 2,
      providerName: '媒体账号',
      model: 'configured-image-model',
      url: 'https://provider.example/images',
      secretKey: 'private-secret',
      protocol: 'openai',
    }),
  };
  const app: AgentApp = Object.assign(new AgentApp(), {
    timeoutSeconds: 60,
    mediaModels: {
      vision: { providerId: 2, model: 'configured-vision' },
      imageGeneration: { providerId: 2, model: 'configured-image-model' },
    },
  });
  const service = new AgentMediaService(
    images as unknown as Repository<AgentImage>,
    providers as unknown as KnowledgeAiProvidersService,
  );
  return {
    service,
    images,
    providers,
    params: {
      app,
      executionId: 7,
      sessionId: 3,
      userId: 4,
      mode: 'imageGeneration' as const,
      content: '生成海报',
    },
  };
}

describe('Agent private media boundaries and provider protocols', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('accepts only bounded raster image signatures and keeps uploads private', async () => {
    const h = harness();
    const result = await h.service.upload(3, 4, png);
    expect(result).toEqual({
      id: 1,
      mimeType: 'image/png',
      size: png.length,
      source: 'upload',
    });
    expect(result).not.toHaveProperty('data');
    expect(result).not.toHaveProperty('url');
    expect(h.images.save).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 3, userId: 4, data: png }),
    );
    expect(() => imageMime(Buffer.from('<svg/>'))).toThrow('仅支持');
    expect(() => imageMime(Buffer.alloc(AGENT_IMAGE_LIMIT + 1))).toThrow(
      '超过',
    );
    await expect(
      h.service.upload(3, 4, Buffer.alloc(AGENT_UPLOAD_LIMIT + 1)),
    ).rejects.toThrow('超过');
    h.images.count.mockResolvedValueOnce(50);
    await expect(h.service.upload(3, 4, png)).rejects.toThrow('50');
  });

  it('requires both current user and session for image reads', async () => {
    const h = harness();
    await expect(h.service.read(9, 3, 4)).rejects.toThrow('当前会话');
    expect(h.images.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 9, sessionId: 3, userId: 4 } }),
    );
  });

  it('calls the configured OpenAI-compatible generation endpoint once and persists the real image', async () => {
    const h = harness();
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }),
        ),
      );
    const result = await h.service.run(h.params);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://provider.example/images');
    expect(jsonBody(init?.body)).toEqual({
      model: 'configured-image-model',
      prompt: '生成海报',
      n: 1,
      size: '1024x1024',
    });
    expect(init?.redirect).toBe('error');
    expect(result.images).toEqual([
      { id: 1, mimeType: 'image/png', size: png.length, source: 'generated' },
    ]);
    expect(JSON.stringify(result)).not.toContain('private-secret');
  });

  it('sends image pixels via image_url only to the explicitly configured vision reference', async () => {
    const h = harness();
    h.images.findOne.mockResolvedValueOnce({
      id: 9,
      data: png,
      mimeType: 'image/png',
    });
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '图片中是一把卷尺' } }],
        }),
      ),
    );
    const result = await h.service.run({
      ...h.params,
      mode: 'vision',
      imageId: 9,
      content: '这是什么？',
    });
    expect(h.providers.resolveAgentMediaTarget).toHaveBeenCalledWith(
      2,
      'configured-vision',
      'vision',
    );
    const body = jsonBody(fetchMock.mock.calls[0][1]?.body) as {
      messages: Array<{ content: unknown }>;
    };
    expect(body.messages[1].content).toEqual([
      { type: 'text', text: '这是什么？' },
      {
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${png.toString('base64')}` },
      },
    ]);
    expect(result.content).toBe('图片中是一把卷尺');
    expect(h.images.save).not.toHaveBeenCalled();
  });

  it('uses the DashScope synchronous schema and refuses an async task receipt', async () => {
    const h = harness();
    h.providers.resolveAgentMediaTarget.mockResolvedValueOnce({
      providerId: 2,
      model: 'chosen-image',
      url: 'https://provider.example/generation',
      secretKey: 'secret',
      protocol: 'dashscope',
    });
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ output: { task_id: 'not-an-image' } })),
      );
    await expect(h.service.run(h.params)).rejects.toThrow('不支持异步');
    expect(jsonBody(fetchMock.mock.calls[0][1]?.body)).toEqual({
      model: 'chosen-image',
      input: { messages: [{ role: 'user', content: [{ text: '生成海报' }] }] },
      parameters: { n: 1 },
    });
    expect(
      generationResult(
        {
          output: {
            choices: [
              {
                message: {
                  content: [{ image: 'https://cdn.example/image.png' }],
                },
              },
            ],
          },
        },
        'dashscope',
      ),
    ).toEqual({ url: 'https://cdn.example/image.png' });
    expect(h.images.save).not.toHaveBeenCalled();
  });

  it('does not retry billed generation, surface raw provider secrets, or accept prose as an image', async () => {
    const h = harness();
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('private-secret debug details', { status: 429 }),
      );
    await expect(h.service.run(h.params)).rejects.toThrow('HTTP 429');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(h.images.save).not.toHaveBeenCalled();
    expect(() =>
      generationResult(
        { answer: '图片已生成 ![](http://localhost/admin)' },
        'openai',
      ),
    ).toThrow('未返回图片');
    expect(() =>
      generationResult({ data: [{ b64_json: '%%%=' }] }, 'openai'),
    ).toThrow('无效 Base64');
  });

  it('rejects missing or revoked references before any provider request', async () => {
    const h = harness();
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    h.params.app.mediaModels = null;
    await expect(h.service.run(h.params)).rejects.toThrow('配置');
    h.params.app.mediaModels = {
      vision: null,
      imageGeneration: { providerId: 2, model: 'gone' },
    };
    h.providers.resolveAgentMediaTarget.mockRejectedValueOnce(
      new BadRequestException('账号已停用'),
    );
    await expect(h.service.run(h.params)).rejects.toThrow('账号已停用');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts an in-flight request on cancellation without saving a late image', async () => {
    const h = harness();
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((_url, init) => {
        h.service.cancel(7);
        expect(init?.signal?.aborted).toBe(true);
        return Promise.resolve(
          new Response(
            JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }),
          ),
        );
      });
    await expect(h.service.run(h.params)).rejects.toThrow('可能仍在处理或计费');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(h.images.save).not.toHaveBeenCalled();
  });

  it('enforces request timeouts without automatically issuing another request', async () => {
    jest.useFakeTimers();
    const h = harness();
    h.params.app.timeoutSeconds = 1;
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    );
    const promise = expect(h.service.run(h.params)).rejects.toThrow('超时');
    await jest.advanceTimersByTimeAsync(1001);
    await promise;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects private/special IPs and unbounded response bodies', async () => {
    for (const value of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.1.1.1',
      '::1',
      '::ffff:127.0.0.1',
    ])
      expect(isPublicImageAddress(value)).toBe(false);
    expect(isPublicImageAddress('8.8.8.8')).toBe(true);
    await expect(
      readMediaJson(new Response('x'.repeat(16 * 1024 * 1024 + 1))),
    ).rejects.toThrow('16 MB');
  });
});
