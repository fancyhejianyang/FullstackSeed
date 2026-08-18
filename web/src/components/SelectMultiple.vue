<script setup lang="ts">
/**
 * SelectMultiple — 多选下拉组件。
 *
 * 核心能力：
 * - 不内置 API，只接收 `options: { value: string; text: string }[]`
 * - v-model 固定为 string[]，传入非字符串会在组件内转成字符串
 * - 支持本地搜索、防抖、键盘上下选择与 Enter 勾选/取消
 * - 大数据默认启用虚拟滚动，只渲染可视窗口
 * - options 变化时重建一次 Map；tag 回显和缺失值兜底都复用该 Map
 * - tag 默认按 `maxTagCount` 折叠，点击“显示更多”后换行展开
 * - 回显找不到值时显示 `#id`，方便定位字典数据是否缺失
 */
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import type { SelectOption } from './Select.vue';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    options?: SelectOption[];
    placeholder?: string;
    disabled?: boolean;
    clearable?: boolean;
    filterable?: boolean;
    debounce?: number;
    virtual?: boolean;
    itemHeight?: number;
    visibleCount?: number;
    maxTagCount?: number;
    notFoundText?: string;
  }>(),
  {
    options: () => [],
    placeholder: '请选择',
    disabled: false,
    clearable: true,
    filterable: true,
    debounce: 250,
    virtual: true,
    itemHeight: 34,
    visibleCount: 8,
    maxTagCount: 3,
    notFoundText: '暂无匹配数据',
  },
);

const model = defineModel<string[]>({ default: () => [] });
const emit = defineEmits<{
  change: [value: string[]];
  clear: [];
  search: [keyword: string];
}>();

const rootRef = ref<HTMLElement>();
const menuRef = ref<HTMLElement>();
const inputRef = ref<HTMLInputElement>();
const opened = ref(false);
const expanded = ref(false);
const searchInput = ref('');
const keyword = ref('');
const highlightedIndex = ref(-1);
const scrollTop = ref(0);
const optionMap = ref(new Map<string, SelectOption>());
let searchTimer: ReturnType<typeof setTimeout> | undefined;

const selectedValues = computed(() =>
  Array.isArray(model.value) ? model.value.map((value) => String(value)) : [],
);
const selectedSet = computed(() => new Set(selectedValues.value));
const selectedTags = computed(() =>
  selectedValues.value.map((value) => ({
    value,
    // 字典缺失时直接暴露 #value，避免静默显示空白。
    text: optionMap.value.get(value)?.text ?? `#${value}`,
  })),
);
const visibleTags = computed(() =>
  expanded.value ? selectedTags.value : selectedTags.value.slice(0, props.maxTagCount),
);
const hiddenTagCount = computed(() =>
  Math.max(0, selectedTags.value.length - props.maxTagCount),
);

const filteredOptions = computed(() => {
  const text = keyword.value.trim().toLowerCase();
  if (!text) return props.options;
  return props.options.filter((option) => {
    const value = option.value.toLowerCase();
    const label = option.text.toLowerCase();
    return value.includes(text) || label.includes(text);
  });
});

const menuHeight = computed(() =>
  Math.min(filteredOptions.value.length, props.visibleCount) * props.itemHeight,
);
const shouldVirtual = computed(
  () => props.virtual && filteredOptions.value.length > props.visibleCount,
);
const visibleStart = computed(() =>
  shouldVirtual.value ? Math.floor(scrollTop.value / props.itemHeight) : 0,
);
const visibleEnd = computed(() =>
  shouldVirtual.value
    ? Math.min(
        filteredOptions.value.length,
        visibleStart.value + props.visibleCount + 2,
      )
    : filteredOptions.value.length,
);
const visibleOptions = computed(() =>
  filteredOptions.value.slice(visibleStart.value, visibleEnd.value),
);
const listHeight = computed(() => filteredOptions.value.length * props.itemHeight);
const offsetTop = computed(() => visibleStart.value * props.itemHeight);

watch(
  () => props.options,
  (options) => {
    // options 变化属于特殊路径：只在这里全量建 Map，tag 回显不再重复扫描数组。
    const next = new Map<string, SelectOption>();
    options.forEach((option) => {
      next.set(String(option.value), {
        ...option,
        value: String(option.value),
        text: option.text || `#${option.value}`,
      });
    });
    optionMap.value = next;
  },
  { immediate: true },
);

watch(
  () => model.value,
  (value) => {
    // 多选值契约严格保持 string[]，兼容外部误传数字但会立即规范化。
    const next = Array.isArray(value) ? value.map((item) => String(item)) : [];
    if (next.length !== value.length || next.some((item, index) => item !== value[index])) {
      model.value = next;
    }
  },
);

