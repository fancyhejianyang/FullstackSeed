import { generationResult, imageGenerationRequest } from './image-generation';

describe('图片生成协议', () => {
  it('DashScope 图生图把参考图放在文本前并开启提示词扩写', () => {
    expect(
      imageGenerationRequest(
        'qwen-image-3.0-pro',
        '调整为电影质感',
        'dashscope',
        'data:image/png;base64,AAAA',
      ),
    ).toEqual({
      model: 'qwen-image-3.0-pro',
      input: {
        messages: [
          {
            role: 'user',
            content: [
              { image: 'data:image/png;base64,AAAA' },
              { text: '调整为电影质感' },
            ],
          },
        ],
      },
      parameters: { n: 1, prompt_extend: true },
    });
  });

  it('文生图保持原协议，OpenAI 收到参考图时显式拒绝', () => {
    expect(
      imageGenerationRequest('qwen-image', '生成图片', 'dashscope'),
    ).toEqual({
      model: 'qwen-image',
      input: {
        messages: [{ role: 'user', content: [{ text: '生成图片' }] }],
      },
      parameters: { n: 1 },
    });
    expect(() =>
      imageGenerationRequest(
        'gpt-image',
        '编辑图片',
        'openai',
        'data:image/png;base64,AAAA',
      ),
    ).toThrow('仅支持 DashScope');
  });

  it('仍可解析 DashScope 多模态生图结果', () => {
    expect(
      generationResult(
        {
          output: {
            choices: [
              {
                message: { content: [{ image: 'https://example.com/a.png' }] },
              },
            ],
          },
        },
        'dashscope',
      ),
    ).toEqual({ url: 'https://example.com/a.png' });
  });
});
