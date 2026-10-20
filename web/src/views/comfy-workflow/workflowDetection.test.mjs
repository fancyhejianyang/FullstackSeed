import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("./workflowDetection.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const module = { exports: {} };
new Function("exports", "module", compiled)(module.exports, module);
const { detectComfyWorkflow } = module.exports;

const imageWorkflow = {
  9: {
    inputs: { filename_prefix: "ComfyUI", images: ["65", 0] },
    class_type: "SaveImage",
    _meta: { title: "保存图像" },
  },
  62: {
    inputs: {
      clip_name: "qwen_3_4b.safetensors",
      type: "lumina2",
      device: "default",
    },
    class_type: "CLIPLoader",
    _meta: { title: "加载CLIP" },
  },
  63: {
    inputs: { vae_name: "ae.safetensors" },
    class_type: "VAELoader",
    _meta: { title: "加载VAE" },
  },
  65: {
    inputs: { samples: ["70", 0], vae: ["63", 0] },
    class_type: "VAEDecode",
    _meta: { title: "VAE解码" },
  },
  66: {
    inputs: {
      unet_name: "z_image_turbo_bf16.safetensors",
      weight_dtype: "default",
    },
    class_type: "UNETLoader",
    _meta: { title: "UNet加载器" },
  },
  67: {
    inputs: { text: "anime RPG game style", clip: ["62", 0] },
    class_type: "CLIPTextEncode",
    _meta: { title: "CLIP文本编码" },
  },
  68: {
    inputs: { width: 1024, height: 1024, batch_size: 1 },
    class_type: "EmptySD3LatentImage",
    _meta: { title: "空Latent图像（SD3）" },
  },
  69: {
    inputs: { shift: 3, sampling: "flow", model: ["66", 0] },
    class_type: "ModelSamplingAuraFlow",
    _meta: { title: "采样算法（AuraFlow）" },
  },
  70: {
    inputs: {
      seed: 42,
      steps: 8,
      cfg: 1,
      sampler_name: "res_multistep",
      scheduler: "simple",
      denoise: 1,
      model: ["69", 0],
      positive: ["67", 0],
      negative: ["71", 0],
      latent_image: ["68", 0],
    },
    class_type: "KSampler",
    _meta: { title: "K采样器" },
  },
  71: {
    inputs: { text: "low quality, bad anatomy", clip: ["62", 0] },
    class_type: "CLIPTextEncode",
    _meta: { title: "CLIP文本编码" },
  },
};

test("识别 ComfyUI 生图样本的模型、输出、提示词和常用参数", () => {
  const result = detectComfyWorkflow(imageWorkflow, "测试工作流-生图.json");
  assert.equal(result.suggestedName, "测试工作流-生图");
  assert.equal(result.outputType, "image");
  assert.equal(result.targetModel, "z_image_turbo_bf16.safetensors");
  assert.deepEqual(result.outputNodeIds, ["9"]);
  assert.match(result.dependencyNotes, /qwen_3_4b\.safetensors/);
  assert.match(result.dependencyNotes, /ae\.safetensors/);
  assert.match(result.dependencyNotes, /z_image_turbo_bf16\.safetensors/);

  const byKey = Object.fromEntries(
    result.bindings.map((binding) => [binding.key, binding]),
  );
  assert.deepEqual(
    [byKey.positivePrompt.nodeId, byKey.positivePrompt.inputKey],
    ["67", "text"],
  );
  assert.equal(byKey.positivePrompt.semanticRole, "positivePrompt");
  assert.equal(byKey.positivePrompt.defaultValue, "");
  assert.deepEqual(
    [byKey.negativePrompt.nodeId, byKey.negativePrompt.inputKey],
    ["71", "text"],
  );
  assert.equal(byKey.negativePrompt.semanticRole, "negativePrompt");
  assert.equal(byKey.negativePrompt.defaultValue, "");
  assert.deepEqual(
    ["seed", "steps", "cfg", "denoise", "width", "height", "batchSize"].map(
      (key) => [key, byKey[key].defaultValue],
    ),
    [
      ["seed", 42],
      ["steps", 8],
      ["cfg", 1],
      ["denoise", 1],
      ["width", 1024],
      ["height", 1024],
      ["batchSize", 1],
    ],
  );
  assert.equal(byKey.outputPrefix.type, "outputPrefix");
});

test("识别视频输出和图生视频输入，但不把原文件名当素材默认值", () => {
  const result = detectComfyWorkflow({
    1: {
      inputs: { image: "example.png", upload: "image" },
      class_type: "LoadImage",
      _meta: { title: "加载图像" },
    },
    2: {
      inputs: { images: ["1", 0], filename_prefix: "video" },
      class_type: "VHS_VideoCombine",
      _meta: { title: "合并视频" },
    },
  });
  assert.equal(result.outputType, "video");
  assert.deepEqual(result.outputNodeIds, ["2"]);
  const image = result.bindings.find((binding) => binding.key === "inputImage");
  assert.equal(image?.type, "image");
  assert.equal(image?.required, true);
  assert.equal(image?.defaultValue, "");
});

test("直接提示词可以映射，且 CLIP/VAE 依赖不会被误判为主模型", () => {
  const result = detectComfyWorkflow({
    1: {
      inputs: { model_name: "text_encoder.safetensors" },
      class_type: "CLIPLoader",
      _meta: { title: "加载CLIP" },
    },
    2: {
      inputs: {
        positive_prompt: "cinematic lighting",
        negative_prompt: "low quality",
      },
      class_type: "CustomGenerateNode",
      _meta: { title: "生成节点" },
    },
    3: {
      inputs: { images: ["2", 0] },
      class_type: "SaveImage",
      _meta: { title: "保存图像" },
    },
  });
  assert.equal(result.targetModel, "");
  const positive = result.bindings.find(
    (binding) => binding.semanticRole === "positivePrompt",
  );
  const negative = result.bindings.find(
    (binding) => binding.semanticRole === "negativePrompt",
  );
  assert.deepEqual(
    [positive?.nodeId, positive?.inputKey],
    ["2", "positive_prompt"],
  );
  assert.deepEqual(
    [negative?.nodeId, negative?.inputKey],
    ["2", "negative_prompt"],
  );
  assert.equal(positive?.defaultValue, "");
  assert.equal(negative?.defaultValue, "");
});