watch(searchInput, (value) => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    // 搜索只影响内部过滤和 search 事件，不触发任何内置远程请求。
    keyword.value = value;
    highlightedIndex.value = filteredOptions.value.length ? 0 : -1;
    scrollTop.value = 0;
    emit('search', value);
  }, props.debounce);
});

watch(filteredOptions, () => {
  if (!filteredOptions.value.length) {
    highlightedIndex.value = -1;
    return;
  }
  if (
    highlightedIndex.value < 0 ||
    highlightedIndex.value >= filteredOptions.value.length
  ) {
    highlightedIndex.value = 0;
  }
});

function open() {
  if (props.disabled) return;
  opened.value = true;
  highlightedIndex.value = filteredOptions.value.length ? 0 : -1;
  void focusInput();
}

function close() {
  opened.value = false;
  searchInput.value = '';
  keyword.value = '';
  highlightedIndex.value = -1;
}

async function focusInput() {
  await nextTick();
  inputRef.value?.focus();
}

function toggleOpen() {
  if (opened.value) {
    close();
    return;
  }
  open();
}

function toggleOption(option: SelectOption) {
  if (option.disabled) return;
  const next = new Set(selectedValues.value);
  if (next.has(option.value)) {
    next.delete(option.value);
  } else {
    next.add(option.value);
  }
  model.value = Array.from(next);
  emit('change', model.value);
}

function removeValue(value: string, event: MouseEvent) {
  event.stopPropagation();
  model.value = selectedValues.value.filter((item) => item !== value);
  emit('change', model.value);
}

function clearValue(event: MouseEvent) {
  event.stopPropagation();
  model.value = [];
  expanded.value = false;
  emit('clear');
  emit('change', []);
  close();
}

function toggleExpanded(event: MouseEvent) {
  event.stopPropagation();
  expanded.value = !expanded.value;
}

function handleInput(value: Event) {
  if (!props.filterable) return;
  searchInput.value = (value.target as HTMLInputElement).value;
  if (!opened.value) open();
}

function handleKeydown(event: KeyboardEvent) {
  if (props.disabled) return;
  if (!opened.value && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
    event.preventDefault();
    open();
    return;
  }
  if (!opened.value) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    moveHighlight(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    moveHighlight(-1);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const option = filteredOptions.value[highlightedIndex.value];
    if (option) toggleOption(option);
  } else if (event.key === 'Escape') {
    close();
  }
}

function moveHighlight(step: number) {
  if (!filteredOptions.value.length) return;
  const length = filteredOptions.value.length;
  highlightedIndex.value = (highlightedIndex.value + step + length) % length;
  scrollHighlightedIntoView();
}

function scrollHighlightedIntoView() {
  // 键盘移动高亮项时，虚拟列表要同步滚动，保证高亮项始终可见。
  if (!menuRef.value || !shouldVirtual.value) return;
  const top = highlightedIndex.value * props.itemHeight;
  const bottom = top + props.itemHeight;
  const viewTop = menuRef.value.scrollTop;
  const viewBottom = viewTop + menuHeight.value;
  if (top < viewTop) {
    menuRef.value.scrollTop = top;
  } else if (bottom > viewBottom) {
    menuRef.value.scrollTop = bottom - menuHeight.value;
  }
}

function handleScroll(event: Event) {
  scrollTop.value = (event.target as HTMLElement).scrollTop;
}

function handleDocumentClick(event: MouseEvent) {
  const target = event.target as Node;
  if (!rootRef.value?.contains(target)) close();
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentClick);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentClick);
  window.clearTimeout(searchTimer);
});

watch(opened, async (value) => {
  if (!value) return;
  await nextTick();
  scrollHighlightedIntoView();
});
</script>

