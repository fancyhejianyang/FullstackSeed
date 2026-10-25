export type ModelPlatform = "tencentTokenhub" | "aliyunBailian" | "custom";
export const modelPlatformLabels: Record<ModelPlatform, string> = {
  tencentTokenhub: "腾讯 TokenHub",
  aliyunBailian: "阿里云百炼",
  custom: "自定义平台",
};

/** 与服务端 detectModelPlatform 对齐；最终平台类型始终以服务端响应为准。 */
export function detectModelPlatform(value: string): ModelPlatform {
  try {
    const url = new URL(value.trim());
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return "custom";
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      [
        "tokenhub.tencentmaas.com",
        "tokenhub-intl.tencentmaas.com",
        "tokenhub-intl.tencentcloudmaas.com",
      ].includes(host)
    )
      return "tencentTokenhub";
    if (
      [
        "dashscope.aliyuncs.com",
        "dashscope-intl.aliyuncs.com",
        "dashscope-us.aliyuncs.com",
      ].includes(host) ||
      host.endsWith(".dashscope.aliyuncs.com") ||
      /^[a-z0-9-]+\.(?:cn-beijing|ap-southeast-1|ap-northeast-1|eu-central-1|us-east-1|cn-hongkong)\.maas\.aliyuncs\.com$/.test(
        host,
      )
    )
      return "aliyunBailian";
  } catch {
    /* 无效或编辑中的地址显示自定义平台。 */
  }
  return "custom";
}
