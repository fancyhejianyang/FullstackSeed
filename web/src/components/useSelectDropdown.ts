import {
  onBeforeUnmount,
  onDeactivated,
  ref,
  watch,
  type CSSProperties,
  type Ref,
} from 'vue';
import { useZIndex } from 'element-plus';
import { getSelectDropdownPosition } from './selectDropdownPosition';

/** 单/多选共用的 body 弹层定位，不放宽 Dialog 或其它滚动容器的 overflow。 */
export function useSelectDropdown(
  rootRef: Ref<HTMLElement | undefined>,
  dropdownRef: Ref<HTMLElement | undefined>,
  opened: Ref<boolean>,
  menuHeight: Readonly<Ref<number>>,
  close: () => void,
) {
  const { nextZIndex } = useZIndex();
  const dropdownStyle = ref<CSSProperties>({ visibility: 'hidden' });
  const dropdownHeight = ref(menuHeight.value);
  let zIndex = 0;
  let frame: number | undefined;
  let observer: ResizeObserver | undefined;
  let listening = false;

  function updatePosition() {
    const root = rootRef.value;
    if (!opened.value || !root) return;
    const anchor = root.getBoundingClientRect();
    if (!root.getClientRects().length || !anchor.width || !anchor.height) {
      close();
      return;
    }
    const visual = window.visualViewport;
    const viewport = {
      left: visual?.offsetLeft ?? 0,
      top: visual?.offsetTop ?? 0,
      width: visual?.width ?? document.documentElement.clientWidth,
      height: visual?.height ?? document.documentElement.clientHeight,
    };
    let left = Math.max(anchor.left, viewport.left);
    let right = Math.min(anchor.right, viewport.left + viewport.width);
    let top = Math.max(anchor.top, viewport.top);
    let bottom = Math.min(anchor.bottom, viewport.top + viewport.height);
    let ancestorZIndex = 0;
    // 控件完全滚出可见区域时关闭，避免 body 上留下悬空菜单。
    for (
      let parent = root.parentElement;
      parent;
      parent = parent.parentElement
    ) {
      const style = getComputedStyle(parent);
      ancestorZIndex = Math.max(
        ancestorZIndex,
        Number.parseInt(style.zIndex, 10) || 0,
      );
      const rect = parent.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
        left = Math.max(left, rect.left);
        right = Math.min(right, rect.right);
      }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
        top = Math.max(top, rect.top);
        bottom = Math.min(bottom, rect.bottom);
      }
    }
    if (right <= left || bottom <= top) {
      close();
      return;
    }
    const position = getSelectDropdownPosition(
      anchor,
      menuHeight.value,
      viewport,
    );
    dropdownHeight.value = position.height;
    dropdownStyle.value = {
      left: `${position.left}px`,
      top: `${position.top}px`,
      width: `${position.width}px`,
      zIndex: Math.max(zIndex, ancestorZIndex + 1),
      visibility: 'visible',
    };
  }

  function schedulePosition(event?: Event) {
    // 菜单自身的虚拟滚动不改变锚点，不要每滚一行都重新测量布局。
    if (
      event?.target instanceof Node &&
      dropdownRef.value?.contains(event.target)
    )
      return;
    if (frame !== undefined) return;
    frame = window.requestAnimationFrame(() => {
      frame = undefined;
      updatePosition();
    });
  }

  function cleanup() {
    if (frame !== undefined) window.cancelAnimationFrame(frame);
    frame = undefined;
    observer?.disconnect();
    observer = undefined;
    window.removeEventListener('scroll', schedulePosition, true);
    window.removeEventListener('resize', schedulePosition);
    window.visualViewport?.removeEventListener('scroll', schedulePosition);
    window.visualViewport?.removeEventListener('resize', schedulePosition);
    listening = false;
  }

  watch(
    [opened, menuHeight],
    ([isOpen]) => {
      if (!isOpen) {
        cleanup();
        dropdownStyle.value = { visibility: 'hidden' };
        return;
      }
      if (!listening) {
        zIndex = nextZIndex();
        listening = true;
        window.addEventListener('scroll', schedulePosition, true);
        window.addEventListener('resize', schedulePosition);
        window.visualViewport?.addEventListener('scroll', schedulePosition);
        window.visualViewport?.addEventListener('resize', schedulePosition);
        if (typeof ResizeObserver !== 'undefined' && rootRef.value) {
          observer = new ResizeObserver(() => schedulePosition());
          observer.observe(rootRef.value);
        }
      }
      updatePosition();
    },
    { flush: 'post' },
  );

  onBeforeUnmount(cleanup);
  onDeactivated(() => {
    close();
    cleanup();
  });
  return { dropdownStyle, dropdownHeight };
}
