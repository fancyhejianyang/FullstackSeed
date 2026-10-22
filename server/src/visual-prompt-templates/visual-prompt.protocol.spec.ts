import {
  parseComposedVisualPrompt,
  parseExtractedVisualPrompt,
} from './visual-prompt.protocol';

describe('视觉提示词协议', () => {
  it('解析模型专用的正向、负向模板与变量', () => {
    expect(
      parseExtractedVisualPrompt(`\`\`\`json
        {
          "positiveTemplate": "{{subject}}, cinematic light",
          "negativeTemplate": "blur, watermark",
          "styleSummary": "电影感",
          "modelRules": "Flux 使用自然语言，不混用 SD 权重语法",
          "variables": ["subject", "scene"]
        }
      \`\`\``),
    ).toEqual({
      positiveTemplate: '{{subject}}, cinematic light',
      negativeTemplate: 'blur, watermark',
      styleSummary: '电影感',
      modelRules: 'Flux 使用自然语言，不混用 SD 权重语法',
      variables: ['subject', 'scene'],
    });
  });

  it('解析可直接注入工作流的正负提示词', () => {
    expect(
      parseComposedVisualPrompt(
        '{"positivePrompt":"a calm lake","negativePrompt":"text, blur","notes":"适配 SDXL"}',
      ),
    ).toEqual({
      positivePrompt: 'a calm lake',
      negativePrompt: 'text, blur',
      notes: '适配 SDXL',
    });
  });

  it.each([
    [
      '风格摘要',
      '{"positiveTemplate":"{{subject}}, cinematic light","styleSummary":"","modelRules":"使用英文逗号分隔"}',
    ],
    [
      '提示词规则',
      '{"positiveTemplate":"{{subject}}, cinematic light","styleSummary":"电影感","modelRules":""}',
    ],
  ])('缺少%s时拒绝把提炼任务标记为成功', (_field, answer) => {
    expect(parseExtractedVisualPrompt(answer)).toBeNull();
  });

  it('缺少正向结果时拒绝采用', () => {
    expect(parseComposedVisualPrompt('{"negativePrompt":"blur"}')).toBeNull();
  });
});
