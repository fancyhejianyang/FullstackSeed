import { buildMaterialPrompt } from './ai-material.constants';

describe('buildMaterialPrompt', () => {
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
