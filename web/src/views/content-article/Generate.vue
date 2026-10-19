<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { ElMessage, type FormRules } from 'element-plus';
import Dialog from '@/components/Dialog.vue';
import Form, { type FormField } from '@/components/Form.vue';
import Select, { type SelectOption } from '@/components/Select.vue';
import Button from '@/components/Button.vue';
import { useUserStore } from '@/stores/user';
import { getContentTemplates } from '@/api/contentTemplate';
import {
  getContentArticle,
  getContentGenerationConfigs,
  generateContentArticle,
  type ContentArticle,
  type ContentArticleSummary,
} from '@/api/contentArticle';
import { isActiveTask } from './taskState';

const props = defineProps<{ row?: ContentArticleSummary | null }>();
const emit = defineEmits<{ submitted: [] }>();
const visible = defineModel<boolean>('visible', { required: true });
const user = useUserStore();
const formRef = ref<InstanceType<typeof Form>>();
const form = reactive({
  aiConfigId: null as string | null,
  templateId: null as string | null,
});
const article = ref<ContentArticle | null>(null);
const loading = ref(false);
const loadFailed = ref(false);
const submitting = ref(false);
const configAvailable = ref(false);
const configOptions = ref<SelectOption[]>([]);
const templateOptions = ref<SelectOption[]>([]);
const configsTruncated = ref(false);
const templatesTruncated = ref(false);
const templatesFailed = ref(false);
const canReadTemplates = computed(() =>
  user.hasPermission('ContentTemplate.read'),
);
const fields = computed<FormField[]>(() => [
  { prop: 'aiConfigId', label: 'AI 配置', slot: true },
  ...(canReadTemplates.value
    ? [{ prop: 'templateId', label: '写作模板', slot: true }]
    : []),
]);
const rules: FormRules = {
  aiConfigId: [
    { required: true, message: '请选择 AI 配置', trigger: 'change' },
  ],
};
const ready = computed(
  () =>
    !!article.value?.idea.trim() &&
    configAvailable.value &&
    !loading.value &&
    !loadFailed.value &&
    !submitting.value &&
    !isActiveTask(props.row?.latestTask),
);
let epoch = 0;
let configSequence = 0;
let templateSequence = 0;
let pendingRequest: { key: string; id: string } | null = null;

// 搜索不丢失已选项；最终可用性在提交时由后端再次校验。
function withSelected(
  options: SelectOption[],
  previous: SelectOption[],
  selected: string | null,
) {
  const item = previous.find((option) => option.value === selected);
  if (item && !options.some((option) => option.value === item.value))
    options.unshift(item);
  return options;
}
async function fetchConfigs(keyword = '', autoSelect = false) {
  const current = epoch;
  const sequence = ++configSequence;
  const result = await getContentGenerationConfigs({ pageSize: 100, keyword });
  if (current !== epoch || sequence !== configSequence) return;
  configOptions.value = withSelected(
    result.list.map((row) => ({
      value: String(row.id),
      text: `${row.name} · ${row.model || '未设置模型'} · ${row.responseFormat === 'text' ? '纯文本' : 'Markdown'}`,
    })),
    configOptions.value,
    form.aiConfigId,
  );
  configsTruncated.value = result.total > result.list.length;
  if (autoSelect) {
    configAvailable.value = result.total > 0;
    if (result.total === 1 && result.list[0])
      form.aiConfigId = String(result.list[0].id);
  }
}
function searchConfigs(keyword: string) {
  void fetchConfigs(keyword).catch(() => undefined);
}
async function fetchTemplates(keyword = '') {
  if (!canReadTemplates.value || !visible.value) return;
  const current = epoch;
  const sequence = ++templateSequence;
  try {
    const result = await getContentTemplates({ pageSize: 100, keyword });
    if (current !== epoch || sequence !== templateSequence) return;
    templateOptions.value = withSelected(
      result.list.map((row) => ({ value: String(row.id), text: row.name })),
      templateOptions.value,
      form.templateId,
    );
    templatesTruncated.value = result.total > result.list.length;
    templatesFailed.value = false;
  } catch {
    if (current === epoch && sequence === templateSequence)
      templatesFailed.value = true;
  }
}
watch(
  () => [visible.value, props.row?.id] as const,
  async ([open, id]) => {
    const current = ++epoch;
    article.value = null;
    Object.assign(form, { aiConfigId: null, templateId: null });
    configOptions.value = [];
    templateOptions.value = [];
    configAvailable.value = false;
    configsTruncated.value = false;
    templatesTruncated.value = false;
    templatesFailed.value = false;
    loadFailed.value = false;
    loading.value = false;
    submitting.value = false;
    pendingRequest = null;
    if (!open || !id) return;
    loading.value = true;
    void fetchTemplates();
    try {
      const [detail] = await Promise.all([
        getContentArticle(id),
        fetchConfigs('', true),
      ]);
      if (current === epoch) {
        article.value = detail;
        if (detail.aiConfigId != null)
          form.aiConfigId = String(detail.aiConfigId);
        form.templateId =
          detail.templateId == null ? null : String(detail.templateId);
      }
    } catch {
      if (current === epoch) loadFailed.value = true;
    } finally {
      if (current === epoch) loading.value = false;
    }
  },
);
function requestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
async function generate() {
  if (
    !visible.value ||
    !ready.value ||
    !user.hasPermission('ContentArticle.update')
  )
    return;
  const current = epoch;
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  if (
    current !== epoch ||
    !visible.value ||
    !ready.value ||
    !article.value ||
    !form.aiConfigId
  )
    return;
  if (form.templateId && !canReadTemplates.value) {
    ElMessage.warning('无权使用已保存的写作模板，请在编辑中清除或联系管理员');
    return;
  }
  submitting.value = true;
  const id = article.value.id;
  const version = article.value.version;
  const aiConfigId = Number(form.aiConfigId);
  const templateId =
    canReadTemplates.value && form.templateId
      ? Number(form.templateId)
      : undefined;
  const key = JSON.stringify([id, version, aiConfigId, templateId]);
  if (!pendingRequest || pendingRequest.key !== key)
    pendingRequest = { key, id: requestId() };
  try {
    await generateContentArticle(id, {
      version,
      aiConfigId,
      templateId,
      requestId: pendingRequest.id,
    });
    if (current !== epoch) return;
    pendingRequest = null;
    ElMessage.success('已提交后台生成，可在“内容创作 → 生成记录”查看进度');
    emit('submitted');
    visible.value = false;
  } catch {
    // 保留选项与请求号，同一选择重试不重复创建任务。
  } finally {
    if (current === epoch) submitting.value = false;
  }
}
function canLeave() {
  if (visible.value && submitting.value) {
    ElMessage.warning('正在提交任务，请稍候');
    return false;
  }
  return true;
}
function requestClose() {
  if (canLeave()) visible.value = false;
}
function beforeClose(done: () => void) {
  if (canLeave()) {
    visible.value = false;
    done();
  }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (visible.value && submitting.value) {
    event.preventDefault();
    event.returnValue = '';
  }
}
onBeforeRouteLeave(canLeave);
onMounted(() => window.addEventListener('beforeunload', beforeUnload));
onBeforeUnmount(() => {
  ++epoch;
  window.removeEventListener('beforeunload', beforeUnload);
});
</script>

