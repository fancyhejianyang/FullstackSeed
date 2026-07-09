/**
 * 常规纯函数 / 转换方法集合
 * 业务无关的通用工具统一放在 utils/ 下，按用途拆分文件。
 */

/**
 * 格式化日期时间
 * @param value 日期、时间戳或日期字符串
 * @param withTime 是否包含时分秒，默认 true
 */
export function formatDateTime(
  value: Date | string | number,
  withTime = true,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  if (!withTime) return ymd;
  return `${ymd} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * 判断是否为空值（null / undefined / 空字符串）
 */
export function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}
