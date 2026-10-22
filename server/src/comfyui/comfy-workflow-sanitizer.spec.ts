import {
  extractPromptExamples,
  sanitizeComfyWorkflow,
  withDetectedMainPromptBinding,
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
    {
      key: 'videoMotion',
      label: '动作描述',
      type: 'textarea',
      nodeId: '75',
      inputKey: 'text',
      semanticRole: 'videoMotion',
      required: true,
      defaultValue: '工作流内置的动作描述',
    },
  ];

  it('清空语义提示词默认值，但保留普通参数默认值', () => {
    const sanitized = withoutPromptBindingDefaults(bindings);
    expect(sanitized[0].defaultValue).toBe('');
    expect(sanitized[1].defaultValue).toBe('');
    expect(sanitized[2].defaultValue).toBe(8);
    expect(sanitized[3].defaultValue).toBe('');
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
      '75': {
        class_type: 'CLIPTextEncode',
        inputs: { text: 'energetic street dance', clip: ['62', 0] },
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
    expect(result.graph['75'].inputs.text).toBe('');
    expect(result.graph['80'].inputs.positive_prompt).toBe('');
    expect(result.graph['80'].inputs.negative_prompt).toBe('');
    expect(result.graph['80'].inputs.model_name).toBe('model.safetensors');
    expect(result.graph['70'].inputs.steps).toBe(8);
  });

  it('把通用 prompt 识别为主提示词并保留系统提示词', () => {
    const userPrompt = 'Greyscale fashion editorial portrait';
    const systemPrompt = 'You are an image prompt rewriting expert';
    const graph = {
      '459:452': {
        class_type: 'TextEncodeQwenImage21',
        inputs: {
          prompt: ['459:472', 0],
          negative_prompt: '',
        },
      },
      '459:471': {
        class_type: 'TextGenerate',
        inputs: {
          prompt: userPrompt,
          system_prompt: ['459:475', 0],
        },
      },
      '459:472': {
        class_type: 'PreviewAny',
        inputs: { source: ['459:474', 0] },
      },
      '459:474': {
        class_type: 'ComfySwitchNode',
        inputs: {
          switch: false,
          on_false: userPrompt,
          on_true: ['459:471', 0],
        },
      },
      '459:475': {
        class_type: 'PrimitiveStringMultiline',
        inputs: { value: systemPrompt },
        _meta: { title: 'Text (System Prompt)' },
      },
    };

    const detected = withDetectedMainPromptBinding(graph, []);
    expect(detected).toEqual([
      expect.objectContaining({
        nodeId: '459:474',
        inputKey: 'on_false',
        semanticRole: 'mainPrompt',
      }),
    ]);
    expect(extractPromptExamples(graph, [])).toEqual({
      positivePrompt: userPrompt,
      negativePrompt: '',
    });
    const migrated = withDetectedMainPromptBinding(graph, [
      {
        key: 'positivePrompt',
        label: '正向提示词',
        type: 'textarea',
        nodeId: '459:474',
        inputKey: 'on_false',
        semanticRole: 'positivePrompt',
      },
    ]);
    expect(migrated[0]).toEqual(
      expect.objectContaining({
        label: '主提示词',
        semanticRole: 'mainPrompt',
      }),
    );

    const result = sanitizeComfyWorkflow(graph, []);
    expect(result.graph['459:474'].inputs.on_false).toBe('');
    expect(result.graph['459:471'].inputs.prompt).toBe(userPrompt);
    expect(result.graph['459:475'].inputs.value).toBe(systemPrompt);
    expect(result.bindings[0]).toEqual(
      expect.objectContaining({
        semanticRole: 'mainPrompt',
        defaultValue: '',
      }),
    );
  });
});
