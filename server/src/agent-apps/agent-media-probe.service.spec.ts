import { ForbiddenException } from '@nestjs/common';
import { validate } from 'class-validator';
import { inflateSync } from 'node:zlib';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { KnowledgeAiProvidersService } from '../knowledge-ai-providers/knowledge-ai-providers.service';
import { AgentMediaProbeService } from './agent-media-probe.service';
import {
  classifyMediaProbeError,
  createVisionChallenge,
} from './agent-media-probe';
import { ProbeAgentMediaModelDto } from './dto/agent-app.dto';
import { imageMime } from './agent-image-utils';

const user: AuthUser = {
  userId: 7,
  username: 'editor',
  isAdmin: false,
  roles: [],
  permissions: ['AgentApp.read', 'AgentApp.update'],
};
const input = { providerId: 2, model: 'chosen-model', kind: 'vision' as const };
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=',
  'base64',
);
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });

function harness() {
  const target = {
    providerId: 2,
    providerName: '账号',
    url: 'https://provider.example/media',
    secretKey: 'private-secret',
    protocol: 'openai',
  };
  const providers = {
    resolveAgentMediaTarget: jest.fn((_id: number, model: string) =>
      Promise.resolve({ ...target, model }),
    ),
  };
  return {
    target,
    providers,
    service: new AgentMediaProbeService(
      providers as unknown as KnowledgeAiProvidersService,
    ),
  };
}

