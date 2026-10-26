import type { AiFeatureConfig } from '../ai-feature-configs/entities/ai-feature-config.entity';
import type { KnowledgeAiProvidersService } from './knowledge-ai-providers.service';
import { KnowledgeWebSearchService } from './knowledge-web-search.service';
import {
  HOT_SEARCH_RESPONSE_LIMIT_BYTES,
  sanitizeHotSearchResponse,
  type HotSearchDiagnostics,
} from './knowledge-web-search-diagnostics';

const secret = 'fixture-secret-key';
const query = '用户私有选题兴趣';
const config = {
  isEnabled: true,
  featureType: 'topicDiscovery',
  providerId: 7,
  model: 'hy3',
  webSearchMode: 'tokenhubSearch',
  enableThinking: false,
} as AiFeatureConfig;
const responseWithSources = () => ({
  status: 'completed',
  output: [
    { type: 'web_search_call', status: 'completed' },
    {
      type: 'message',
      content: [
        {
          type: 'output_text',
          text: '搜索回答',
          annotations: [
            {
              type: 'url_citation',
              url: 'https://news.example.com/article/1',
              title: '来源标题',
            },
          ],
        },
      ],
    },
  ],
});

function harness(response: Response | Error) {
  const resolveWebSearchTarget = jest.fn().mockResolvedValue({
    model: 'hy3',
    url: 'https://tokenhub.tencentmaas.com/v1/responses',
    protocol: 'openaiResponses',
    secretKey: secret,
  });
  const service = new KnowledgeWebSearchService({
    resolveWebSearchTarget,
  } as unknown as KnowledgeAiProvidersService);
  const fetchSpy = jest.spyOn(globalThis, 'fetch');
  if (response instanceof Error) fetchSpy.mockRejectedValue(response);
  else fetchSpy.mockResolvedValue(response);
  const diagnostics: HotSearchDiagnostics[] = [];
  const run = () =>
    service.search(config, query, new AbortController().signal, (value) =>
      diagnostics.push(value),
    );
  return { service, run, diagnostics, fetchSpy, resolveWebSearchTarget };
}

