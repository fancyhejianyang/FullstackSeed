<script setup lang="ts">
/**
 * Dialog — 弹窗外壳组件。
 *
 * 核心能力：
 * - v-model 控制显示隐藏，默认 append-to-body + destroy-on-close
 * - 点击遮罩层不会关闭弹窗，避免误触导致未提交内容丢失
 * - 统一 25px 内边距、预设宽度和内容最大高度，保留滚动能力但隐藏可见滚动条
 * - 默认提供取消/确定按钮，也可通过 `showFooter=false` + `#footer` 完全自定义
 * - 内置关闭入口共用守卫；可选择在提交期间锁定关闭
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';

export type DialogCloseReason = 'cancel' | 'dismiss';

const props = withDefaults(
  defineProps<{
    title?: string;
    width?: string | number;
    // 内容区最大高度（超出滚动），传 '' 则不限制
    bodyMaxHeight?: string;
    confirmLoading?: boolean;
    confirmText?: string;
    cancelText?: string;
    // 是否显示默认底部按钮（false 时用 #footer 插槽自定义）
    showFooter?: boolean;
    /** 返回 false 阻止关闭，异步确认优先使用此接口。 */
    closeGuard?: (reason: DialogCloseReason) => boolean | Promise<boolean>;
    /** 兼容 Element Plus 回调；done(true) 取消关闭。 */
    beforeClose?: (done: (cancel?: boolean) => void) => void | Promise<void>;
    /** 默认不拦截后台任务弹窗；需要防止提交中关闭时显式开启。 */
    lockOnConfirm?: boolean;
  }>(),
  {
    title: '',
    width: '800px',
    bodyMaxHeight: '70vh',
    confirmLoading: false,
    confirmText: '确定',
    cancelText: '取消',
    showFooter: true,
    lockOnConfirm: false,
  },
);

const emit = defineEmits<{ confirm: []; cancel: []; 'close-error': [error: unknown] }>();

const visible = defineModel<boolean>({ required: true });

const closePending = ref(false);
const closeLocked = computed(() => props.lockOnConfirm && props.confirmLoading);
let closeVersion = 0;
let disposed = false;

function invalidateClose() {
  closeVersion += 1;
  closePending.value = false;
}

// 外部关闭/重新打开之后，旧守卫不得关闭新的弹窗会话。
watch(visible, invalidateClose, { flush: 'sync' });
onBeforeUnmount(() => {
  disposed = true;
  invalidateClose();
});

async function requestClose(reason: DialogCloseReason = 'cancel') {
  if (disposed || !visible.value || closePending.value || closeLocked.value) return false;
  const version = ++closeVersion;
  closePending.value = true;
  let closed = false;
  const isCurrent = () => !disposed && version === closeVersion && visible.value;
  const finish = (cancel = false) => {
    if (cancel || closed || !isCurrent() || closeLocked.value) return;
    closed = true;
    visible.value = false;
    emit('cancel');
  };
  try {
    if (props.closeGuard && !(await props.closeGuard(reason))) return false;
    if (!isCurrent() || closeLocked.value) return false;
    if (props.beforeClose) {
      // 保留旧 done 回调形式。异步回调应返回 Promise，以便整个确认期间防重入；
      // 未返回 Promise 的延迟 done 也仍受本次版本和关闭状态保护。
      await props.beforeClose(finish);
    } else {
      finish();
    }
    return closed;
  } catch (error) {
    if (isCurrent()) emit('close-error', error);
    return false;
  } finally {
    if (version === closeVersion) closePending.value = false;
  }
}

function handleBeforeClose() {
  return requestClose('dismiss');
}

function handleConfirm() {
  if (!props.confirmLoading && !closePending.value) emit('confirm');
}

defineExpose({ requestClose, closePending, closeLocked });
</script>

<template>
  <el-dialog
    v-model="visible"
    class="pro-dialog"
    :title="title"
    :width="width"
    align-center
    append-to-body
    destroy-on-close
    :close-on-click-modal="false"
    :before-close="handleBeforeClose"
  >
    <div
      class="pro-dialog__body"
      :style="{ maxHeight: bodyMaxHeight || 'none' }"
    >
      <slot />
    </div>

    <template #footer>
      <slot name="footer" :close="requestClose" :closing="closePending" :locked="closeLocked">
        <template v-if="showFooter">
          <el-button :disabled="closePending || closeLocked" @click="requestClose('cancel')">{{ cancelText }}</el-button>
          <el-button
            type="primary"
            :loading="confirmLoading"
            :disabled="closePending"
            @click="handleConfirm"
          >
            {{ confirmText }}
          </el-button>
        </template>
      </slot>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
:global(.el-dialog.pro-dialog) {
  --el-dialog-padding-primary: 25px;
}

.pro-dialog__body {
  overflow-y: auto;
  // 内容区继续响应滚轮、触控板和键盘滚动，但不显示滚动条占用视觉空间。
  -ms-overflow-style: none;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }
}
</style>
