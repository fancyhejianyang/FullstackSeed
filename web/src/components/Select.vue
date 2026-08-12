<script setup lang="ts">
/**
 * Select — 单选下拉组件。
 *
 * 核心能力：
 * - 不内置 API，只接收 `options: { value: string; text: string }[]`
 * - v-model 固定按 string/null 处理；传入数字会自动转字符串，业务侧建议直接使用稳定编码
 * - 支持本地搜索、防抖、键盘上下选择与 Enter 确认
 * - 大数据默认启用虚拟滚动，只渲染可视窗口
 * - options 变化时重建一次 Map；搜索、回显、缺失值兜底都复用该 Map
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

defineOptions({ inheritAttrs: false });

export interface SelectOption {
  value: string;
  text: string;
  disabled?: boolean;
}

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
    notFoundText: '暂无匹配数据',
  },
);

const model = defineModel<string | null>({ default: '' });
const emit = defineEmits<{
  change: [value: string | null];
  clear: [];
  search: [keyword: string];
}>();

const rootRef = ref<HTMLElement>();
const menuRef = ref<HTMLElement>();
const opened = ref(false);
const searchInput = ref('');
const keyword = ref('');
const highlightedIndex = ref(-1);
const scrollTop = ref(0);
const optionMap = ref(new Map<string, SelectOption>());
let searchTimer: ReturnType<typeof setTimeout> | undefined;

const normalizedValue = computed(() =>
  model.value === null || model.value === undefined ? '' : String(model.value),
);

const selectedOption = computed(() =>
  normalizedValue.value ? optionMap.value.get(normalizedValue.value) : undefined,
);

const selectedText = computed(() => {
  if (!normalizedValue.value) return '';
  // 字典缺失时直接暴露 #value，业务人员可据此回查字典表。
  return selectedOption.value?.text ?? `#${normalizedValue.value}`;
});

const displayValue = computed(() => (opened.value ? searchInput.value : selectedText.value));

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
    // options 变化属于特殊路径：只在这里全量建 Map，后续搜索/回显都走 Map 查询。
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
    if (value === null || value === undefined || typeof value === 'string') return;
    model.value = String(value);
  },
);

watch(searchInput, (value) => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    // 搜索只影响内部过滤和 search 事件，不触发任何内置远程请求。
    keyword.value = value;
    highlightedIndex.value = getInitialHighlightIndex();
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
  searchInput.value = '';
  keyword.value = '';
  highlightedIndex.value = getInitialHighlightIndex();
  scrollTop.value = 0;
}

function close() {
  opened.value = false;
  searchInput.value = '';
  keyword.value = '';
  highlightedIndex.value = -1;
}

function toggleOpen() {
  if (opened.value) {
    close();
    return;
  }
  open();
}

function selectOption(option: SelectOption) {
  if (option.disabled) return;
  model.value = option.value;
  emit('change', option.value);
  close();
}

function clearValue(event: MouseEvent) {
  event.stopPropagation();
  model.value = '';
  emit('clear');
  emit('change', '');
  close();
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
    if (option) selectOption(option);
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

function getInitialHighlightIndex() {
  const selectedIndex = filteredOptions.value.findIndex(
    (option) => option.value === normalizedValue.value,
  );
  return selectedIndex >= 0 ? selectedIndex : filteredOptions.value.length ? 0 : -1;
}

function handleScroll(event: Event) {
  scrollTop.value = (event.target as HTMLElement).scrollTop;
}

function isSelected(option: SelectOption) {
  return option.value === normalizedValue.value;
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
    class="select"
    :class="{ 'is-opened': opened, 'is-disabled': props.disabled }"
    v-bind="$attrs"
  >
    <div class="select__control" @click="toggleOpen">
      <input
        class="select__input"
        :value="displayValue"
        :readonly="!opened || !props.filterable"
        :disabled="props.disabled"
        :placeholder="selectedText ? '' : props.placeholder"
        @input="handleInput"
        @focus="open"
        @keydown="handleKeydown"
      />
      <button
        v-if="props.clearable && normalizedValue && !props.disabled"
        class="select__clear"
        type="button"
        @click="clearValue"
      >
        x
      </button>
      <span class="select__arrow" />
    </div>

    <div v-if="opened" class="select__dropdown">
      <div
        ref="menuRef"
        class="select__menu"
        :style="{ height: `${menuHeight}px` }"
        @scroll="handleScroll"
      >
        <div v-if="filteredOptions.length" class="select__virtual" :style="{ height: `${listHeight}px` }">
          <div :style="{ transform: `translateY(${offsetTop}px)` }">
            <div
              v-for="(option, index) in visibleOptions"
              :key="option.value"
              class="select__option"
              :class="{
                'is-selected': isSelected(option),
                'is-highlighted': visibleStart + index === highlightedIndex,
                'is-disabled': option.disabled,
              }"
              :style="{ height: `${props.itemHeight}px` }"
              @mousedown.prevent="selectOption(option)"
            >
              {{ option.text }}
            </div>
          </div>
        </div>
        <div
          v-else
          class="select__empty"
          :style="{ height: `${props.itemHeight}px` }"
        >
          {{ props.notFoundText }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.select {
  position: relative;
  width: 100%;
  font-size: 14px;
}

.select__control {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 32px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background-color: #ffffff;
  transition: border-color 0.2s;
}

.select.is-opened .select__control {
  border-color: #409eff;
}

.select.is-disabled .select__control {
  cursor: not-allowed;
  background-color: #f5f7fa;
}

.select__input {
  flex: 1;
  min-width: 0;
  height: 30px;
  padding: 0 10px;
  border: 0;
  outline: 0;
  color: #303133;
  background-color: transparent;
}

.select__input::placeholder {
  color: #a8abb2;
}

.select__clear {
  flex: 0 0 20px;
  border: 0;
  color: #c0c4cc;
  background: transparent;
  cursor: pointer;
}

.select__arrow {
  flex: 0 0 28px;
  width: 28px;
  height: 30px;
  position: relative;
}

.select__arrow::after {
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

.select__dropdown {
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

.select__menu {
  overflow-y: auto;
}

.select__virtual {
  position: relative;
}

.select__option {
  display: flex;
  align-items: center;
  padding: 0 12px;
  color: #303133;
  cursor: pointer;
}

.select__option:hover,
.select__option.is-highlighted {
  background-color: #ecf5ff;
}

.select__option.is-selected {
  color: #409eff;
  font-weight: 600;
}

.select__option.is-disabled {
  color: #c0c4cc;
  cursor: not-allowed;
}

.select__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
}
</style>
