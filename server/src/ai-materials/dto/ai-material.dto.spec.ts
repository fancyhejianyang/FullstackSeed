import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateAiMaterialDto } from './ai-material.dto';

function payload(overrides: Record<string, unknown> = {}) {
  return plainToInstance(CreateAiMaterialDto, {
    prompt: '城市夜景',
    styleKey: 'original',
    aiConfigId: 1,
    generationMode: 'textToVideo',
    videoResolution: '1080P',
    videoRatio: 'adaptive',
    videoDuration: 5,
    ...overrides,
  });
}

describe('CreateAiMaterialDto video parameters', () => {
  it.each([-1, 2, 10, 30])('接受 Wan 3.0 时长 %s', (videoDuration) => {
    expect(validateSync(payload({ videoDuration }))).toHaveLength(0);
  });

  it.each([0, 1, 31, 2.5])('拒绝无效视频时长 %s', (videoDuration) => {
    expect(validateSync(payload({ videoDuration }))).not.toHaveLength(0);
  });

  it('接受 21:9 并将字符串时长转换为数字', () => {
    const dto = payload({ videoRatio: '21:9', videoDuration: '30' });
    expect(dto.videoDuration).toBe(30);
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('提示词最多允许 20000 个字符', () => {
    expect(validateSync(payload({ prompt: '画'.repeat(20000) }))).toHaveLength(
      0,
    );
    expect(
      validateSync(payload({ prompt: '画'.repeat(20001) })),
    ).not.toHaveLength(0);
  });

  it('解析并校验多参考素材 JSON', () => {
    const dto = payload({
      generationMode: 'referenceToVideo',
      referenceMedia: JSON.stringify([
        { type: 'reference_image', url: 'https://example.com/a.png' },
        { type: 'reference_video', url: 'https://example.com/b.mp4' },
      ]),
    });
    expect(dto.referenceMedia).toHaveLength(2);
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('拒绝非 HTTPS 或未知类型的参考素材', () => {
    expect(
      validateSync(
        payload({
          generationMode: 'referenceToVideo',
          referenceMedia: JSON.stringify([
            { type: 'first_frame', url: 'http://example.com/a.png' },
          ]),
        }),
      ),
    ).not.toHaveLength(0);
  });
});
