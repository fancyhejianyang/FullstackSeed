import type {
  ComfyBindingSemanticRole,
  ComfyBindingType,
  ComfyOutputType,
} from "@/api/comfyUi";

export interface ComfyApiNode {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title?: string };
}

export interface DetectedWorkflowBinding {
  key: string;
  label: string;
  type: ComfyBindingType;
  nodeId: string;
  inputKey: string;
  semanticRole: ComfyBindingSemanticRole;
  required: boolean;
  defaultValue: string | number | boolean | null;
  min?: number;
  max?: number;
  hint?: string;
}

export interface WorkflowDetectionResult {
  suggestedName: string;
  outputType: ComfyOutputType | null;
  targetModel: string;
  dependencyNotes: string;
  outputNodeIds: string[];
  bindings: DetectedWorkflowBinding[];
  sourcePrompt: string;
  sourceNegativePrompt: string;
}

type TextInput = { nodeId: string; inputKey: string; value: string };
type PromptInputs = Partial<
  Record<"positivePrompt" | "negativePrompt", TextInput>
>;

const MODEL_INPUT_PRIORITIES: Record<string, number> = {
  unet_name: 100,
  ckpt_name: 95,
  checkpoint_name: 95,
  diffusion_model: 90,
  model_name: 85,
  model_path: 80,
};

const nodeEntries = (graph: Record<string, ComfyApiNode>) =>
  Object.entries(graph).sort(([left], [right]) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );

const nodeText = (node: ComfyApiNode) =>
  `${node.class_type || ""} ${node._meta?.title || ""}`;

function linkedNodeId(
  value: unknown,
  graph: Record<string, ComfyApiNode>,
): string | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const id = String(value[0]);
  return graph[id] ? id : null;
}

function suggestName(fileName: string) {
  return fileName.replace(/\.json$/i, "").trim();
}

function detectOutputs(graph: Record<string, ComfyApiNode>) {
  const imageIds: string[] = [];
  const videoIds: string[] = [];
  for (const [id, node] of nodeEntries(graph)) {
    const text = nodeText(node);
    if (
      /(?:save|combine).*(?:video|animated|webm|gif)|vhs.*video|video.*(?:save|combine)/i.test(
        text,
      )
    ) {
      videoIds.push(id);
    } else if (/save.*image|image.*save/i.test(text)) {
      imageIds.push(id);
    }
  }
  if (videoIds.length) {
    return {
      outputType: "video" as const,
      outputNodeIds: [...videoIds, ...imageIds],
    };
  }
  if (imageIds.length) {
    return { outputType: "image" as const, outputNodeIds: imageIds };
  }
  return { outputType: null, outputNodeIds: [] };
}

function detectTargetModel(graph: Record<string, ComfyApiNode>) {
  let detected = { value: "", score: -1 };
  for (const [, node] of nodeEntries(graph)) {
    if (/clip|vae/i.test(nodeText(node))) continue;
    const loaderScore =
      /checkpoint|unet|diffusion|model.*loader|loader.*model/i.test(
        nodeText(node),
      )
        ? 20
        : 0;
    for (const [inputKey, value] of Object.entries(node.inputs || {})) {
      if (typeof value !== "string" || !value.trim()) continue;
      const inputScore = MODEL_INPUT_PRIORITIES[inputKey.toLowerCase()];
      if (inputScore === undefined) continue;
      const score = inputScore + loaderScore;
      if (score > detected.score) detected = { value: value.trim(), score };
    }
  }
  return detected.value;
}

function detectDependencies(graph: Record<string, ComfyApiNode>) {
  const dependencies: string[] = [];
  const seen = new Set<string>();
  for (const [, node] of nodeEntries(graph)) {
    if (!/loader|加载/i.test(nodeText(node))) continue;
    for (const [inputKey, value] of Object.entries(node.inputs || {})) {
      if (
        typeof value !== "string" ||
        !value.trim() ||
        !/(?:name|path|model|checkpoint|ckpt)$/i.test(inputKey)
      ) {
        continue;
      }
      const dependency = `${node._meta?.title || node.class_type}：${value.trim()}`;
      if (!seen.has(dependency)) {
        seen.add(dependency);
        dependencies.push(dependency);
      }
    }
  }
  return dependencies.length
    ? `自动识别的模型依赖：\n${dependencies.join("\n")}`
    : "";
}