// 独立解码真实 PNG 像素，测试不能从提示文本或 mock 的预设答案中取得正确顺序。
function decodeColors(data: Buffer) {
  expect(imageMime(data)).toBe('image/png');
  expect(data.readUInt32BE(16)).toBe(256);
  expect(data.readUInt32BE(20)).toBe(64);
  expect(data[25]).toBe(2); // truecolour RGB
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < data.length; ) {
    const length = data.readUInt32BE(offset);
    if (data.toString('ascii', offset + 4, offset + 8) === 'IDAT')
      chunks.push(data.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const pixels = inflateSync(Buffer.concat(chunks));
  expect(pixels.length).toBe(64 * (256 * 3 + 1));
  const names: Record<string, string> = {
    '255,0,0': 'red',
    '0,180,0': 'green',
    '0,0,255': 'blue',
    '255,255,0': 'yellow',
    '0,0,0': 'black',
    '255,255,255': 'white',
  };
  return Array.from(
    { length: 4 },
    (_, i) =>
      names[[...pixels.subarray(1 + i * 64 * 3, 4 + i * 64 * 3)].join(',')],
  );
}

function jsonBody(init?: RequestInit): Record<string, unknown> {
  if (typeof init?.body !== 'string')
    throw new Error('Expected JSON request body');
  return JSON.parse(init.body) as Record<string, unknown>;
}

function visionBody(init?: RequestInit) {
  return jsonBody(init) as {
    model: string;
    max_tokens: number;
    messages: Array<{
      content: Array<{
        type: string;
        text?: string;
        image_url?: { url: string };
      }>;
    }>;
  };
}

describe('Agent media selection probes', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('generates a real private image and accepts only its matching colour order', () => {
    const challenge = createVisionChallenge();
    const colors = decodeColors(challenge.data);
    expect(new Set(colors).size).toBe(4);
    expect(challenge.matches(JSON.stringify({ colors }))).toBe(true);
    expect(
      challenge.matches('```json\n' + JSON.stringify({ colors }) + '\n```'),
    ).toBe(true);
    expect(
      challenge.matches(JSON.stringify({ colors: [...colors].reverse() })),
    ).toBe(false);
    expect(challenge.matches('OK')).toBe(false);
    expect(challenge.matches({ colors })).toBe(false);
  });

  it('sends image_url plus bounded answer length and validates actual pixels', async () => {
    const h = harness();
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((_url, init) => {
        const body = visionBody(init);
        expect(body.model).toBe(input.model);
        expect(body.max_tokens).toBe(256);
        expect(body.messages[1].content[0].type).toBe('text');
        const uri = body.messages[1].content[1].image_url!.url;
        expect(uri.startsWith('data:image/png;base64,')).toBe(true);
        const colors = decodeColors(Buffer.from(uri.split(',')[1], 'base64'));
        expect(body.messages[1].content[0].text).not.toContain(
          JSON.stringify(colors),
        );
        return Promise.resolve(
          response({
            choices: [{ message: { content: JSON.stringify({ colors }) } }],
          }),
        );
      });
    const result = await h.service.probe(input, user);
    expect(result).toMatchObject({
      ...input,
      status: 'valid',
      reason: 'supported',
      cached: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.redirect).toBe('error');
    expect(JSON.stringify(result)).not.toContain('private-secret');
  });

  it('does not classify plain OK or unparseable answers as verified vision or definite non-vision', async () => {
    const h = harness();
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        response({ choices: [{ message: { content: 'OK' } }] }),
      );
    expect(await h.service.probe(input, user)).toMatchObject({
      status: 'inconclusive',
      reason: 'unconfirmed',
    });
  });

  it.each([
    [400, 'Model does not support image inputs', 'invalid', 'unsupported'],
    [
      400,
      'image_url is only supported by certain models',
      'invalid',
      'unsupported',
    ],
    [404, 'ModelNotFound', 'invalid', 'model_unavailable'],
    [400, 'InvalidModelId', 'invalid', 'model_unavailable'],
    [401, 'invalid_api_key private-secret', 'inconclusive', 'authentication'],
    [
      403,
      'You do not have permission to access this model',
      'inconclusive',
      'request_config',
    ],
    [429, 'rate limit', 'inconclusive', 'rate_limit'],
    [400, 'insufficient_quota', 'inconclusive', 'quota'],
    [500, 'ModelNotFound', 'inconclusive', 'temporary'],
    [404, 'Unknown API endpoint', 'inconclusive', 'request_config'],
    [
      400,
      'This model does not support image size 1024x1024',
      'inconclusive',
      'request_config',
    ],
    [400, 'invalid max_tokens parameter', 'inconclusive', 'request_config'],
  ])(
    'classifies HTTP %s / %s without destructive guesses',
    (status, message, expected, reason) => {
      const result = classifyMediaProbeError(Number(status), {
        error: { message },
      });
      expect(result).toMatchObject({ status: expected, reason });
      expect(result.message).not.toContain('private-secret');
    },
  );

  it('handles explicit unsupported errors without mutating the account catalog', async () => {
    const h = harness();
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      response(
        {
          error: {
            message: 'Model does not support image inputs private-secret',
          },
        },
        400,
      ),
    );
    expect(await h.service.probe(input, user)).toMatchObject({
      status: 'invalid',
      reason: 'unsupported',
    });
    expect(Object.keys(h.providers)).toEqual(['resolveAgentMediaTarget']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('recognizes non-JSON HTTP failures without leaking provider text or retrying', async () => {
    const h = harness();
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('private-secret debug', { status: 429 }));
    const result = await h.service.probe(input, user);
    expect(result).toMatchObject({
      status: 'inconclusive',
      reason: 'rate_limit',
    });
    expect(JSON.stringify(result)).not.toContain('private-secret');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses generation-specific parameters and verifies returned image bytes without persisting them', async () => {
    const h = harness();
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        response({ data: [{ b64_json: png.toString('base64') }] }),
      );
    const result = await h.service.probe(
      { ...input, kind: 'imageGeneration' },
      user,
    );
    expect(result.status).toBe('valid');
    expect(jsonBody(fetchMock.mock.calls[0][1])).toEqual({
      model: input.model,
      prompt: '白色背景中一个蓝色圆形，简洁平面图，无文字。',
      n: 1,
      size: '1024x1024',
    });
    expect(result).not.toHaveProperty('data');
    expect(result).not.toHaveProperty('url');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses DashScope synchronous body without chat params and refuses async task receipts', async () => {
    const h = harness();
    h.target.protocol = 'dashscope';
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(response({ output: { task_id: 'not-an-image' } }));
    expect(
      await h.service.probe({ ...input, kind: 'imageGeneration' }, user),
    ).toMatchObject({ status: 'inconclusive' });
    expect(jsonBody(fetchMock.mock.calls[0][1])).toEqual({
      model: input.model,
      input: {
        messages: [
          {
            role: 'user',
            content: [{ text: '白色背景中一个蓝色圆形，简洁平面图，无文字。' }],
          },
        ],
      },
      parameters: { n: 1 },
    });
  });

  it.each([
    { answer: '生成成功 ![](https://cdn.example/not-a-result.png)' },
    { data: [{ b64_json: Buffer.from('not an image').toString('base64') }] },
  ])('does not accept forged success or non-image data', async (body) => {
    const h = harness();
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(body));
    expect(
      await h.service.probe({ ...input, kind: 'imageGeneration' }, user),
    ).toMatchObject({ status: 'inconclusive' });
  });

  it('requires editing permissions and a valid saved provider before a paid request', async () => {
    const h = harness();
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    await expect(
      h.service.probe(input, { ...user, permissions: ['AgentApp.read'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.providers.resolveAgentMediaTarget).not.toHaveBeenCalled();
    h.providers.resolveAgentMediaTarget.mockRejectedValueOnce(
      new Error('revoked catalog'),
    );
    expect(await h.service.probe(input, user)).toMatchObject({
      status: 'inconclusive',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reuses results for 60 seconds but re-resolves saved configuration and invalidates changed endpoints', async () => {
    jest.useFakeTimers();
    const h = harness();
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(
          response({ data: [{ b64_json: png.toString('base64') }] }),
        ),
      );
    const dto = { ...input, kind: 'imageGeneration' as const };
    expect((await h.service.probe(dto, user)).cached).toBe(false);
    expect((await h.service.probe(dto, user)).cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    h.target.url = 'https://provider.example/new-endpoint';
    expect((await h.service.probe(dto, user)).cached).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(60001);
    expect((await h.service.probe(dto, user)).cached).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    h.providers.resolveAgentMediaTarget.mockRejectedValueOnce(
      new Error('revoked'),
    );
    expect((await h.service.probe(dto, user)).status).toBe('inconclusive');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('allows one concurrent probe per user and releases on timeout without retries', async () => {
    jest.useFakeTimers();
    const h = harness();
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    );
    const first = h.service.probe(input, user);
    expect((await h.service.probe(input, user)).reason).toBe('busy');
    await jest.advanceTimersByTimeAsync(30001);
    expect(await first).toMatchObject({
      status: 'inconclusive',
      reason: 'timeout',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await h.service.probe(input, user)).toMatchObject({
      reason: 'timeout',
      cached: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(60001);
    fetchMock.mockResolvedValueOnce(
      response({ error: { code: 'ModelNotFound' } }, 404),
    );
    expect((await h.service.probe(input, user)).status).toBe('invalid');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('limits actual calls to six per minute, not per model', async () => {
    const h = harness();
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(
          response({ data: [{ b64_json: png.toString('base64') }] }),
        ),
      );
    for (let i = 0; i < 6; i++)
      expect(
        (
          await h.service.probe(
            { ...input, model: `image-${i}`, kind: 'imageGeneration' },
            user,
          )
        ).status,
      ).toBe('valid');
    expect(
      (await h.service.probe({ ...input, model: 'seventh' }, user)).reason,
    ).toBe('busy');
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('validates provider ID, bounded nonblank model ID and media kind', async () => {
    expect(
      await validate(Object.assign(new ProbeAgentMediaModelDto(), input)),
    ).toHaveLength(0);
    for (const invalid of [
      { providerId: -1 },
      { providerId: '2' },
      { model: ' ' },
      { model: 'x'.repeat(201) },
      { kind: 'chat' },
    ]) {
      expect(
        (
          await validate(
            Object.assign(new ProbeAgentMediaModelDto(), input, invalid),
          )
        ).length,
      ).toBeGreaterThan(0);
    }
  });
});
