import type { WidgetConfig } from '@/api/dashboard';

export type DropPosition = 'before' | 'after';
export type DropAxis = 'horizontal' | 'vertical';

/** Keep the array and persisted layout.order in the same row-major order. */
export function moveWidgetToIndex(
  widgets: WidgetConfig[],
  from: number,
  to: number,
): WidgetConfig[] {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= widgets.length ||
    to >= widgets.length ||
    from === to
  )
    return widgets;
  const next = [...widgets];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next.map((widget, index) => ({
    ...widget,
    layout: { ...widget.layout, order: index * 10 },
  }));
}

export function dropWidget(
  widgets: WidgetConfig[],
  sourceId: string,
  targetId: string,
  position: DropPosition,
): WidgetConfig[] {
  const from = widgets.findIndex(
    (widget) => widget.instanceId === sourceId,
  );
  const target = widgets.findIndex(
    (widget) => widget.instanceId === targetId,
  );
  if (from < 0 || target < 0 || from === target) return widgets;
  const insertion = target + (position === 'after' ? 1 : 0);
  return moveWidgetToIndex(
    widgets,
    from,
    insertion - (from < insertion ? 1 : 0),
  );
}

export function getDropPosition(
  bounds: { left: number; top: number; width: number; height: number },
  point: { x: number; y: number },
  axis: DropAxis,
): DropPosition {
  return (
    axis === 'horizontal'
      ? point.x < bounds.left + bounds.width / 2
      : point.y < bounds.top + bounds.height / 2
  )
    ? 'before'
    : 'after';
}