function primitiveTextInput(
  nodeId: string,
  graph: Record<string, ComfyApiNode>,
): TextInput | null {
  const node = graph[nodeId];
  if (!node) return null;
  const preferredKeys = ["text", "prompt", "text_g", "text_l"];
  for (const inputKey of preferredKeys) {
    const value = node.inputs?.[inputKey];
    if (typeof value === "string") return { nodeId, inputKey, value };
  }
  if (!/text.*encode|prompt|conditioning/i.test(nodeText(node))) return null;
  const fallback = Object.entries(node.inputs || {}).find(
    ([, value]) => typeof value === "string",
  );
  return fallback
    ? { nodeId, inputKey: fallback[0], value: String(fallback[1]) }
    : null;
}

function traceTextInput(
  startId: string,
  graph: Record<string, ComfyApiNode>,
): TextInput | null {
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
    for (const value of Object.values(node.inputs || {})) {
      const linkedId = linkedNodeId(value, graph);
      if (linkedId && !visited.has(linkedId)) queue.push(linkedId);
    }
  }
  return null;
}

function detectPromptInputs(graph: Record<string, ComfyApiNode>) {
  const found: PromptInputs = {};
  for (const [nodeId, node] of nodeEntries(graph)) {
    for (const [inputKey, value] of Object.entries(node.inputs || {})) {
      const normalized = inputKey.toLowerCase();
      const role = normalized.includes("negative")
        ? "negativePrompt"
        : normalized.includes("positive")
          ? "positivePrompt"
          : null;
      if (!role || found[role]) continue;
      if (typeof value === "string") {
        found[role] = { nodeId, inputKey, value };
        continue;
      }
      const linkedId = linkedNodeId(value, graph);
      if (linkedId) found[role] = traceTextInput(linkedId, graph) || undefined;
    }
  }

  const unassigned: TextInput[] = [];
  for (const [nodeId, node] of nodeEntries(graph)) {
    const textInput = primitiveTextInput(nodeId, graph);
    if (!textInput) continue;
    const text = nodeText(node);
    if (/negative|负面|负向|反向/i.test(text) && !found.negativePrompt) {
      found.negativePrompt = textInput;
    } else if (/positive|正面|正向/i.test(text) && !found.positivePrompt) {
      found.positivePrompt = textInput;
    } else {
      unassigned.push(textInput);
    }
  }
  if (!found.positivePrompt && unassigned.length === 1) {
    found.positivePrompt = unassigned[0];
  }
  return found;
}

function uniqueBindingKey(
  baseKey: string,
  bindings: DetectedWorkflowBinding[],
) {
  const used = new Set(bindings.map((item) => item.key));
  if (!used.has(baseKey)) return baseKey;
  let suffix = 2;
  while (used.has(`${baseKey}${suffix}`)) suffix += 1;
  return `${baseKey}${suffix}`;
}

