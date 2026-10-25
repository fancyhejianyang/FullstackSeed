import assert from "node:assert/strict";
import { test } from "node:test";
import { detectModelPlatform } from "./modelPlatform.ts";

test("账号编辑实时识别官方平台域名", () => {
  for (const address of [
    "https://tokenhub.tencentmaas.com/v1",
    "https://tokenhub-intl.tencentmaas.com/v1",
    "https://tokenhub-intl.tencentcloudmaas.com/v1",
    "https://TOKENHUB.TENCENTMAAS.COM./v1",
  ]) {
    assert.equal(detectModelPlatform(address), "tencentTokenhub");
  }
  for (const address of [
    "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "https://dashscope-intl.aliyuncs.com/api/v1",
    "https://cn-hongkong.dashscope.aliyuncs.com/api/v1",
    "https://coding.dashscope.aliyuncs.com/v1",
    "https://workspace.cn-beijing.maas.aliyuncs.com/api/v1",
    "https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
  ]) {
    assert.equal(detectModelPlatform(address), "aliyunBailian");
  }
});

test("自定义中转、伪装域名和编辑中的非法地址不冒充官方平台", () => {
  for (const address of [
    "",
    "not-a-url",
    "https://proxy.example/dashscope.aliyuncs.com",
    "https://tokenhub.tencentmaas.com.evil.example/v1",
    "https://dashscope.aliyuncs.com.evil.example",
    "https://dashscope.aliyuncs.com@evil.example/v1",
    "https://user:password@tokenhub.tencentmaas.com/v1",
  ]) {
    assert.equal(detectModelPlatform(address), "custom");
  }
});
