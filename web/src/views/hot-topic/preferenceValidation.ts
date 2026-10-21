import type { HotOptions, HotPreference } from '@/api/hotTopic';

/** An incomplete preference draft must never prevent disabling a schedule. */
export function scheduleValidationError(
  preference: HotPreference,
  options: HotOptions,
  canExecute: boolean,
): string | null {
  if (!preference.scheduleEnabled) return null;
  if (!canExecute)
    return '缺少热点执行权限，不能启用每日计划；仍可关闭计划并保存偏好';
  const config = options.aiConfigs.find(
    (item) => item.id === preference.aiConfigId,
  );
  if (preference.aiConfigId && !config)
    return 'AI 配置已失效，请重新选择或先关闭每日计划';
  const sources = options.sources.filter((source) =>
    preference.sourceIds.includes(source.id),
  );
  if (sources.length !== new Set(preference.sourceIds).size)
    return '来源已失效，请移除后启用每日计划';
  if (preference.mode !== 'aiSearch' && !sources.length)
    return '平台或混合模式至少选择一个来源';
  if (
    preference.mode === 'platform' &&
    sources.some((source) => source.accessMode === 'search')
  )
    return '所选来源需要 AI 搜索，请切换到 AI 联网或混合模式';
  if (
    preference.mode !== 'platform' &&
    (!config || config.webSearchMode === 'disabled')
  )
    return 'AI 搜索或混合模式需要选择已启用联网协议的热点 AI 配置';
  return null;
}
