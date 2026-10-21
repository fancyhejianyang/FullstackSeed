import {
  AI_MATERIAL_IMAGE_TIMEOUT_MS,
  AI_MATERIAL_VIDEO_TIMEOUT_MS,
  describeMaterialGenerationFailure,
  materialTaskLease,
  MaterialProviderHttpError,
} from './material-generation-error';

const context = {
  phase: 'requestingProvider' as const,
  mediaType: 'image' as const,
  serviceStopped: false,
  manuallyAborted: false,
};

describe('material generation errors', () => {
  it('固定生成上限为 5 分钟，并为结果落盘保留租约缓冲', () => {
    expect(AI_MATERIAL_IMAGE_TIMEOUT_MS).toBe(300_000);
    expect(AI_MATERIAL_VIDEO_TIMEOUT_MS).toBe(900_000);
    expect(materialTaskLease('image')).toBe(360_000);
    expect(materialTaskLease('video')).toBe(960_000);
  });

  it('视频任务使用十五分钟执行上限', () => {
    const result = describeMaterialGenerationFailure(
      new DOMException('The operation timed out', 'TimeoutError'),
      { ...context, mediaType: 'video' },
    );
    expect(result.message).toContain('15 分钟');
  });

  it('明确标记五分钟超时且不建议自动重试', () => {
    const result = describeMaterialGenerationFailure(
      new DOMException(
        'The operation was aborted due to timeout',
        'TimeoutError',
      ),
      context,
    );
    expect(result.status).toBe('interrupted');
    expect(result.message).toContain('5 分钟');
    expect(result.message).toContain('不会自动重试');
  });

  it.each([
    [401, '鉴权失败'],
    [404, '接口或模型不存在'],
    [429, '限流或额度不足'],
    [503, '供应商服务异常'],
  ])('将供应商 HTTP %s 映射为明确原因', (statusCode, expected) => {
    const result = describeMaterialGenerationFailure(
      new MaterialProviderHttpError(statusCode),
      context,
    );
    expect(result.status).toBe('failed');
    expect(result.message).toContain(expected);
    expect(result.message).toContain(`HTTP ${statusCode}`);
  });

  it('保留脱敏后的供应商错误码和参数说明', () => {
    const result = describeMaterialGenerationFailure(
      new MaterialProviderHttpError(400, {
        code: 'InvalidParameter',
        message:
          'duration 超出范围，查看 https://example.com，密钥 sk-secret-value',
      }),
      context,
    );
    expect(result.message).toContain('InvalidParameter');
    expect(result.message).toContain('duration 超出范围');
    expect(result.message).toContain('[已隐藏地址]');
    expect(result.message).toContain('[已隐藏密钥]');
    expect(result.message).not.toContain('https://example.com');
    expect(result.message).not.toContain('sk-secret-value');
  });

  it('将异步协议拒绝与普通鉴权失败区分开', () => {
    const result = describeMaterialGenerationFailure(
      new MaterialProviderHttpError(403, {
        code: 'AccessDenied',
        message: 'current user api does not support asynchronous calls',
      }),
      { ...context, mediaType: 'video' },
    );
    expect(result.status).toBe('failed');
    expect(result.message).toContain('拒绝异步视频协议');
    expect(result.message).toContain(
      '/api/v1/services/aigc/video-generation/video-synthesis',
    );
    expect(result.message).not.toContain('鉴权失败');
  });

  it('区分已生成图片后的存储失败', () => {
    const result = describeMaterialGenerationFailure(
      new Error('对象存储不可用'),
      {
        ...context,
        phase: 'storingImage',
      },
    );
    expect(result.status).toBe('failed');
    expect(result.message).toContain('图片已生成，但文件保存失败');
    expect(result.message).toContain('对象存储不可用');
  });

  it('将图片下载自身的超时保留为下载失败，不冒充五分钟执行超时', () => {
    const result = describeMaterialGenerationFailure(
      new Error('生成图片下载超时'),
      { ...context, phase: 'downloadingImage' },
    );
    expect(result.status).toBe('failed');
    expect(result.message).toContain('生成图片下载失败');
    expect(result.message).toContain('生成图片下载超时');
    expect(result.message).not.toContain('5 分钟');
  });
});
