import type { ComfyInputBinding } from './entities/comfy-workflow.entity';

export interface ComfyApiNode {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}

export type ComfyApiGraph = Record<string, ComfyApiNode>;

export interface ComfyPromptExamples {
  positivePrompt: string;
  negativePrompt: string;
}

type TextInput = { nodeId: string; inputKey: string; value: string };

const PRIMARY_PROMPT_ROLES = new Set(['mainPrompt', 'positivePrompt']);
const PROMPT_ROLES = new Set([
  'mainPrompt',
  'positivePrompt',
  'negativePrompt',
]);

const PROMPT_VALUE_KEYS = new Set([
  'text',
  'prompt',
  'text_g',
  'text_l',
  'positive_prompt',
  'negative_prompt',
]);

function nodeText(node: ComfyApiNode) {
  const title =
    node._meta && typeof node._meta.title === 'string' ? node._meta.title : '';
  return `${node.class_type} ${title}`;
}

function isSystemPromptKey(inputKey: string) {
  return /system[_\s-]*prompt|system[_\s-]*instruction/i.test(inputKey);
}

function isSystemPromptNode(node: ComfyApiNode) {
  return /system[_\s-]*prompt|system[_\s-]*instruction|系统提示词/i.test(
    nodeText(node),
  );
}

function linkedNodeId(value: unknown, graph: ComfyApiGraph) {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const id = String(value[0]);
  return graph[id] ? id : null;
}

function clearPromptValues(node: ComfyApiNode) {
  for (const [key, value] of Object.entries(node.inputs)) {
    if (PROMPT_VALUE_KEYS.has(key.toLowerCase()) && typeof value === 'string') {
      node.inputs[key] = '';
    }
  }
}

function activeSwitchInput(node: ComfyApiNode): TextInput | null {
  if (typeof node.inputs.switch !== 'boolean') return null;
  const inputKey = node.inputs.switch ? 'on_true' : 'on_false';
  const value = node.inputs[inputKey];
  return typeof value === 'string' && value.trim()
    ? { nodeId: '', inputKey, value }
    : null;
}

function primitiveTextInput(
  nodeId: string,
  graph: ComfyApiGraph,
): TextInput | null {
  const node = graph[nodeId];
  if (!node || isSystemPromptNode(node)) return null;
  const activeSwitch = activeSwitchInput(node);
  if (activeSwitch) return { ...activeSwitch, nodeId };
  for (const inputKey of ['prompt', 'text', 'text_g', 'text_l']) {
    const value = node.inputs[inputKey];
    if (typeof value === 'string' && value.trim()) {
      return { nodeId, inputKey, value };
    }
  }
  if (
    !/text.*encode|prompt|conditioning|文本.*编码|提示词/i.test(nodeText(node))
  ) {
    return null;
  }
  const fallback = Object.entries(node.inputs).find(
    ([inputKey, value]) =>
      !isSystemPromptKey(inputKey) && typeof value === 'string' && value.trim(),
  );
  return fallback
    ? { nodeId, inputKey: fallback[0], value: fallback[1] as string }
    : null;
}

function upstreamEntries(node: ComfyApiNode) {
  if (typeof node.inputs.switch === 'boolean') {
    const selectedKey = node.inputs.switch ? 'on_true' : 'on_false';
    return [[selectedKey, node.inputs[selectedKey]]] as Array<
      [string, unknown]
    >;
  }
  return Object.entries(node.inputs).filter(
    ([inputKey]) => !isSystemPromptKey(inputKey),
  );
}

function traceTextInput(startId: string, graph: ComfyApiGraph) {
  const queue = [startId];
  const visited = new Set<string>();
  while (queue.length) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    const textInput = primitiveTextInput(nodeId, graph);
    if (textInput) return textInput;
    const node = graph[nodeId];
    if (!node) continue;
    for (const [, value] of upstreamEntries(node)) {
      const linkedId = linkedNodeId(value, graph);
      if (linkedId && !visited.has(linkedId)) queue.push(linkedId);
    }
  }
  return null;
}

function detectMainPromptInput(graph: ComfyApiGraph): TextInput | null {
  const linkedCandidates: TextInput[] = [];
  const directCandidates: TextInput[] = [];
  for (const [nodeId, node] of Object.entries(graph)) {
    if (isSystemPromptNode(node)) continue;
    const value = node.inputs.prompt;
    if (typeof value === 'string' && value.trim()) {
      directCandidates.push({ nodeId, inputKey: 'prompt', value });
      continue;
    }
    const linkedId = linkedNodeId(value, graph);
    if (linkedId) {
      const traced = traceTextInput(linkedId, graph);
      if (traced) linkedCandidates.push(traced);
    }
  }
  if (linkedCandidates.length) return linkedCandidates[0];
  if (directCandidates.length === 1) return directCandidates[0];

  const fallback = Object.keys(graph)
    .map((nodeId) => primitiveTextInput(nodeId, graph))
    .filter((item): item is TextInput => Boolean(item));
  const unique = fallback.filter(
    (item, index) =>
      fallback.findIndex(
        (candidate) =>
          candidate.nodeId === item.nodeId &&
          candidate.inputKey === item.inputKey,
      ) === index,
  );
  return unique.length === 1 ? unique[0] : null;
}

