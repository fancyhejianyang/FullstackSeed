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
    for (const value of Object.values(node.inputs)) {
      const linkedId = linkedNodeId(value, graph);
      if (linkedId && !visited.has(linkedId)) queue.push(linkedId);
    }
  }
}

export function withoutPromptBindingDefaults(bindings: ComfyInputBinding[]) {
  return bindings.map((binding) =>
    ['positivePrompt', 'negativePrompt'].includes(
      binding.semanticRole ?? 'normal',
    )
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
  for (const binding of bindings) {
    const semanticRole = binding.semanticRole ?? 'normal';
    if (!['positivePrompt', 'negativePrompt'].includes(semanticRole)) continue;
    const value = graph[binding.nodeId]?.inputs?.[binding.inputKey];
    if (typeof value !== 'string' || !value.trim()) continue;
    if (semanticRole === 'positivePrompt') {
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
  const sanitizedBindings = withoutPromptBindingDefaults(bindings);

  for (const binding of sanitizedBindings) {
    if (
      !['positivePrompt', 'negativePrompt'].includes(
        binding.semanticRole ?? 'normal',
      )
    ) {
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
    if (
      /clip.*text|text.*encode|prompt|conditioning|文本.*编码|提示词/i.test(
        nodeText(node),
      )
    ) {
      clearPromptValues(node);
    }
  }

  return { graph, bindings: sanitizedBindings };
}
