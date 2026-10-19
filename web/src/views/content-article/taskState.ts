import type { ContentTask, ContentTaskStatus } from '@/api/contentArticle';
import { getPermissionActionColor } from '@/utils/permission';

export const taskLabels: Record<ContentTaskStatus, string> = {
  pending: '排队中',
  running: '生成中',
  succeeded: '待采用',
  failed: '失败',
  interrupted: '已中断',
  adopted: '已采用',
};
export function taskLabel(status: ContentTaskStatus) {
  return taskLabels[status] ?? status;
}
export function isActiveTask(task?: ContentTask | null) {
  return task?.status === 'pending' || task?.status === 'running';
}
export function taskColor(status: ContentTaskStatus) {
  const action = {
    pending: 'read',
    running: 'update',
    succeeded: 'create',
    failed: 'delete',
    interrupted: 'reset',
    adopted: 'create',
  }[status];
  return getPermissionActionColor(action);
}
export function taskElapsed(task: ContentTask, now = Date.now()) {
  const start = new Date(task.startedAt || task.createdAt).getTime();
  const end = task.finishedAt ? new Date(task.finishedAt).getTime() : now;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '—';
  return Math.max(0, Math.floor((end - start) / 1000)) + ' 秒';
}
