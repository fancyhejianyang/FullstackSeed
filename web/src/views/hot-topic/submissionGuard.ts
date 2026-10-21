import { onBeforeUnmount, onMounted } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { ElMessage } from 'element-plus';

/** Only protect the short persistence request; background jobs never block leaving. */
export function useSubmissionGuard(isSubmitting: () => boolean) {
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (isSubmitting()) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  onMounted(() => window.addEventListener('beforeunload', beforeUnload));
  onBeforeUnmount(() =>
    window.removeEventListener('beforeunload', beforeUnload),
  );
  onBeforeRouteLeave(() => {
    if (!isSubmitting()) return true;
    ElMessage.warning('正在保存或提交，请稍候');
    return false;
  });
}
