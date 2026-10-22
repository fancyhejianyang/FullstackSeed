import { ComfyClientService } from './comfy-client.service';
import type { ComfyConnection } from './entities/comfy-connection.entity';

function requestUrl(input: unknown) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  throw new Error('测试收到无法识别的请求地址');
}

function connection(value: Partial<ComfyConnection> = {}): ComfyConnection {
  return {
    id: 1,
    name: 'ComfyUI',
    baseUrl: 'http://127.0.0.1:8188',
    authType: 'none',
    username: null,
    secret: null,
    requestTimeoutMs: 15000,
    taskTimeoutSec: 1800,
    maxConcurrency: 1,
    isEnabled: true,
    isDefault: true,
    lastTestStatus: 'untested',
    lastTestedAt: null,
    lastTestMessage: null,
    capabilitySnapshot: null,
    description: null,
    ...value,
  } as ComfyConnection;
}

describe('ComfyClientService', () => {
  const service = new ComfyClientService();

  afterEach(() => jest.restoreAllMocks());

  it('官方云端使用 /api 路径和 X-API-Key，并兼容历史 Bearer 配置', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation((input) => {
        const url = requestUrl(input);
        if (url.endsWith('/api/system_stats')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                system: { comfyui_version: 'cloud' },
                devices: [],
              }),
              { headers: { 'content-type': 'application/json' } },
            ),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ status: 'active' }), {
            headers: { 'content-type': 'application/json' },
          }),
        );
      });

    const result = await service.systemStats(
      connection({
        baseUrl: 'https://cloud.comfy.org',
        authType: 'bearer',
        secret: 'legacy-cloud-key',
      }),
    );

    expect(result.cloudUserStatus).toBe('active');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([input]) => requestUrl(input))).toEqual([
      'https://cloud.comfy.org/api/system_stats',
      'https://cloud.comfy.org/api/user',
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      const headers = init?.headers as Headers;
      expect(headers.get('X-API-Key')).toBe('legacy-cloud-key');
      expect(headers.has('Authorization')).toBe(false);
    }
  });

  it('云端提交工作流时使用 /api/prompt', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ prompt_id: 'job-1' }), {
        headers: { 'content-type': 'application/json' },
      }),
    );

    await service.submitPrompt(
      connection({
        baseUrl: 'https://cloud.comfy.org/api',
        authType: 'apiKey',
        secret: 'cloud-key',
      }),
      { '1': { class_type: 'SaveImage', inputs: {} } },
      'client-id',
    );

    expect(requestUrl(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://cloud.comfy.org/api/prompt',
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({
        prompt: { '1': { class_type: 'SaveImage', inputs: {} } },
      }),
    );
  });

  it('云端任务状态与详情转换为现有历史结构', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'completed' }), {
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            'job-1': {
              id: 'job-1',
              status: 'completed',
              outputs: { '9': { images: [{ filename: 'result.png' }] } },
            },
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
      );

    const result = await service.history(
      connection({
        baseUrl: 'https://cloud.comfy.org',
        authType: 'apiKey',
        secret: 'cloud-key',
      }),
      'job-1',
    );

    expect(fetchMock.mock.calls.map(([input]) => requestUrl(input))).toEqual([
      'https://cloud.comfy.org/api/job/job-1/status',
      'https://cloud.comfy.org/api/history/job-1',
    ]);
    expect(result['job-1']).toEqual(
      expect.objectContaining({
        status: { status_str: 'success', completed: true },
        outputs: { '9': { images: [{ filename: 'result.png' }] } },
      }),
    );
  });

  it('云端 403 明确提示必须开通付费订阅并保留错误摘要', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'plan does not allow prompt' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(
      service.submitPrompt(
        connection({
          baseUrl: 'https://cloud.comfy.org',
          authType: 'apiKey',
          secret: 'cloud-key',
        }),
        { '1': { class_type: 'SaveImage', inputs: {} } },
        'client-id',
      ),
    ).rejects.toThrow(
      'Comfy Cloud API 调用仅对付费订阅账户开放（POST /api/prompt，HTTP 403）：plan does not allow prompt；免费账户只能在网页编辑器中运行，单独充值额度不能解锁 API，必须开通付费订阅',
    );
  });

  it('云端输出跟随 HTTPS 签名地址时不泄露 API Key', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://storage.example.com/result.png' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
      );

    const result = await service.downloadOutput(
      connection({
        baseUrl: 'https://cloud.comfy.org',
        authType: 'apiKey',
        secret: 'cloud-key',
      }),
      { filename: 'result.png', type: 'output' },
    );

    expect(result.buffer).toEqual(Buffer.from([1, 2, 3]));
    expect(requestUrl(fetchMock.mock.calls[0]?.[0])).toContain(
      'https://cloud.comfy.org/api/view?',
    );
    expect(
      (fetchMock.mock.calls[0]?.[1]?.headers as Headers).get('X-API-Key'),
    ).toBe('cloud-key');
    expect(requestUrl(fetchMock.mock.calls[1]?.[0])).toBe(
      'https://storage.example.com/result.png',
    );
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toBeUndefined();
  });
});
