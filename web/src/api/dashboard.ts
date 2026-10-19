import request from '@/utils/request';
export type WidgetParams = Record<string, string | number | boolean | string[]>;
export interface WidgetConfig {
  instanceId: string;
  widgetKey: string;
  schemaVersion: number;
  enabled: boolean;
  title: string;
  layout: { order: number; span: 4 | 6 | 8 | 12 };
  params: WidgetParams;
}
export interface WidgetParameter {
  key: string;
  label: string;
  type: 'select' | 'integer' | 'boolean' | 'multiSelect';
  defaultValue: string | number | boolean | string[];
  options?: Array<{ label: string; value: string | number }>;
  min?: number;
  max?: number;
}
export interface WidgetDefinition {
  key: string;
  name: string;
  description: string;
  category: 'metric' | 'chart' | 'list' | 'navigation';
  permissionCodes: string[];
  allowedSpans: Array<4 | 6 | 8 | 12>;
  defaultSpan: 4 | 6 | 8 | 12;
  parameters: WidgetParameter[];
  schemaVersion: number;
}
export interface DashboardMetric {
  key: string;
  label: string;
  value: number | null;
  unit?: string;
  hint?: string;
  path?: string;
}
export interface DashboardItem {
  id: string;
  title: string;
  detail: string;
  time?: string;
  path?: string;
}
export interface DashboardSeries {
  name: string;
  values: Array<number | null>;
  kind?: 'bar' | 'line';
  percent?: boolean;
}
export interface WidgetData {
  metrics?: DashboardMetric[];
  labels?: string[];
  series?: DashboardSeries[];
  items?: DashboardItem[];
  note?: string;
}
export interface DashboardWidget extends WidgetConfig {
  status: 'ready' | 'unavailable';
  data: WidgetData | null;
}
export interface DashboardHome {
  layoutVersion: number;
  generatedAt: string;
  widgets: DashboardWidget[];
}
export interface DashboardConfiguration {
  revision: number;
  publishedVersion: number;
  draft: WidgetConfig[];
  published: WidgetConfig[];
  canRollback: boolean;
  publishedAt: string | null;
  definitions: WidgetDefinition[];
}

export function getDashboardHome(params?: {
  days?: number;
  instanceId?: string;
}) {
  return request.get<unknown, DashboardHome>('/dashboard/home', { params });
}
export function getDashboardConfiguration() {
  return request.get<unknown, DashboardConfiguration>('/dashboard/config');
}
export function saveDashboardConfiguration(
  revision: number,
  widgets: WidgetConfig[],
  publish = false,
) {
  return publish
    ? request.post<unknown, DashboardConfiguration>(
        '/dashboard/config/publish',
        { revision, widgets },
      )
    : request.put<unknown, DashboardConfiguration>('/dashboard/config', {
        revision,
        widgets,
      });
}
export function rollbackDashboardConfiguration(revision: number) {
  return request.post<unknown, DashboardConfiguration>(
    '/dashboard/config/rollback',
    { revision },
  );
}