<template>
  <Dialog
    v-model="visible"
    title="AI 生成文章"
    width="min(620px, 94vw)"
    :show-footer="false"
    :before-close="beforeClose"
  >
    <div v-loading="loading" class="article-generate">
      <p class="article-generate__title">
        {{ article?.title || props.row?.title }}
      </p>
      <el-alert
        v-if="loadFailed"
        title="读取失败，请关闭后重新打开"
        :closable="false"
      />
      <template v-else-if="!loading">
        <el-alert
          v-if="!article?.idea.trim()"
          title="请先编辑文章，填写并保存想法"
          :closable="false"
        />
        <el-alert
          v-else-if="isActiveTask(props.row?.latestTask)"
          title="该文章已有生成任务，请在生成记录中查看进度"
          :closable="false"
        />
        <el-alert
          v-if="!configAvailable"
          title="暂无可用 AI 配置，请联系管理员在 AI 功能配置中启用“内容创作”配置"
          :closable="false"
        />
        <Form
          ref="formRef"
          v-model="form"
          :fields="fields"
          :rules="rules"
          label-position="top"
          :disabled="submitting"
        >
          <template #field-aiConfigId>
            <Select
              v-model="form.aiConfigId"
              :options="configOptions"
              :disabled="submitting || !configAvailable"
              placeholder="请选择内容创作配置"
              aria-label="AI 配置"
              @search="searchConfigs"
            />
            <span v-if="configsTruncated" class="article-generate__hint"
              >匹配项较多，请输入配置名称或模型筛选</span
            >
          </template>
          <template #field-templateId>
            <Select
              v-model="form.templateId"
              :options="templateOptions"
              :disabled="submitting"
              placeholder="通用写作 · 可选模板"
              aria-label="写作模板"
              @search="fetchTemplates"
            />
            <span v-if="templatesFailed" class="article-generate__hint"
              >模板读取失败，可重新搜索；不选模板则使用通用写作。</span
            >
            <span v-else-if="templatesTruncated" class="article-generate__hint"
              >匹配项较多，请输入模板名称筛选</span
            >
          </template>
        </Form>
        <p class="article-generate__hint">
          本次选择将保存到文章，下次点击“AI 生成”直接运行；可在文章编辑中更换。
        </p>
        <p class="article-generate__hint">
          按已保存的标题、想法和模板直接成稿，调用可能计费，不会自动覆盖正文。系统不会自动检索或读取链接。
        </p>
      </template>
    </div>
    <template #footer>
      <Button :disabled="submitting" @click="requestClose">取消</Button>
      <Button
        perm="ContentArticle.update"
        icon="MagicStick"
        :loading="submitting"
        :disabled="!ready || !form.aiConfigId"
        @click="generate"
        >开始生成</Button
      >
    </template>
  </Dialog>
</template>

<style scoped>
.article-generate {
  min-height: 100px;
  color: #303133;
}
.article-generate__title {
  margin: 0 0 20px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.article-generate__hint {
  color: #606266;
  font-size: 13px;
  line-height: 1.7;
}
.article-generate :deep(.el-alert) {
  margin-bottom: 16px;
}
</style>
