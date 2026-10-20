import {
  extractPromptExamples,
  sanitizeComfyWorkflow,
  withoutPromptBindingDefaults,
} from './comfy-workflow-sanitizer';
import type { ComfyInputBinding } from './entities/comfy-workflow.entity';

describe('ComfyUI 工作流提示词清理', () => {
  const bindings: ComfyInputBinding[] = [
    {
      key: 'positivePrompt',
      label: '正向提示词',
      type: 'textarea',
      nodeId: '67',
      inputKey: 'text',
      semanticRole: 'positivePrompt',
      required: true,
      defaultValue: '工作流内置的正向提示词',
    },
    {
      key: 'negativePrompt',
      label: '负向提示词',
      type: 'textarea',
      nodeId: '71',
      inputKey: 'text',
      semanticRole: 'negativePrompt',
      defaultValue: '工作流内置的负向提示词',
    },
    {
      key: 'steps',
      label: '采样步数',
      type: 'number',
      nodeId: '70',
      inputKey: 'steps',
      defaultValue: 8,
    },
  ];

  it('清空语义提示词默认值，但保留普通参数默认值', () => {
    const sanitized = withoutPromptBindingDefaults(bindings);
    expect(sanitized[0].defaultValue).toBe('');
    expect(sanitized[1].defaultValue).toBe('');
    expect(sanitized[2].defaultValue).toBe(8);
  });

  it('清空直接输入和连线上游文本节点中的示例提示词', () => {
    const graph = {
      '67': {
        class_type: 'CLIPTextEncode',
        inputs: { text: 'cinematic portrait', clip: ['62', 0] },
      },
      '70': {
        class_type: 'KSampler',
        inputs: {
          positive: ['67', 0],
          negative: ['71', 0],
          steps: 8,
        },
      },
      '71': {
        class_type: 'CLIPTextEncode',
        inputs: { text: 'low quality', clip: ['62', 0] },
      },
      '80': {
        class_type: 'CustomPromptNode',
        inputs: {
          positive_prompt: 'direct positive',
          negative_prompt: 'direct negative',
          model_name: 'model.safetensors',
        },
      },
    };
    expect(extractPromptExamples(graph, bindings)).toEqual({
      positivePrompt: 'cinematic portrait',
      negativePrompt: 'low quality',
    });

    const result = sanitizeComfyWorkflow(graph, bindings);

    expect(result.graph['67'].inputs.text).toBe('');
    expect(result.graph['71'].inputs.text).toBe('');
    expect(result.graph['80'].inputs.positive_prompt).toBe('');
    expect(result.graph['80'].inputs.negative_prompt).toBe('');
    expect(result.graph['80'].inputs.model_name).toBe('model.safetensors');
    expect(result.graph['70'].inputs.steps).toBe(8);
  });
});
