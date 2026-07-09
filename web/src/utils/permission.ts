/**
 * 权限动作 → 配色/标签 映射工具。
 * 详见 `.design-spec.md`「操作按钮配色标准」。
 *
 * 规则：
 * - 按权限码 `Module.action` 的动作后缀判色，不区分模块。
 * - 未识别动作 → 'info' 灰色兜底。
 */

export type ElementSemanticType =
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

/** 动作 → Element Plus tag/button `type` 语义值 */
const ACTION_TYPE_MAP: Record<string, ElementSemanticType> = {
  read: 'info',
  view: 'info',
  create: 'success',
  update: 'primary',
  edit: 'primary',
  delete: 'danger',
  batchDelete: 'danger',
  export: 'warning',
  import: 'warning',
  audit: 'warning',
};

/** 动作 → 中文短标签（可选用于短文案展示） */
const ACTION_LABEL_MAP: Record<string, string> = {
  read: '查看',
  view: '查看',
  create: '新增',
  update: '编辑',
  edit: '编辑',
  delete: '删除',
  batchDelete: '批量删除',
  export: '导出',
  import: '导入',
  audit: '审核',
};

/** 从权限码提取动作后缀（`.` 之后的部分） */
export function getPermissionAction(code: string | undefined | null): string {
  if (!code) return '';
  const idx = code.indexOf('.');
  return idx >= 0 ? code.slice(idx + 1) : code;
}

/** 根据权限码返回 Element Plus 语义类型（tag/button `type`） */
export function getPermissionActionColor(
  code: string | undefined | null,
): ElementSemanticType {
  const action = getPermissionAction(code);
  return ACTION_TYPE_MAP[action] ?? 'info';
}

/** 根据权限码返回中文动作标签，未识别则返回原动作字符串 */
export function getPermissionActionLabel(
  code: string | undefined | null,
): string {
  const action = getPermissionAction(code);
  return ACTION_LABEL_MAP[action] ?? action;
}
