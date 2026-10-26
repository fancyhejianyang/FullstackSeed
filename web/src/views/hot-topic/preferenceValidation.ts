import type { HotOptions, HotPreference } from "@/api/hotTopic";

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
  if (new Set(preference.sourceIds).size > 5) return "最多选择 5 个热点来源";
  return null;
}
