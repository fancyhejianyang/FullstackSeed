<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useSubmissionGuard } from '@/views/hot-topic/submissionGuard';
import { ElMessage, ElMessageBox, type FormRules } from 'element-plus';
import Dialog from '@/components/Dialog.vue';
import Form, { type FormField } from '@/components/Form.vue';
import Button from '@/components/Button.vue';
import {
  createHotSource,
  updateHotSource,
  getHotSource,
  safeSourceUrl,
  sourceKindLabels,
  sourceAccessLabels,
  type HotSource,
  type HotSourceForm,
} from '@/api/hotTopic';
const props = defineProps<{ row: HotSource | null }>();
const emit = defineEmits<{ success: [] }>();
const visible = defineModel<boolean>('visible', { required: true });
const loading = ref(false),
  submitting = ref(false),
  failed = ref(false),
  hasToken = ref(false);
const formRef = ref<InstanceType<typeof Form>>();
const initial = (): HotSourceForm => ({
  name: '',
  kind: 'douyinHot',
  accessMode: 'page',
  url: '',
  apiToken: '',
  clearApiToken: false,
  isEnabled: false,
  description: '',
});
const form = reactive(initial());
let epoch = 0;
const fields = computed<FormField[]>(() => [
  { prop: 'name', label: '来源名称', type: 'input' },
  {
    prop: 'kind',
    label: '来源类型',
    type: 'select',
    options: Object.entries(sourceKindLabels)
      .filter(([value]) => value !== 'douyinAccount')
      .map(([value, label]) => ({ value, label })),
  },
  {
    prop: 'accessMode',
    label: '获取方式',
    type: 'select',
    options: Object.entries(sourceAccessLabels)
      .filter(([key]) =>
        form.kind === 'rss' || form.kind === 'jsonFeed'
          ? key === 'feed'
          : key !== 'feed',
      )
      .map(([value, label]) => ({ value, label })),
  },
  {
    prop: 'url',
    label: '来源地址',
    type: 'input',
    placeholder: 'https://…',
    hint:
      form.kind === 'jsonFeed'
        ? '接口应返回 {"items":[{"title":"标题","url":"原文 HTTPS 链接","summary":"摘要","publishedAt":"ISO 日期"}]}；title、url 必填，其余可选。最多读取 100 条。'
        : '可填写平台官方热榜或合规聚合页面的公开 HTTPS 地址；不绕过登录、验证码或访问限制。',
  },
  ...(form.kind === 'jsonFeed'
    ? [
        {
          prop: 'apiToken',
          label: '接口密钥',
          inputMode: 'password' as const,
          type: 'input' as const,
          hint: hasToken.value
            ? '已配置密钥；留空保留，不回显真实密钥。'
            : '可选，仅用于授权 JSON Feed 的 Bearer Token。',
        },
      ]
    : []),
  ...(hasToken.value
    ? [
        {
          prop: 'clearApiToken',
          label: '清除原密钥',
          component: 'Checkbox' as const,
          componentProps: { label: '保存时清除现有接口密钥' },
          hint: '切换为非 JSON Feed 来源时须先清除原密钥；清除需要再次确认。',
        },
      ]
    : []),
  { prop: 'isEnabled', label: '启用状态', component: 'Switch' },
  { prop: 'description', label: '说明', type: 'textarea', rows: 3 },
]);
const rules: FormRules = {
  name: [
    { required: true, message: '请输入来源名称', trigger: 'blur' },
    { max: 120, message: '名称最多 120 字', trigger: 'blur' },
  ],
  url: [
    {
      validator: (_rule, value, done) =>
        safeSourceUrl(String(value || ''))
          ? done()
          : done(new Error('请输入不含账号密码的 HTTPS 地址')),
      trigger: 'blur',
    },
  ],
  kind: [{ required: true, message: '请选择来源类型' }],
  accessMode: [{ required: true, message: '请选择获取方式' }],
};
watch(
  () => form.kind,
  (kind) => {
    form.accessMode = kind === 'rss' || kind === 'jsonFeed' ? 'feed' : 'page';
  },
);
async function load() {
  const sequence = ++epoch;
  failed.value = false;
  Object.assign(form, initial());
  hasToken.value = false;
  if (!props.row) {
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const row = await getHotSource(props.row.id);
    if (sequence !== epoch || !visible.value) return;
    Object.assign(form, {
      name: row.name,
      kind: row.kind,
      url: row.url,
      isEnabled: Boolean(row.isEnabled),
      description: row.description,
      apiToken: '',
    });
    // Wait for the kind watcher before restoring the persisted access mode.
    await nextTick();
    if (sequence !== epoch || !visible.value) return;
    form.accessMode = row.accessMode;
    hasToken.value = !!row.hasApiToken;
  } catch {
    if (sequence === epoch) failed.value = true;
  } finally {
    if (sequence === epoch) loading.value = false;
  }
}
watch(visible, (open) => {
  if (open) void load();
  else ++epoch;
});
onBeforeUnmount(() => ++epoch);
useSubmissionGuard(() => submitting.value);
function close() {
  if (!submitting.value) visible.value = false;
}
async function submit() {
  if (submitting.value || loading.value || failed.value) return;
  await formRef.value?.validate();
  if (form.clearApiToken) {
    try {
      await ElMessageBox.confirm(
        '保存后会清除该来源已保存的接口密钥，是否继续？',
        '清除密钥',
      );
    } catch {
      return;
    }
  }
  submitting.value = true;
  try {
    const data = {
      ...form,
      isEnabled: Boolean(form.isEnabled),
      clearApiToken: Boolean(form.clearApiToken),
      ...(form.apiToken?.trim() ? { apiToken: form.apiToken.trim() } : {}),
    };
    if (!form.apiToken?.trim()) delete data.apiToken;
    if (form.kind !== 'jsonFeed') delete data.apiToken;
    if (props.row) await updateHotSource(props.row.id, data);
    else await createHotSource(data);
    ElMessage.success('来源配置已保存');
    visible.value = false;
    emit('success');
  } catch {
    /* The request interceptor shows the precise server error. */
  } finally {
    submitting.value = false;
  }
}
</script>
<template>
  <Dialog
    :model-value="visible"
    @update:model-value="close"
    :title="row ? '编辑热点来源' : '新增热点来源'"
    width="760px"
    :show-footer="false"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
  >
    <el-empty v-if="failed" description="来源配置读取失败，未载入旧数据"
      ><Button @click="load">重新读取</Button></el-empty
    >
    <Form
      v-else
      ref="formRef"
      v-model="form"
      v-loading="loading"
      :disabled="loading || submitting"
      :fields="fields"
      :rules="rules"
      label-position="top"
    >
    </Form>
    <template #footer
      ><Button :disabled="submitting" @click="close">取消</Button
      ><Button
        :perm="row ? 'HotTopicSource.update' : 'HotTopicSource.create'"
        :loading="submitting"
        :disabled="loading || failed"
        @click="submit"
        >保存配置</Button
      ></template
    >
  </Dialog>
</template>