export function withDetectedMainPromptBinding(
  graph: ComfyApiGraph,
  bindings: ComfyInputBinding[],
) {
  if (bindings.some((binding) => binding.semanticRole === 'mainPrompt')) {
    return bindings.map((binding) => ({ ...binding }));
  }
  const prompt = detectMainPromptInput(graph);
  const positiveIndex = bindings.findIndex(
    (binding) => binding.semanticRole === 'positivePrompt',
  );
  if (positiveIndex >= 0) {
    const positive = bindings[positiveIndex];
    if (
      !prompt ||
      positive.nodeId !== prompt.nodeId ||
      positive.inputKey !== prompt.inputKey
    ) {
      return bindings.map((binding) => ({ ...binding }));
    }
    return bindings
      .filter(
        (binding, index) =>
          index === positiveIndex ||
          binding.semanticRole !== 'negativePrompt' ||
          binding.nodeId !== prompt.nodeId ||
          binding.inputKey !== prompt.inputKey,
      )
      .map((binding) =>
        binding === positive
          ? {
              ...binding,
              label: '主提示词',
              semanticRole: 'mainPrompt' as const,
              required: true,
              defaultValue: '',
            }
          : { ...binding },
      );
  }
  if (!prompt) return bindings.map((binding) => ({ ...binding }));
  const existingIndex = bindings.findIndex(
    (binding) =>
      binding.nodeId === prompt.nodeId && binding.inputKey === prompt.inputKey,
  );
  if (existingIndex >= 0) {
    return bindings.map((binding, index) =>
      index === existingIndex
        ? {
            ...binding,
            label: binding.label || '主提示词',
            semanticRole: 'mainPrompt' as const,
            required: true,
            defaultValue: '',
          }
        : { ...binding },
    );
  }
  const usedKeys = new Set(bindings.map((binding) => binding.key));
  let key = 'mainPrompt';
  let suffix = 2;
  while (usedKeys.has(key)) key = `mainPrompt${suffix++}`;
  return [
    ...bindings.map((binding) => ({ ...binding })),
    {
      key,
      label: '主提示词',
      type: 'textarea' as const,
      nodeId: prompt.nodeId,
      inputKey: prompt.inputKey,
      semanticRole: 'mainPrompt' as const,
      required: true,
      defaultValue: '',
      hint: '描述本次希望生成的主体、场景、构图、光影与风格',
    },
  ];
}

function clearLinkedPromptBranch(startId: string, graph: ComfyApiGraph) {
  const queue = [startId];
  const visited = new Set<string>();
  while (queue.length) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    const node = graph[nodeId];
    if (!node) continue;
    clearPromptValues(node);
    for (const [, value] of upstreamEntries(node)) {
      const linkedId = linkedNodeId(value, graph);
      if (linkedId && !visited.has(linkedId)) queue.push(linkedId);
    }
  }
}

export function withoutPromptBindingDefaults(bindings: ComfyInputBinding[]) {
  return bindings.map((binding) =>
    PROMPT_ROLES.has(binding.semanticRole ?? 'normal')
      ? { ...binding, defaultValue: '' }
      : { ...binding },
  );
}

export function extractPromptExamples(
  graph: ComfyApiGraph,
  bindings: ComfyInputBinding[],
): ComfyPromptExamples {
  const examples: ComfyPromptExamples = {
    positivePrompt: '',
    negativePrompt: '',
  };
  for (const binding of withDetectedMainPromptBinding(graph, bindings)) {
    const semanticRole = binding.semanticRole ?? 'normal';
    if (!PROMPT_ROLES.has(semanticRole)) continue;
    const value = graph[binding.nodeId]?.inputs?.[binding.inputKey];
    if (typeof value !== 'string' || !value.trim()) continue;
    if (PRIMARY_PROMPT_ROLES.has(semanticRole)) {
      examples.positivePrompt = value.trim();
    } else if (semanticRole === 'negativePrompt') {
      examples.negativePrompt = value.trim();
    }
  }
  return examples;
}

export function sanitizeComfyWorkflow(
  graph: ComfyApiGraph,
  bindings: ComfyInputBinding[],
) {
  const sanitizedBindings = withoutPromptBindingDefaults(
    withDetectedMainPromptBinding(graph, bindings),
  );

  for (const binding of sanitizedBindings) {
    if (!PROMPT_ROLES.has(binding.semanticRole ?? 'normal')) {
      continue;
    }
    const node = graph[binding.nodeId];
    if (node && typeof node.inputs[binding.inputKey] === 'string') {
      node.inputs[binding.inputKey] = '';
    }
  }

  for (const node of Object.values(graph)) {
    for (const [inputKey, value] of Object.entries(node.inputs)) {
      const normalizedKey = inputKey.toLowerCase();
      if (
        typeof value === 'string' &&
        (normalizedKey.includes('positive') ||
          normalizedKey.includes('negative'))
      ) {
        node.inputs[inputKey] = '';
      }
      if (
        normalizedKey.includes('positive') ||
        normalizedKey.includes('negative')
      ) {
        const linkedId = linkedNodeId(value, graph);
        if (linkedId) clearLinkedPromptBranch(linkedId, graph);
      }
    }
  }

  return { graph, bindings: sanitizedBindings };
}
