<script setup lang="ts">
/**
 * ProButton — 基于 el-button 的二次封装。
 *
 * 核心能力：
 * - **权限码驱动**：传 `perm`（如 `'User.create'`），自动校验权限；无权限按 `fallback` 策略处理（默认隐藏，可选 disable）
 * - **权限异步态**：有 perm 且权限未就绪时先隐藏避免闪烁；无 perm 不受影响
 * - **自动配色**：按权限码动作后缀映射 Element 语义 `type`
 * - **内置图标**：按动作后缀自动匹配图标，`icon` prop 可覆盖
 * - **二次确认**：破坏性操作（delete/disable/revoke/reset/publish…）默认开启二次确认
 * - **并发保护**：确认弹窗 / click 回调执行期间自动 loading，防止重复点击
 * - **透传**：其余 props/attrs/events 全部透传给 el-button，用法与原生一致
 *
 * 设计规范：见 `.design-spec.md` 第 6 节「操作按钮配色标准」。
 * 映射表统一维护在 `utils/permission.ts`，新增动作只改一处。
 */
import { computed, ref, type Component } from 'vue';
import { ElMessageBox } from 'element-plus';
import { useUserStore } from '@/stores/user';
import {
  getPermissionActionColor,
  getPermissionActionConfirmText,
  getPermissionActionIcon,
  getPermissionActionLabel,
  isDestructiveAction,
} from '@/utils/permission';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    /** 权限码（Module.action，如 'User.create'）；不传则不做权限校验 */
    perm?: string;
    /** 是否用权限码推导默认 type（true 时按动作后缀自动配色） */
    autoType?: boolean;
    /** 是否用权限码推导默认文案（true 时取动作中文短标签） */
    autoLabel?: boolean;
    /**
     * 图标覆盖：
     * - 不传：按 perm 动作后缀自动匹配内置图标
     * - 传字符串：作为全局注册的图标组件名渲染（如 'Search'）
     * - 传组件：直接渲染
     * - 传空串 ''：强制不显示图标
     */
    icon?: string | Component;
    /** 是否在 perm 存在时自动推导内置图标 */
    autoIcon?: boolean;
    /**
     * 二次确认开关：
     * - `'auto'`（默认）：perm 动作后缀为破坏性操作时自动开启
     * - `true`：强制开启
     * - `false`：强制关闭
     */
    confirm?: boolean | 'auto';
    /** 二次确认弹窗标题 */
    confirmTitle?: string;
    /** 二次确认弹窗内容（不传则按动作后缀自动推导默认文案） */
    confirmText?: string;
    /** 二次确认弹窗类型 */
    confirmType?: 'success' | 'warning' | 'info' | 'error';
    /**
     * 无权限降级策略：
     * - `'hide'`（默认）：不渲染（v-if）
     * - `'disable'`：渲染但 disabled + tooltip 提示
     */
    fallback?: 'hide' | 'disable';
    /** fallback='disable' 时的 tooltip 文案 */
    fallbackText?: string;
  }>(),
  {
    perm: '',
    autoType: true,
    autoLabel: false,
    icon: undefined,
    autoIcon: true,
    confirm: 'auto',
    confirmTitle: '提示',
    confirmText: undefined,
    confirmType: 'warning',
    fallback: 'hide',
    fallbackText: undefined,
  },
);

const emit = defineEmits<{
  click: [e: MouseEvent];
  /** 用户取消二次确认时触发 */
  cancel: [];
}>();

const userStore = useUserStore();

// ---- 并发保护（先声明，供 computed 引用）----

const pending = ref(false);

// ---- 权限校验 ----

/** 权限是否已就绪（userInfo 已加载）；无 perm 时不需要等待 */
const permReady = computed(() => !props.perm || userStore.userInfo !== null);

/** 是否有权限（超管放行；无 perm 放行） */
const allowed = computed(() => !props.perm || userStore.hasPermission(props.perm));

/**
 * 是否渲染按钮：
 * - 无 perm：永远渲染（不登录页也能用，如登录按钮）
 * - 有 perm + 权限未就绪：先隐藏（避免闪烁）
 * - 有 perm + 就绪 + 无权限 + fallback='hide'：隐藏
 * - 其它：渲染
 */
const shouldRender = computed(() => {
  if (!props.perm) return true;
  if (!permReady.value) return false;
  if (!allowed.value && props.fallback === 'hide') return false;
  return true;
});

/** 按钮是否 disabled（仅并发保护；无权限 disable 由 fallback 处理） */
const buttonDisabled = computed(() => pending.value);

/**
 * tooltip 是否显示：
 * - 并发保护期间（pending）：不显示 tooltip（loading 态不需要权限提示）
 * - 无权限 + fallback='disable'：显示
 */
const tooltipDisabled = computed(() =>
  pending.value || !(permReady.value && !allowed.value && props.fallback === 'disable'),
);

const resolvedFallbackText = computed(() => props.fallbackText ?? '暂无权限');

// ---- 自动推导 ----

/** 最终 type：autoType 推导 > $attrs.type 透传 > 不设 */
const resolvedType = computed(() => {
  if (props.autoType && props.perm) return getPermissionActionColor(props.perm);
  return undefined; // 交给 $attrs.type 透传
});

const resolvedLabel = computed(() =>
  props.autoLabel && props.perm ? getPermissionActionLabel(props.perm) : undefined,
);

const resolvedIcon = computed<string | Component | null>(() => {
  if (props.icon !== undefined) {
    return props.icon === '' ? null : props.icon;
  }
  if (props.autoIcon && props.perm) {
    return getPermissionActionIcon(props.perm);
  }
  return null;
});

// ---- 二次确认 ----

const needConfirm = computed(() => {
  if (props.confirm === true) return true;
  if (props.confirm === false) return false;
  if (!props.perm) return false;
  return isDestructiveAction(props.perm);
});

const resolvedConfirmText = computed(() => {
  if (props.confirmText !== undefined) return props.confirmText;
  if (props.perm) {
    const text = getPermissionActionConfirmText(props.perm);
    if (text) return text;
  }
  return '确认执行该操作？';
});

// ---- 点击处理 ----

async function handleClick(e: MouseEvent) {
  if (pending.value) return;

  pending.value = true;
  try {
    if (needConfirm.value) {
      try {
        await ElMessageBox.confirm(resolvedConfirmText.value, props.confirmTitle, {
          type: props.confirmType,
        });
      } catch {
        emit('cancel');
        return;
      }
    }
    emit('click', e);
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <el-tooltip
    v-if="shouldRender"
    :content="resolvedFallbackText"
    :disabled="tooltipDisabled"
    placement="top"
  >
    <el-button
      v-bind="$attrs"
      :type="resolvedType ?? ($attrs.type as any)"
      :loading="pending"
      :disabled="buttonDisabled"
      @click="handleClick"
    >
      <el-icon v-if="resolvedIcon">
        <component :is="resolvedIcon" />
      </el-icon>
      <slot>{{ resolvedLabel }}</slot>
    </el-button>
  </el-tooltip>
</template>