function detectBindings(
  graph: Record<string, ComfyApiNode>,
  prompts: PromptInputs,
) {
  const bindings: DetectedWorkflowBinding[] = [];
  const mappedInputs = new Set<string>();
  const add = (
    binding: Omit<DetectedWorkflowBinding, "key"> & { key: string },
  ) => {
    const identity = `${binding.nodeId}:${binding.inputKey}`;
    if (mappedInputs.has(identity)) return;
    mappedInputs.add(identity);
    bindings.push({
      ...binding,
      key: uniqueBindingKey(binding.key, bindings),
    });
  };

  if (prompts.positivePrompt) {
    const prompt = prompts.positivePrompt;
    add({
      key: "positivePrompt",
      label: "正向提示词",
      type: "textarea",
      nodeId: prompt.nodeId,
      inputKey: prompt.inputKey,
      semanticRole: "positivePrompt",
      required: true,
      defaultValue: "",
      hint: "描述希望生成的主体、场景、构图、光影与风格",
    });
  }
  if (prompts.negativePrompt) {
    const prompt = prompts.negativePrompt;
    add({
      key: "negativePrompt",
      label: "负向提示词",
      type: "textarea",
      nodeId: prompt.nodeId,
      inputKey: prompt.inputKey,
      semanticRole: "negativePrompt",
      required: false,
      defaultValue: "",
      hint: "描述需要避免的画面问题与元素",
    });
  }

  const numericRules = [
    {
      inputKey: "seed",
      key: "seed",
      label: "随机种子",
      type: "seed" as const,
      hint: "留空时由系统为每次任务生成随机种子",
    },
    {
      inputKey: "noise_seed",
      key: "seed",
      label: "随机种子",
      type: "seed" as const,
      hint: "留空时由系统为每次任务生成随机种子",
    },
    {
      inputKey: "steps",
      key: "steps",
      label: "采样步数",
      type: "number" as const,
      min: 1,
      max: 1000,
    },
    {
      inputKey: "cfg",
      key: "cfg",
      label: "CFG 引导强度",
      type: "number" as const,
      min: 0,
      max: 100,
    },
    {
      inputKey: "cfg_scale",
      key: "cfg",
      label: "CFG 引导强度",
      type: "number" as const,
      min: 0,
      max: 100,
    },
    {
      inputKey: "denoise",
      key: "denoise",
      label: "降噪强度",
      type: "number" as const,
      min: 0,
      max: 1,
    },
  ];
  const samplerNodes = nodeEntries(graph).filter(([, node]) =>
    /sampler|采样/i.test(nodeText(node)),
  );
  for (const rule of numericRules) {
    const target = samplerNodes.find(
      ([, node]) => typeof node.inputs?.[rule.inputKey] === "number",
    );
    if (!target) continue;
    add({
      ...rule,
      nodeId: target[0],
      inputKey: rule.inputKey,
      semanticRole: "normal",
      required: false,
      defaultValue: target[1].inputs[rule.inputKey] as number,
    });
  }

  const dimensionRules = [
    { inputKey: "width", key: "width", label: "画面宽度", min: 64, max: 8192 },
    {
      inputKey: "height",
      key: "height",
      label: "画面高度",
      min: 64,
      max: 8192,
    },
    {
      inputKey: "batch_size",
      key: "batchSize",
      label: "生成数量",
      min: 1,
      max: 64,
    },
  ];
  const latentNodes = nodeEntries(graph).filter(([, node]) =>
    /latent|empty.*image|空.*图像/i.test(nodeText(node)),
  );
  for (const rule of dimensionRules) {
    const target = latentNodes.find(
      ([, node]) => typeof node.inputs?.[rule.inputKey] === "number",
    );
    if (!target) continue;
    add({
      ...rule,
      type: "number",
      nodeId: target[0],
      inputKey: rule.inputKey,
      semanticRole: "normal",
      required: false,
      defaultValue: target[1].inputs[rule.inputKey] as number,
    });
  }

  const imageLoader = nodeEntries(graph).find(
    ([, node]) =>
      /load.*image|image.*loader|加载.*图像/i.test(nodeText(node)) &&
      typeof node.inputs?.image === "string",
  );
  if (imageLoader) {
    add({
      key: "inputImage",
      label: "输入图片",
      type: "image",
      nodeId: imageLoader[0],
      inputKey: "image",
      semanticRole: "normal",
      required: true,
      defaultValue: "",
      hint: "运行时从 ComfyUI 素材库选择图片",
    });
  }

  const outputPrefix = nodeEntries(graph).find(
    ([, node]) =>
      /save|保存/i.test(nodeText(node)) &&
      typeof node.inputs?.filename_prefix === "string",
  );
  if (outputPrefix) {
    add({
      key: "outputPrefix",
      label: "输出前缀",
      type: "outputPrefix",
      nodeId: outputPrefix[0],
      inputKey: "filename_prefix",
      semanticRole: "normal",
      required: false,
      defaultValue: "",
      hint: "由系统按任务自动生成，避免不同任务文件混淆",
    });
  }
  return bindings;
}

export function detectComfyWorkflow(
  graph: Record<string, ComfyApiNode>,
  fileName = "",
): WorkflowDetectionResult {
  const outputs = detectOutputs(graph);
  const prompts = detectPromptInputs(graph);
  return {
    suggestedName: suggestName(fileName),
    outputType: outputs.outputType,
    targetModel: detectTargetModel(graph),
    dependencyNotes: detectDependencies(graph),
    outputNodeIds: outputs.outputNodeIds,
    bindings: detectBindings(graph, prompts),
    sourcePrompt: prompts.positivePrompt?.value.trim() || "",
    sourceNegativePrompt: prompts.negativePrompt?.value.trim() || "",
  };
}