describe('联网响应诊断脱敏及请求旁路采集', () => {
  afterEach(() => jest.restoreAllMocks());

  it('保留供应商搜索结构，隐藏嵌套凭据、回显请求和地址敏感部分', () => {
    const result = sanitizeHotSearchResponse(
      {
        headers: { Authorization: 'Bearer unrelated-token' },
        error: { api_key: secret, detail: `upstream leaked ${secret}` },
        request_body: { messages: [{ role: 'user', content: query }] },
        trace: `Bearer third-party-token ${query}`,
        output: responseWithSources().output,
        reference:
          'https://user:password@example.com/article?token=private#secret',
        usage: { input_tokens: 12, output_tokens: 7 },
      },
      [secret, query],
    );
    expect(result.truncated).toBe(false);
    expect(result.responseBody).not.toContain(secret);
    expect(result.responseBody).not.toContain('unrelated-token');
    expect(result.responseBody).not.toContain('third-party-token');
    expect(result.responseBody).not.toContain(query);
    expect(result.responseBody).not.toContain('user:password');
    expect(result.responseBody).not.toContain('token=private');
    expect(JSON.parse(result.responseBody)).toMatchObject({
      output: responseWithSources().output,
      usage: { input_tokens: 12, output_tokens: 7 },
    });
  });

  it('非 JSON 响应也脱敏，二进制大字段明确省略', () => {
    const raw = sanitizeHotSearchResponse(
      `gateway error api_key="${secret}" Bearer extra-token ${query}`,
      [secret, query],
    );
    expect(raw.responseBody).not.toContain(secret);
    expect(raw.responseBody).not.toContain('extra-token');
    expect(raw.responseBody).not.toContain(query);
    const big = sanitizeHotSearchResponse({
      b64_json: 'z'.repeat(10000),
      embedding: [1, 2, 3],
      image: `data:image/png;base64,${'a'.repeat(1000)}`,
    });
    expect(big.truncated).toBe(true);
    expect(big.responseBody).toContain('省略');
    expect(big.responseBody).not.toContain('a'.repeat(100));
  });

  it('UTF-8 字节预算、长数组及循环对象均有界并标明截断', () => {
    const result = sanitizeHotSearchResponse(
      Array.from({ length: 150 }, () => '中文'.repeat(3000)),
    );
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.responseBody)).toBeLessThanOrEqual(
      HOT_SEARCH_RESPONSE_LIMIT_BYTES,
    );
    expect(result.responseBody).toContain('截断');
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(sanitizeHotSearchResponse(cycle).truncated).toBe(true);
  });

  it('来源成功时提供真实解析数量和路径，回调不泄漏请求地址或提示词', async () => {
    const h = harness(new Response(JSON.stringify(responseWithSources())));
    const result = await h.run();
    expect(result.sources).toHaveLength(1);
    expect(h.fetchSpy).toHaveBeenCalledTimes(1);
    expect(h.diagnostics).toHaveLength(1);
    expect(h.diagnostics[0]).toMatchObject({
      version: 1,
      providerId: 7,
      model: 'hy3',
      platformType: 'tencentTokenhub',
      protocol: 'openaiResponses',
      apiPath: '/v1/responses',
      httpStatus: 200,
      truncated: false,
      parsing: { status: 'succeeded', sourceCount: 1, code: null },
    });
    expect(h.diagnostics[0].elapsedMilliseconds).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(h.diagnostics[0].checkedAt))).toBe(false);
    expect(JSON.stringify(h.diagnostics)).not.toContain(secret);
    expect(JSON.stringify(h.diagnostics)).not.toContain(query);
    expect(JSON.stringify(h.diagnostics)).not.toContain(
      'tokenhub.tencentmaas.com',
    );
  });

  it('200 普通回答保留原始结构与解析失败原因，不被诊断功能判为搜索成功', async () => {
    const body = {
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [
            { type: 'output_text', text: '未实际联网', annotations: [] },
          ],
        },
      ],
    };
    const h = harness(new Response(JSON.stringify(body)));
    await expect(h.run()).rejects.toThrow('搜索调用');
    expect(h.fetchSpy).toHaveBeenCalledTimes(1);
    expect(h.diagnostics[0]).toMatchObject({
      httpStatus: 200,
      parsing: { status: 'failed', sourceCount: 0, code: 'search_unverified' },
    });
    expect(JSON.parse(h.diagnostics[0].responseBody)).toEqual(body);
  });

  it('HTTP 错误保留脱敏返回，不重试且沿用既有分类', async () => {
    const h = harness(
      new Response(
        JSON.stringify({
          error: { message: `unsupported ${secret}`, apiKey: secret },
        }),
        { status: 400 },
      ),
    );
    await expect(h.run()).rejects.toThrow('HTTP 400');
    expect(h.fetchSpy).toHaveBeenCalledTimes(1);
    expect(h.diagnostics[0]).toMatchObject({
      httpStatus: 400,
      parsing: { status: 'notAttempted', code: 'search_http' },
    });
    expect(h.diagnostics[0].responseBody).toContain('unsupported');
    expect(h.diagnostics[0].responseBody).not.toContain(secret);
  });

  it('计费失败继续使用固定中文提示，并留下接口原始错误结构', async () => {
    const h = harness(
      new Response(
        JSON.stringify({
          error: {
            message:
              'No free trial quota is available for the service and postpaid billing is not enabled',
          },
        }),
        { status: 402 },
      ),
    );
    await expect(h.run()).rejects.toThrow('暂无免费额度');
    expect(h.diagnostics[0].parsing.code).toBe('search_billing');
    expect(h.diagnostics[0].responseBody).toContain('No free trial quota');
    expect(h.fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('非 JSON 与空响应均可诊断，不伪造有效数据', async () => {
    const h = harness(new Response(`<html>gateway ${secret}</html>`));
    await expect(h.run()).rejects.toThrow('格式不受支持');
    expect(h.diagnostics[0]).toMatchObject({
      parsing: { status: 'notAttempted', code: 'search_format' },
    });
    expect(h.diagnostics[0].responseBody).toContain('<html>');
    expect(h.diagnostics[0].responseBody).not.toContain(secret);
    h.fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(h.run()).rejects.toThrow('空响应');
    expect(h.diagnostics[1]).toMatchObject({
      responseBody: '',
      parsing: { status: 'notAttempted', code: 'search_empty' },
    });
  });

  it('成功体仍受 3 MB 限制，响应展示截断不放宽实际解析预算', async () => {
    const h = harness(new Response('x'.repeat(3 * 1024 * 1024 + 1)));
    await expect(h.run()).rejects.toThrow('3 MB');
    expect(h.diagnostics[0]).toMatchObject({
      truncated: true,
      parsing: { status: 'notAttempted', code: 'search_large' },
    });
    expect(
      Buffer.byteLength(h.diagnostics[0].responseBody),
    ).toBeLessThanOrEqual(HOT_SEARCH_RESPONSE_LIMIT_BYTES);
    expect(h.fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('网络失败只记录受控说明，尚未请求即取消时不创建伪响应', async () => {
    const h = harness(new Error(`connect failed Bearer ${secret}`));
    await expect(h.run()).rejects.toThrow('connect failed');
    expect(h.diagnostics[0]).toMatchObject({
      httpStatus: null,
      responseBody: '',
      parsing: { status: 'notAttempted', code: 'search_network' },
    });
    expect(JSON.stringify(h.diagnostics)).not.toContain(secret);
    const before = h.diagnostics.length;
    await expect(
      h.service.search(config, query, AbortSignal.abort(), (value) =>
        h.diagnostics.push(value),
      ),
    ).rejects.toThrow();
    expect(h.diagnostics).toHaveLength(before);
    expect(h.fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('诊断回调异常不能改变请求成功或原始解析失败', async () => {
    const h = harness(new Response(JSON.stringify(responseWithSources())));
    const callback = jest.fn(() => {
      throw new Error('diagnostic consumer failed');
    });
    await expect(
      h.service.search(config, query, new AbortController().signal, callback),
    ).resolves.toMatchObject({ searchExecuted: true });
    h.fetchSpy.mockResolvedValueOnce(new Response('{}'));
    await expect(
      h.service.search(config, query, new AbortController().signal, callback),
    ).rejects.toThrow('搜索调用');
    expect(callback).toHaveBeenCalledTimes(2);
    expect(h.fetchSpy).toHaveBeenCalledTimes(2);
  });
});
