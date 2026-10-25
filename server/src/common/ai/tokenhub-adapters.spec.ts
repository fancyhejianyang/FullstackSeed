import {
  extendedTokenhubRequest,
  extendedTokenhubResult,
} from './tokenhub-adapters';
import type { ModelProtocol } from '../../model-endpoints/model-endpoint.constants';
import {
  imageGenerationRequest,
  imageGenerationResult,
} from './image-generation';
import { videoTaskId, videoTaskResult } from './video-generation';

describe('腾讯扩展协议真实字段', () => {
  afterEach(() => jest.restoreAllMocks());
  it('Kling 参考图支持 URL，Base64 只去掉 data 前缀，WAND 使用 input_image', () => {
    expect(
      imageGenerationRequest(
        'kling-image-v3',
        '猫',
        'tokenhubKlingImage',
        'data:image/png;base64,AAAA',
      ),
    ).toMatchObject({ image: 'AAAA', n: 1 });
    expect(
      imageGenerationRequest(
        'kling-image-o1',
        '猫',
        'tokenhubKlingImage',
        'https://example.com/a.png',
      ),
    ).toMatchObject({ image_list: ['https://example.com/a.png'] });
    expect(
      imageGenerationRequest(
        'wand-vega-image-pro',
        '猫',
        'tokenhubWandImage',
        'https://example.com/a.png',
      ),
    ).toMatchObject({
      input: [
        {
          content: [
            { type: 'input_image', image_url: 'https://example.com/a.png' },
          ],
        },
      ],
    });
  });

  it('PixVerse 首尾帧、Kling 多参考、MiniMax V2 使用各自字段，分辨率不偷偷转换', () => {
    expect(
      extendedTokenhubRequest({
        model: 'pixverse-video-c1',
        protocol: 'tokenhubPixverseVideo',
        functionType: 'startEndToVideo',
        image: 'first',
        lastImage: 'last',
      }),
    ).toMatchObject({
      first_frame_img: 'first',
      last_frame_img: 'last',
      quality: '720p',
    });
    expect(
      extendedTokenhubRequest({
        model: 'kling-video-o1',
        protocol: 'tokenhubKlingVideo',
        functionType: 'referenceToVideo',
        references: [
          { type: 'reference_video', url: 'video' },
          { type: 'reference_image', url: 'image' },
        ],
      }),
    ).toMatchObject({
      contents: [
        { type: 'prompt' },
        { type: 'feature_video', url: 'video' },
        { type: 'refer_image', url: 'image' },
      ],
    });
    expect(
      extendedTokenhubRequest({
        model: 'minimax-video-h3',
        protocol: 'tokenhubMinimaxVideoV2',
        functionType: 'imageToVideo',
        image: 'first',
      }),
    ).toMatchObject({
      resolution: '768P',
      content: [
        { type: 'text' },
        { type: 'image_url', image_url: { url: 'first' }, role: 'first_frame' },
      ],
    });
    expect(() =>
      extendedTokenhubRequest({
        model: 'minimax-video-h3',
        protocol: 'tokenhubMinimaxVideoV2',
        functionType: 'textToVideo',
        resolution: '720P',
      }),
    ).toThrow('768P');
  });

  it.each([
    [
      'tokenhubWandImage',
      {
        task_id: 'wand',
        status: 'completed',
        data: [{ url: 'https://result.example/a.png' }],
      },
    ],
    [
      'tokenhubKlingImage',
      {
        code: '0',
        data: {
          task_status: 'succeed',
          task_result: { images: [{ url: 'https://result.example/a.png' }] },
        },
      },
    ],
    [
      'tokenhubWandVideo',
      {
        status: 'succeeded',
        content: { video_url: 'https://result.example/a.mp4' },
      },
    ],
    [
      'tokenhubPixverseVideo',
      {
        Resp: { video_id: 123, status: 1, url: 'https://result.example/a.mp4' },
      },
    ],
    [
      'tokenhubKlingVideo',
      {
        code: 0,
        message: 'SUCCEED',
        data: [
          {
            id: 'kling',
            status: 'succeeded',
            outputs: [{ url: 'https://result.example/a.mp4' }],
          },
        ],
      },
    ],
    [
      'tokenhubMinimaxVideo',
      { status: 'Success', content: { url: 'https://result.example/a.mp4' } },
    ],
    [
      'tokenhubMinimaxVideoV2',
      {
        task: {
          status: 'Success',
          content: { url: 'https://result.example/a.mp4' },
        },
      },
    ],
    [
      'tokenhubWorldScene',
      {
        status: 'succeeded',
        data: [{ scene_url: 'https://result.example/a.zip' }],
      },
    ],
    [
      'tokenhubWorldPanorama',
      {
        status: 'succeeded',
        data: [{ super_resolution_image_url: 'https://result.example/a.png' }],
      },
    ],
    ['tokenhub3d', { status: 'completed', output: { riggable: false } }],
    [
      'tokenhubYoutuVideo',
      { status: 'completed', data: { url: 'https://result.example/a.mp4' } },
    ],
    ['tokenhubAsrSync', { status: 'completed', output: { text: '你好' } }],
    [
      'tokenhubAsrAsync',
      { status: 'completed', output: { sentences: [{ text: '你好' }] } },
    ],
    [
      'tokenhubTts',
      {
        base_resp: { status_code: 0 },
        data: { status: 2, audio: 'https://result.example/a.mp3' },
      },
    ],
    [
      'tokenhubMusic',
      { data: { status: 2, audio: 'https://result.example/a.mp3' } },
    ],
    ['tokenhubVoiceClone', { voice_id: 'cloned' }],
    ['tokenhubVoiceDesign', { voice_id: 'designed' }],
    [
      'tokenhubDubbing',
      {
        status: 'completed',
        output: { result_url: 'https://result.example/a.mp4' },
      },
    ],
    [
      'tokenhubMurekaMusic',
      {
        status: 'succeeded',
        choices: [{ url: 'https://result.example/a.mp3' }],
      },
    ],
  ] as Array<[ModelProtocol, unknown]>)(
    '%s 校验实际终态字段，空结果不冒充成功',
    (protocol, value) => {
      expect(extendedTokenhubResult(value, protocol)?.status).toBe('succeeded');
      expect(extendedTokenhubResult({}, protocol)?.status).toBe('unknown');
      expect(
        extendedTokenhubResult({ status: 'completed' }, protocol)?.status,
      ).toBe('unknown');
    },
  );

  it('提交接受编号后只查询原任务，未知状态不永久当作处理中', () => {
    expect(
      videoTaskId({ Resp: { video_id: 123 } }, 'tokenhubPixverseVideo'),
    ).toBe('123');
    expect(
      videoTaskResult({ Resp: { status: 5 } }, 'tokenhubPixverseVideo'),
    ).toEqual({ status: 'pending' });
    expect(
      videoTaskResult({ task: { status: 'Fail' } }, 'tokenhubMinimaxVideoV2'),
    ).toMatchObject({ status: 'failed' });
    expect(
      extendedTokenhubResult({ id: 'task' }, 'tokenhub3d', true),
    ).toMatchObject({ status: 'pending' });
    expect(
      extendedTokenhubResult({ id: 'task' }, 'tokenhub3d', false),
    ).toMatchObject({ status: 'unknown' });
    expect(
      extendedTokenhubResult(
        { code: '100', data: { task_status: 'succeed' } },
        'tokenhubKlingImage',
      ),
    ).toEqual({ status: 'failed' });
  });

  it('搜索结果需要回答和真实搜索来源，HTTP 成功和正文链接都不足以确认', () => {
    const choices = [
      {
        message: {
          content: '搜索回答',
          search_results: [{ url: 'https://example.com/a', name: '来源' }],
        },
      },
    ];
    expect(
      extendedTokenhubResult({ choices }, 'openaiChatSearch')?.status,
    ).toBe('succeeded');
    expect(
      extendedTokenhubResult(
        { choices: [{ message: { content: 'https://example.com/a' } }] },
        'openaiChatSearch',
      )?.status,
    ).toBe('unknown');
    expect(
      extendedTokenhubResult(
        {
          output: [
            { type: 'web_search_call', status: 'completed' },
            { type: 'message', content: [{ text: '答案' }] },
          ],
        },
        'openaiResponses',
      )?.status,
    ).toBe('succeeded');
    expect(
      extendedTokenhubResult({ output_text: '答案' }, 'openaiResponses')
        ?.status,
    ).toBe('unknown');
  });

  it('高级原生输入保留显式占位符，Mureka 明确限制单次一首', () => {
    expect(
      extendedTokenhubRequest({
        model: 'hy-3d-motion',
        protocol: 'tokenhub3d',
        functionType: 'threeDMotion',
      }),
    ).toHaveProperty('REPLACE_WITH_PARAMETERS_FROM_DOCUMENTATION');
    expect(
      extendedTokenhubRequest({
        model: 'mureka-music-v9',
        protocol: 'tokenhubMurekaMusic',
        functionType: 'musicEasyGeneration',
      }),
    ).toMatchObject({ n: 1 });
  });
  it('Kling Omni 的普通文生/图生也使用 contents，首尾帧按模型选择合法清晰度', () => {
    const text = extendedTokenhubRequest({
      model: 'kling-video-o1',
      protocol: 'tokenhubKlingVideo',
      functionType: 'textToVideo',
    });
    expect(text).toMatchObject({
      contents: [{ type: 'prompt' }],
      settings: { aspect_ratio: '16:9' },
    });
    expect(text).not.toHaveProperty('prompt');
    expect(
      extendedTokenhubRequest({
        model: 'kling-video-v3-omni',
        protocol: 'tokenhubKlingVideo',
        functionType: 'imageToVideo',
        image: 'first',
      }),
    ).toMatchObject({
      contents: [{ type: 'prompt' }, { type: 'first_frame', url: 'first' }],
    });
    expect(
      extendedTokenhubRequest({
        model: 'kling-video-v2.5-turbo',
        protocol: 'tokenhubKlingVideo',
        functionType: 'startEndToVideo',
        image: 'first',
        lastImage: 'last',
      }),
    ).toMatchObject({ settings: { resolution: '1080p' } });
  });

  it('扩展异步图片遇到失败或跨域立即停止，不重新提交', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const target = {
      protocol: 'tokenhubWandImage' as const,
      url: 'https://provider.example/generate',
      taskUrlTemplate: 'https://evil.example/tasks/{taskId}',
      secretKey: 'test',
    };
    await expect(
      imageGenerationResult(
        { task_id: 'image1', status: 'queued' },
        target,
        new AbortController().signal,
      ),
    ).rejects.toThrow('同域');
    await expect(
      imageGenerationResult(
        { task_id: 'image1', status: 'failed' },
        {
          ...target,
          taskUrlTemplate: 'https://provider.example/tasks/{taskId}',
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow('失败');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it.each(['completed', 'unrecognized'])(
    'WAND 图片查询 %s 只 GET 原任务，未知状态立即停止',
    async (status) => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            task_id: 'image/a',
            status,
            data: [{ url: 'https://result.example/a.png' }],
          }),
        ),
      );
      const result = imageGenerationResult(
        { task_id: 'image/a', status: 'queued' },
        {
          protocol: 'tokenhubWandImage',
          url: 'https://provider.example/generate',
          taskUrlTemplate: 'https://provider.example/tasks/{taskId}',
          secretKey: 'test',
        },
        new AbortController().signal,
      );
      if (status === 'completed')
        await expect(result).resolves.toEqual({
          url: 'https://result.example/a.png',
        });
      else await expect(result).rejects.toThrow('无法识别');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0][0]).toBe(
        'https://provider.example/tasks/image%2Fa',
      );
      expect(fetchSpy.mock.calls[0][1]?.method).toBe('GET');
    },
  );
});