<template>
  <div
    ref="rootRef"
    class="select-multiple"
    :class="{ 'is-opened': opened, 'is-disabled': props.disabled, 'is-expanded': expanded }"
    v-bind="$attrs"
  >
    <div class="select-multiple__control" @mousedown.prevent="toggleOpen">
      <div class="select-multiple__tags">
        <span
          v-for="tag in visibleTags"
          :key="tag.value"
          class="select-multiple__tag"
        >
          {{ tag.text }}
          <button
            v-if="!props.disabled"
            class="select-multiple__tag-close"
            type="button"
            @mousedown.stop.prevent
            @click="removeValue(tag.value, $event)"
          >
            x
          </button>
        </span>
        <button
          v-if="hiddenTagCount && !expanded"
          class="select-multiple__more"
          type="button"
          @mousedown.stop.prevent
          @click="toggleExpanded"
        >
          显示更多 +{{ hiddenTagCount }}
        </button>
        <button
          v-if="hiddenTagCount && expanded"
          class="select-multiple__more"
          type="button"
          @mousedown.stop.prevent
          @click="toggleExpanded"
        >
          收起
        </button>
        <input
          ref="inputRef"
          class="select-multiple__input"
          :value="searchInput"
          :readonly="!props.filterable"
          :disabled="props.disabled"
          :placeholder="selectedTags.length ? '' : props.placeholder"
          @input="handleInput"
          @focus="open"
          @keydown="handleKeydown"
        />
      </div>
      <button
        v-if="props.clearable && selectedValues.length && !props.disabled"
        class="select-multiple__clear"
        type="button"
        @mousedown.stop.prevent
        @click="clearValue"
      >
        x
      </button>
      <span class="select-multiple__arrow" />
    </div>

    <div v-if="opened" class="select-multiple__dropdown">
      <div
        ref="menuRef"
        class="select-multiple__menu"
        :style="{ height: `${menuHeight}px` }"
        @scroll="handleScroll"
      >
        <div
          v-if="filteredOptions.length"
          class="select-multiple__virtual"
          :style="{ height: `${listHeight}px` }"
        >
          <div :style="{ transform: `translateY(${offsetTop}px)` }">
            <div
              v-for="(option, index) in visibleOptions"
              :key="option.value"
              class="select-multiple__option"
              :class="{
                'is-selected': selectedSet.has(option.value),
                'is-highlighted': visibleStart + index === highlightedIndex,
                'is-disabled': option.disabled,
              }"
              :style="{ height: `${props.itemHeight}px` }"
              @mousedown.prevent="toggleOption(option)"
            >
              <span class="select-multiple__check">
                {{ selectedSet.has(option.value) ? '✓' : '' }}
              </span>
              <span>{{ option.text }}</span>
            </div>
          </div>
        </div>
        <div
          v-else
          class="select-multiple__empty"
          :style="{ height: `${props.itemHeight}px` }"
        >
          {{ props.notFoundText }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.select-multiple {
  position: relative;
  width: 100%;
  font-size: 14px;
}

.select-multiple__control {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 32px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background-color: #ffffff;
  transition: border-color 0.2s;
}

.select-multiple.is-opened .select-multiple__control {
  border-color: #409eff;
}

.select-multiple.is-disabled .select-multiple__control {
  cursor: not-allowed;
  background-color: #f5f7fa;
}

.select-multiple__tags {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
  padding: 3px 6px;
}

.select-multiple:not(.is-expanded) .select-multiple__tags {
  max-height: 30px;
  overflow: hidden;
}

.select-multiple__tag,
.select-multiple__more {
  display: inline-flex;
  align-items: center;
  max-width: 160px;
  height: 24px;
  padding: 0 8px;
  border: 1px solid #e4e7ed;
  border-radius: 3px;
  color: #606266;
  background-color: #f4f4f5;
  white-space: nowrap;
}

.select-multiple__tag {
  overflow: hidden;
  text-overflow: ellipsis;
}

.select-multiple__more {
  border: 0;
  color: #409eff;
  cursor: pointer;
}

.select-multiple__tag-close {
  margin-left: 4px;
  border: 0;
  color: #909399;
  background: transparent;
  cursor: pointer;
}

.select-multiple__input {
  flex: 1;
  min-width: 96px;
  height: 24px;
  border: 0;
  outline: 0;
  color: #303133;
  background-color: transparent;
}

.select-multiple__input::placeholder {
  color: #a8abb2;
}

.select-multiple__clear {
  flex: 0 0 20px;
  border: 0;
  color: #c0c4cc;
  background: transparent;
  cursor: pointer;
}

.select-multiple__arrow {
  flex: 0 0 28px;
  width: 28px;
  height: 30px;
  position: relative;
}

.select-multiple__arrow::after {
  position: absolute;
  top: 11px;
  left: 9px;
  width: 7px;
  height: 7px;
  border-right: 1px solid #909399;
  border-bottom: 1px solid #909399;
  transform: rotate(45deg);
  content: '';
}

.select-multiple__dropdown {
  position: absolute;
  z-index: 2000;
  top: calc(100% + 4px);
  left: 0;
  width: 100%;
  overflow: hidden;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  background-color: #ffffff;
  box-shadow: 0 6px 18px rgb(0 0 0 / 12%);
}

.select-multiple__menu {
  overflow-y: auto;
}

.select-multiple__virtual {
  position: relative;
}

.select-multiple__option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  color: #303133;
  cursor: pointer;
}

.select-multiple__option:hover,
.select-multiple__option.is-highlighted {
  background-color: #ecf5ff;
}

.select-multiple__option.is-selected {
  color: #409eff;
  font-weight: 600;
}

.select-multiple__option.is-disabled {
  color: #c0c4cc;
  cursor: not-allowed;
}

.select-multiple__check {
  width: 16px;
  color: #409eff;
}

.select-multiple__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
}
</style>
