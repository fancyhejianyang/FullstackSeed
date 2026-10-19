import type { ContentTask, ContentTaskStatus } from '@/api/contentArticle';
import { getPermissionActionColor } from '@/utils/permission';

export const taskLabels: Record<ContentTaskStatus, string> = {
  pending: '排队中',
  running: '生成中',
  succeeded: '待采用',
  needs_input: '待补充素材',
  failed: '失败',
  interrupted: '已中断',
  adopted: '已采用',
};
export const coverLabels: Record<string, string> = {
  pending: '待生成',
  running: '生成中',
  succeeded: '已生成',
  skipped: '已跳过',
  failed: '失败',
  interrupted: '已中断',
};
export function taskLabel(
  status: ContentTaskStatus,
  coverStatus?: ContentTask['coverStatus'],
) {
  if (
    status === 'succeeded' &&
    (coverStatus === 'pending' || coverStatus === 'running')
  )
    return '封面生成中';
  return taskLabels[status] ?? status;
}
export function isActiveTask(task?: ContentTask | null) {
  return (
    task?.status === 'pending' ||
    task?.status === 'running' ||
    task?.coverStatus === 'pending' ||
    task?.coverStatus === 'running'
  );
}
export function taskColor(status: ContentTaskStatus) {
  const action = {
    pending: 'read',
    running: 'update',
    succeeded: 'create',
    needs_input: 'read',
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
