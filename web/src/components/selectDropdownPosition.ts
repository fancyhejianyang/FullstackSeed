interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
}

interface Viewport {
  left: number;
  top: number;
  width: number;
  height: number;
}

// 使用视口坐标配合 fixed 弹层；菜单边框占 2px，内容高度留给内部滚动区。
export function getSelectDropdownPosition(
  anchor: Rect,
  menuHeight: number,
  viewport: Viewport,
) {
  const margin = 8;
  const gap = 4;
  const leftEdge = viewport.left + margin;
  const rightEdge = viewport.left + viewport.width - margin;
  const topEdge = viewport.top + margin;
  const bottomEdge = viewport.top + viewport.height - margin;
  const below = Math.max(0, bottomEdge - anchor.bottom - gap);
  const above = Math.max(0, anchor.top - gap - topEdge);
  const placement = menuHeight + 2 > below && above > below ? 'top' : 'bottom';
  const height = Math.min(
    menuHeight,
    Math.max(0, (placement === 'top' ? above : below) - 2),
  );
  const width = Math.min(anchor.width, Math.max(0, rightEdge - leftEdge));
  const left = Math.max(leftEdge, Math.min(anchor.left, rightEdge - width));
  const top =
    placement === 'top' ? anchor.top - gap - height - 2 : anchor.bottom + gap;
  return { left, top, width, height, placement };
}
