/**
 * 权限动作 → 配色/标签/图标/确认 映射工具。
 * 详见 `.design-spec.md`「操作按钮配色标准」。
 *
 * 规则：
 * - 按权限码 `Module.action` 的动作后缀判色，不区分模块。
 * - 未识别动作 → 'info' 灰色兜底。
 * - 三张映射表 key 完全一致，新增动作只改这一处文件。
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
  publish: 'success',
  unpublish: 'warning',
  disable: 'danger',
  enable: 'success',
  revoke: 'danger',
  reset: 'warning',
  approve: 'success',
  reject: 'danger',
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
  publish: '发布',
  unpublish: '取消发布',
  disable: '禁用',
  enable: '启用',
  revoke: '撤销',
  reset: '重置',
  approve: '通过',
  reject: '驳回',
};

/** 动作 → 内置图标组件名（Element Plus Icons，已在 main.ts 全局注册） */
const ACTION_ICON_MAP: Record<string, string> = {
  read: 'View',
  view: 'View',
  create: 'Plus',
  update: 'Edit',
  edit: 'Edit',
  delete: 'Delete',
  batchDelete: 'Delete',
  export: 'Download',
  import: 'Upload',
  audit: 'Checked',
  publish: 'Promotion',
  unpublish: 'SemiSelect',
  disable: 'CircleClose',
  enable: 'CircleCheck',
  revoke: 'RefreshLeft',
  reset: 'Refresh',
  approve: 'Select',
  reject: 'CloseBold',
};

/** 动作 → 二次确认默认文案 */
const ACTION_CONFIRM_TEXT_MAP: Record<string, string> = {
  delete: '确认删除该记录？',
  batchDelete: '确认批量删除选中的记录？',
  disable: '确认禁用该记录？',
  revoke: '确认撤销该操作？',
  reset: '确认重置？重置后不可恢复。',
  publish: '确认发布？',
  unpublish: '确认取消发布？',
  approve: '确认通过审核？',
  reject: '确认驳回？',
};

/** 需要二次确认的动作后缀集合 */
const DESTRUCTIVE_ACTIONS = new Set([
  'delete',
  'batchDelete',
  'disable',
  'revoke',
  'reset',
  'publish',
  'unpublish',
  'approve',
  'reject',
]);

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

/** 根据权限码返回内置图标组件名，未匹配返回 null */
export function getPermissionActionIcon(
  code: string | undefined | null,
): string | null {
  const action = getPermissionAction(code);
  return ACTION_ICON_MAP[action] ?? null;
}

/** 判断权限码对应动作是否需要二次确认 */
export function isDestructiveAction(
  code: string | undefined | null,
): boolean {
  const action = getPermissionAction(code);
  return DESTRUCTIVE_ACTIONS.has(action);
}

/** 根据权限码返回二次确认默认文案，未匹配返回 null */
export function getPermissionActionConfirmText(
  code: string | undefined | null,
): string | null {
  const action = getPermissionAction(code);
  return ACTION_CONFIRM_TEXT_MAP[action] ?? null;
}
