<script setup lang="ts">
/**
 * Dialog — 弹窗外壳组件。
 *
 * 核心能力：
 * - v-model 控制显示隐藏，默认 append-to-body + destroy-on-close
 * - 点击遮罩层不会关闭弹窗，避免误触导致未提交内容丢失
 * - 统一 25px 内边距、预设宽度和内容最大高度，保留滚动能力但隐藏可见滚动条
 * - 默认提供取消/确定按钮，也可通过 `showFooter=false` + `#footer` 完全自定义
 * - `confirmLoading` 交给业务提交过程控制，组件只负责展示状态
 */
withDefaults(
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
  }>(),
  {
    title: '',
    width: '800px',
    bodyMaxHeight: '70vh',
    confirmLoading: false,
    confirmText: '确定',
    cancelText: '取消',
    showFooter: true,
  },
);

const emit = defineEmits<{ confirm: []; cancel: [] }>();

const visible = defineModel<boolean>({ required: true });

function handleCancel() {
  visible.value = false;
  emit('cancel');
}
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
  >
    <div
      class="pro-dialog__body"
      :style="{ maxHeight: bodyMaxHeight || 'none' }"
    >
      <slot />
    </div>

    <template #footer>
      <slot name="footer">
        <template v-if="showFooter">
          <el-button @click="handleCancel">{{ cancelText }}</el-button>
          <el-button
            type="primary"
            :loading="confirmLoading"
            @click="emit('confirm')"
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
