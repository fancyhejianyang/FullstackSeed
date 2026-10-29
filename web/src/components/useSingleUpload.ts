import { computed, inject, nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { useFormItem, type UploadFile } from 'element-plus';
import { releaseUpload, uploadFile, type UploadRequest, type UploadResult } from '@/api/upload';
import { UPLOAD_FORM_KEY } from './uploadForm';
import { validateUploadFile, validateUploadImage } from './uploadValidation';

export type UploadStatus = 'idle' | 'validating' | 'uploading' | 'success' | 'error' | 'cancelled';

export interface SingleUploadProps {
  accept: string;
  maxSizeMb: number;
  disabled: boolean;
  contextKey?: string | number;
  validateEvent?: boolean;
  readText?: boolean;
  uploadRequest?: UploadRequest;
}

export interface UploadEvents {
  uploading: (value: boolean) => void;
  progress: (value: number) => void;
  status: (value: UploadStatus) => void;
  error: (error: Error) => void;
}

export function useSingleUpload(
  props: SingleUploadProps,
  model: Ref<string | null>,
  options: {
    image?: boolean;
    events: UploadEvents;
    commit: (result: UploadResult, file: UploadFile, text: string) => void;
  },
) {
  const { form, formItem } = useFormItem();
  const status = ref<UploadStatus>('idle');
  const progress = ref(0);
  const error = ref('');
  const pickerKey = ref(0);
  const pendingName = ref('');
  const uploading = computed(() => status.value === 'validating' || status.value === 'uploading');
  const disabled = computed(() => props.disabled || Boolean(form?.disabled));
  const retryFile = ref<UploadFile>();
  const canRetry = computed(() => status.value === 'error' && Boolean(retryFile.value));
  let version = 0;
  let controller: AbortController | undefined;
  let committing = false;
  const noExpectedModel = Symbol('no-expected-model');
  let expectedModel: string | null | typeof noExpectedModel = noExpectedModel;
  let ownedUrl = '';

  watch(uploading, options.events.uploading, { flush: 'sync' });
  watch(progress, options.events.progress, { flush: 'sync' });
  watch(status, options.events.status, { flush: 'sync' });

  function release(url: string) {
    if (url && !url.startsWith('blob:')) void releaseUpload(url).catch(() => undefined);
  }

  function reset() {
    ++version;
    expectedModel = noExpectedModel;
    controller?.abort();
    controller = undefined;
    status.value = 'idle';
    error.value = '';
    progress.value = 0;
    pendingName.value = '';
    retryFile.value = undefined;
    ++pickerKey.value;
  }

  function abort() {
    reset();
    status.value = 'cancelled';
  }

  async function validateField() {
    if (props.validateEvent === false) return;
    await nextTick();
    await formItem?.validate('change').catch(() => undefined);
  }

  function validate(): true | string {
    if (disabled.value && !uploading.value) return true;
    if (uploading.value) return '文件正在上传，请等待上传完成';
    return error.value || true;
  }

  async function start(file: UploadFile) {
    if (!file.raw || disabled.value || uploading.value) return;
    reset();
    const run = version;
    const abortController = new AbortController();
    controller = abortController;
    const usesDefaultUpload = !props.uploadRequest;
    const request = props.uploadRequest ?? uploadFile;
    pendingName.value = file.name;
    status.value = 'validating';
    let result: UploadResult | undefined;
    let retryable = false;
    try {
      validateUploadFile(file.raw, props.accept, props.maxSizeMb);
      if (options.image) await validateUploadImage(file.raw, abortController.signal);
      if (run !== version) return;
      retryable = true;
      // Read before uploading: a text decoding/read failure must not partially update the URL/name.
      const text = props.readText ? await file.raw.text() : '';
      if (run !== version) return;
      status.value = 'uploading';
      result = await request(file.raw, {
        signal: abortController.signal,
        silentError: true,
        timeout: 120000,
        onProgress: (value) => {
          if (run === version && Number.isFinite(value)) progress.value = Math.max(0, Math.min(99, Math.round(value)));
        },
      });
      if (run !== version) {
        if (usesDefaultUpload && result?.url) release(result.url);
        return;
      }
      if (!result || typeof result.url !== 'string' || !result.url.trim()) {
        throw new Error('上传结果缺少文件地址，请重试');
      }
      committing = true;
      expectedModel = result.url;
      try { options.commit(result, file, text); }
      finally { committing = false; }
      if (run !== version) return;
      ownedUrl = usesDefaultUpload ? result.url : '';
      progress.value = 100;
      status.value = 'success';
      retryFile.value = undefined;
      void validateField();
    } catch (reason) {
      if (run !== version) return;
      if (usesDefaultUpload && result?.url) release(result.url);
      const message = await getUploadErrorMessage(reason);
      if (run !== version) return;
      error.value = message;
      status.value = 'error';
      retryFile.value = retryable ? file : undefined;
      options.events.error(new Error(error.value));
    } finally {
      if (run === version) {
        controller = undefined;
        ++pickerKey.value;
      }
    }
  }

  function handleChange(file: UploadFile) { void start(file); }
  function retry() {
    if (retryFile.value) void start(retryFile.value);
  }
  function handleExceed() {
    if (uploading.value || disabled.value) return;
    reset();
    error.value = '每次只能选择一个文件';
    status.value = 'error';
    options.events.error(new Error(error.value));
  }
  function remove(clearModel: () => void) {
    if (disabled.value) return;
    const removedUrl = model.value;
    reset();
    committing = true;
    expectedModel = '';
    try { clearModel(); }
    finally { committing = false; }
    if (ownedUrl && ownedUrl === removedUrl) release(ownedUrl);
    ownedUrl = '';
    void validateField();
  }

  watch(model, (value) => {
    // defineModel emits synchronously, but the parent can pass the value back on the next render.
    if (committing) return;
    if (expectedModel !== noExpectedModel && value === expectedModel) {
      expectedModel = noExpectedModel;
      return;
    }
    reset();
  }, { flush: 'sync' });
  watch(() => [props.contextKey, props.accept, props.maxSizeMb, props.readText], reset, { flush: 'sync' });
  const unregister = inject(UPLOAD_FORM_KEY, undefined)?.register({
    prop: formItem?.propString ?? '', uploading, validate, reset,
  });
  onBeforeUnmount(() => { reset(); unregister?.(); });

  return {
    uploading, disabled, status, progress, error, pickerKey, pendingName, canRetry,
    handleChange, handleExceed, reset, abort, retry, remove, validate,
  };
}

export async function getUploadErrorMessage(reason: unknown): Promise<string> {
  const failure = reason as { message?: string; code?: string; response?: { data?: unknown } } | undefined;
  let data = failure?.response?.data;
  if (data instanceof Blob) {
    try { data = JSON.parse(await data.text()); } catch { /* fall through to a readable message */ }
  }
  const message = (data as { message?: unknown } | undefined)?.message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.join('；');
  if (failure?.code === 'ECONNABORTED' || failure?.code === 'ETIMEDOUT') return '上传超时，请重试';
  if (failure?.code === 'ERR_NETWORK') return '网络异常，请重试';
  return failure?.message || '上传失败，请重试';
}
