import {
  generationResult,
  imageGenerationRequest,
  imageGenerationResult,
} from './image-generation';
import {
  videoGenerationRequest,
  videoTaskId,
  videoTaskResult,
} from './video-generation';

describe('TokenHub 协议适配', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  it('混元 3.5 使用 messages，参考图放入多模态 content', () => {
    expect(
      imageGenerationRequest(
        'hy-image-v3.5-preview',
        '画猫',
        'tokenhubHunyuanImageChat',
        'data:image/png;base64,AAAA',
      ),
    ).toEqual({
      model: 'hy-image-v3.5-preview',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '画猫' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,AAAA' },
            },
          ],
        },
      ],
    });
    expect(
      generationResult(
        {
          choices: [
            {
              delta: { image: { url: 'https://result.example/cat.png' } },
              finish_reason: null,
            },
          ],
        },
        'tokenhubHunyuanImageChat',
      ),
    ).toEqual({ url: 'https://result.example/cat.png' });
  });
  it('Seedream 使用 prompt/images，且不发送 OpenAI 专属 n 参数', () => {
    expect(
      imageGenerationRequest(
        'seedream-image-v5.0-pro',
        '画猫',
        'tokenhubSeedreamImage',
        'https://example.com/cat.png',
      ),
    ).toEqual({
      model: 'seedream-image-v5.0-pro',
      prompt: '画猫',
      images: ['https://example.com/cat.png'],
      size: '2048x2048',
    });
    expect(
      generationResult(
        { data: [{ url: 'https://result.example/cat.png' }] },
        'tokenhubSeedreamImage',
      ),
    ).toEqual({ url: 'https://result.example/cat.png' });
    expect(() =>
      imageGenerationRequest(
        'seedream-image-v5.0-pro',
        '猫'.repeat(601),
        'tokenhubSeedreamImage',
      ),
    ).toThrow('600');
  });
  it('Vidu 提交后只 GET 查询，不重新 POST 生成', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          state: 'success',
          creations: [{ url: 'https://result.example/cat.png' }],
        }),
      ),
    );
    const saved = jest.fn().mockResolvedValue(undefined);
    const result = await imageGenerationResult(
      { task_id: 'task-1', state: 'created' },
      {
        protocol: 'tokenhubViduImage',
        url: 'https://provider.example/generate',
        taskUrlTemplate: 'https://provider.example/tasks/{taskId}',
        secretKey: 'test-key',
      },
      AbortSignal.timeout(5000),
      saved,
    );
    expect(result).toEqual({ url: 'https://result.example/cat.png' });
    expect(saved).toHaveBeenCalledWith('task-1');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://provider.example/tasks/task-1',
      expect.objectContaining({ method: 'GET', redirect: 'error' }),
    );
  });
  it('拒绝异步查询跨域，已失败任务不继续请求', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const target = {
      protocol: 'tokenhubViduImage' as const,
      url: 'https://provider.example/generate',
      taskUrlTemplate: 'https://evil.example/tasks/{taskId}',
      secretKey: 'test-key',
    };
    await expect(
      imageGenerationResult(
        { task_id: 'task-1', state: 'created' },
        target,
        new AbortController().signal,
      ),
    ).rejects.toThrow('同域');
    await expect(
      imageGenerationResult(
        { task_id: 'task-1', state: 'failed' },
        {
          ...target,
          taskUrlTemplate: 'https://provider.example/tasks/{taskId}',
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow('失败');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('混元视频使用顶层 image，Vidu 使用 images，状态与结果分别归一化', () => {
    const input = {
      model: 'hy-video-v1.5',
      prompt: '猫跳跃',
      generationMode: 'imageToVideo' as const,
      referenceImageDataUrl: 'data:image/png;base64,AAAA',
      resolution: '720P' as const,
      ratio: 'adaptive' as const,
      duration: 5,
    };
    expect(videoGenerationRequest(input, 'tokenhubHunyuanVideo')).toMatchObject(
      { image: input.referenceImageDataUrl, resolution: '720p', duration: 5 },
    );
    expect(
      videoGenerationRequest(
        { ...input, model: 'vidu-video-q2-pro' },
        'tokenhubViduVideo',
      ),
    ).toMatchObject({
      images: [input.referenceImageDataUrl],
      resolution: '720p',
    });
    expect(videoTaskId({ task_id: 'task-1' }, 'tokenhubHunyuanVideo')).toBe(
      'task-1',
    );
    expect(
      videoTaskResult(
        { status: 'succeeded', videos: [{ url: 'https://example.com/a.mp4' }] },
        'tokenhubHunyuanVideo',
      ),
    ).toEqual({ status: 'succeeded', videoUrl: 'https://example.com/a.mp4' });
    expect(
      videoTaskResult(
        { state: 'success', creations: [{ url: 'https://example.com/a.mp4' }] },
        'tokenhubViduVideo',
      ),
    ).toEqual({ status: 'succeeded', videoUrl: 'https://example.com/a.mp4' });
  });
});
