import assert from "node:assert/strict";
import { test } from "node:test";
import {
  removedModelMatchesSelection,
  removeRetiredModelOptions,
} from "./retiredModelOptions.ts";

const retired = {
  modelRemoved: true,
  providerId: 1,
  model: "deepseek-v4-flash",
};

test("只从当前账号各目录精确移除编码，保留相似版本和显示名称", () => {
  const provider = {
    id: 1,
    models:
      "deepseek-v4-flash # 旧版\r\ndeepseek-v4-flash-202605 # 新版\r\nglm-5.3 # deepseek-v4-flash",
    textModels: "deepseek-v4-flash\nglm-5.3",
    visionModels: "deepseek-v4-flash # 视觉",
    imageGenerationModels: "deepseek-v4-flash",
    videoGenerationModels: "hy-video-v1.5",
    embeddingModels: null,
  };
  const other = { id: 2, models: "deepseek-v4-flash" };
  const result = removeRetiredModelOptions([provider, other], retired);
  assert.deepEqual(result[0], {
    ...provider,
    models: "deepseek-v4-flash-202605 # 新版\nglm-5.3 # deepseek-v4-flash",
    textModels: "glm-5.3",
    visionModels: "",
    imageGenerationModels: "",
  });
  assert.equal(result[1], other);
  assert.equal(provider.visionModels, "deepseek-v4-flash # 视觉");
});

test("欠费、普通失败和缺少账号标识的结果不移除目录", () => {
  const providers = [{ id: 1, models: "deepseek-v4-flash" }];
  for (const result of [
    { providerId: 1, model: retired.model },
    { ...retired, modelRemoved: false },
    { ...retired, providerId: undefined },
    { ...retired, model: "" },
  ])
    assert.equal(removeRetiredModelOptions(providers, result), providers);
});

test("只清空被移除的当前账号与模型，不影响切换后的选择", () => {
  assert.equal(removedModelMatchesSelection(retired, "1", retired.model), true);
  assert.equal(removedModelMatchesSelection(retired, 2, retired.model), false);
  assert.equal(
    removedModelMatchesSelection(retired, 1, "deepseek-v4-flash-202605"),
    false,
  );
  assert.equal(removedModelMatchesSelection(retired, 1, ""), false);
  assert.equal(
    removedModelMatchesSelection(
      { ...retired, modelRemoved: false },
      1,
      retired.model,
    ),
    false,
  );
});

test("重复移除保持幂等，空目录保持为空且不补默认模型", () => {
  const providers = [{ id: 1, models: retired.model, textModels: "" }];
  const removed = removeRetiredModelOptions(providers, retired);
  assert.deepEqual(removed, [{ id: 1, models: "", textModels: "" }]);
  assert.deepEqual(removeRetiredModelOptions(removed, retired), removed);
});
