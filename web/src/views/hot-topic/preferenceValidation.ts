import type { HotOptions, HotPreference } from "@/api/hotTopic";

export function supportsHotSearchMode(
  mode: HotOptions["aiConfigs"][number]["webSearchMode"] | undefined,
): boolean {
  return mode === "bailianResponses" || mode === "tokenhubSearch";
}

/** 混合模式只在没有可直读来源时才必须依赖 AI 搜索。 */
export function preferenceRequiresSearch(
  mode: HotPreference["mode"],
  sources: Pick<HotOptions["sources"][number], "kind" | "accessMode">[],
): boolean {
  if (mode === "platform") return false;
  if (mode === "aiSearch")
    return (
      !sources.length || sources.some((source) => source.kind !== "neteaseNews")
    );
  return !sources.some(
    (source) => source.kind === "neteaseNews" || source.accessMode === "page",
  );
}

/** An incomplete preference form must never prevent disabling a schedule. */
export function scheduleValidationError(
  preference: HotPreference,
  options: HotOptions,
  canExecute: boolean,
): string | null {
  if (!preference.scheduleEnabled) return null;
  if (!canExecute)
    return "缺少热点执行权限，不能启用每日计划；仍可关闭计划并保存偏好";
  const config = options.aiConfigs.find(
    (item) => item.id === preference.aiConfigId,
  );
  if (preference.aiConfigId && !config)
    return "AI 配置已失效，请重新选择或先关闭每日计划";
  const sources = options.sources.filter((source) =>
    preference.sourceIds.includes(source.id),
  );
  if (sources.length !== new Set(preference.sourceIds).size)
    return "来源已失效，请移除后启用每日计划";
  if (preference.mode !== "aiSearch" && !sources.length)
    return "平台或混合模式至少选择一个来源";
  if (
    preference.mode === "platform" &&
    sources.some(
      (source) =>
        source.kind !== "neteaseNews" && source.accessMode === "search",
    )
  )
    return "所选来源需要 AI 搜索，请切换到 AI 联网或混合模式";
  if (
    preferenceRequiresSearch(preference.mode, sources) &&
    !supportsHotSearchMode(config?.webSearchMode)
  )
    return "当前获取方式需要已启用原生联网协议的热点 AI 配置（百炼 Responses 或腾讯 TokenHub）；仅需平台采集和普通 AI 推荐时，请改选“平台来源”";
  return null;
}
