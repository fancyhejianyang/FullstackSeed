import { parseAgentRequestIntent } from './agent-request-intent';

describe('Agent media intent schema', () => {
  it.each(['chat', 'vision', 'imageGeneration', 'imageEdit', 'clarify'])(
    'accepts only a constrained %s intent',
    (mode) => {
      const result = parseAgentRequestIntent(
        JSON.stringify({
          intent: 'analysis',
          complexity: 'simple',
          mode,
          prompt: '一只蓝色的小猫',
          providerId: 999,
          url: 'https://untrusted.example',
        }),
      );
      expect(result.mode).toBe(mode);
      expect(result).not.toHaveProperty('providerId');
      expect(result).not.toHaveProperty('url');
      if (mode !== 'imageGeneration')
        expect(result).not.toHaveProperty('prompt');
    },
  );
  it.each([
    '生成成功！![图片](https://example.com)',
    '{"intent":"chat","complexity":"simple"}',
    '{"intent":"chat","complexity":"simple","mode":["imageGeneration"]}',
    '{"intent":"chat","complexity":"simple","mode":"imageGeneration","prompt":" "}',
    JSON.stringify({
      intent: 'chat',
      complexity: 'simple',
      mode: 'imageGeneration',
      prompt: 'x'.repeat(8001),
    }),
  ])('rejects malformed or incomplete model output (%#)', (text) => {
    expect(() => parseAgentRequestIntent(text)).toThrow();
  });
});
