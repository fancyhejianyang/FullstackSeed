import {
  AI_MATERIAL_VIDEO_DURATIONS,
  AI_MATERIAL_VIDEO_RATIOS,
  AI_MATERIAL_VIDEO_REFERENCE_LIMIT_BYTES,
  buildMaterialPrompt,
} from './ai-material.constants';

describe('buildMaterialPrompt', () => {
  it('同步 Wan 3.0 的视频画幅、时长和参考图上限', () => {
    expect(AI_MATERIAL_VIDEO_RATIOS).toContain('21:9');
    expect(AI_MATERIAL_VIDEO_DURATIONS).toEqual([
      -1,
      ...Array.from({ length: 29 }, (_, index) => index + 2),
    ]);
    expect(AI_MATERIAL_VIDEO_REFERENCE_LIMIT_BYTES).toBe(20 * 1024 * 1024);
  });

  it('按默认要求、用户提示词和风格组合且不执行额外润色', () => {
    expect(
      buildMaterialPrompt({
        prompt: '一只站在山顶的猫',
        styleKey: 'cinematic',
        defaultRequirement: '无文字、无水印',
      }),
    ).toBe(
      '无文字、无水印\n一只站在山顶的猫\n画面风格：电影级构图，戏剧化光影，层次丰富，氛围感强',
    );
  });

  it('自定义风格只使用用户保存的风格描述', () => {
    expect(
      buildMaterialPrompt({
        prompt: '海边日落',
        styleKey: 'custom',
        customStyle: '复古丝网印刷',
      }),
    ).toBe('海边日落\n画面风格：复古丝网印刷');
  });
});
