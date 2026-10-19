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
import { ElMessage, ElMessageBox, type FormRules } from 'element-plus';
import Form, { type FormField } from '@/components/Form.vue';
import Dialog from '@/components/Dialog.vue';
import Button from '@/components/Button.vue';
import Input from '@/components/Input.vue';
import Select, { type SelectOption } from '@/components/Select.vue';
import Tasks from './Tasks.vue';
import { useUserStore } from '@/stores/user';
import { getContentTemplates } from '@/api/contentTemplate';
import { isActiveTask } from './taskState';
import UploadImage from '@/components/UploadImage.vue';
import { uploadFile } from '@/api/upload';
import {
  createContentArticle,
  getContentArticle,
  updateContentArticle,
  generateContentArticle,
  type ContentArticle,
  type ContentArticleForm,
  type ContentArticleSummary,
} from '@/api/contentArticle';

const props = defineProps<{ row?: ContentArticleSummary | null }>();
const emit = defineEmits<{ success: [] }>();
const visible = defineModel<boolean>('visible', { required: true });
const formRef = ref<InstanceType<typeof Form>>();
const form = reactive<ContentArticleForm>({
  title: '',
  coverUrl: '',
  idea: '',
  content: '',
});
const user = useUserStore();
const version = ref(1);
const savedId = ref<number | null>(null);
const templateId = ref<string | null>('');
const templateOptions = ref<SelectOption[]>([]);
const templatesTruncated = ref(false);
const revision = ref(0);
const activeTask = ref(false);
const adopting = ref(false);
let templateSequence = 0;
let pendingRequest: { key: string; id: string } | null = null;
const loading = ref(false);
const loadFailed = ref(false);
const submitting = ref(false);
const generating = ref(false);
const uploading = ref(false);
const baseline = ref(JSON.stringify(form));
const dirty = computed(() => JSON.stringify(form) !== baseline.value);
const busy = computed(
  () =>
    loading.value ||
    submitting.value ||
    generating.value ||
    uploading.value ||
    adopting.value,
);
const editPermission = computed(() =>
  savedId.value ? 'ContentArticle.update' : 'ContentArticle.create',
);
let epoch = 0;
let closing = false;

const fields: FormField[] = [
  {
    prop: 'title',
    label: '标题',
    type: 'input',
    componentProps: { maxlength: 160 },
  },
  { prop: 'coverUrl', label: '封面', slot: true },
  {
    prop: 'idea',
    label: '想法',
    type: 'textarea',
    rows: 5,
    placeholder: '随时记录想法、要点或已有内容，也可以写上希望的风格和格式',
    componentProps: { maxlength: 20000, showWordLimit: true },
  },
  { prop: 'content', label: '正文', slot: true },
];
const rules: FormRules = {
  title: [
    {
      required: true,
      whitespace: true,
      message: '请输入标题',
      trigger: 'blur',
    },
    { max: 160, message: '标题最多 160 字', trigger: 'blur' },
  ],
  idea: [{ max: 20000, message: '想法最多 20000 字', trigger: 'blur' }],
  content: [{ max: 50000, message: '正文最多 50000 字', trigger: 'blur' }],
};

watch(
  () => [visible.value, props.row?.id] as const,
  async ([open, id]) => {
    const current = ++epoch;
    savedId.value = id ?? null;
    templateId.value = '';
    templateOptions.value = [];
    activeTask.value = false;
    pendingRequest = null;
    loadFailed.value = false;
    loading.value = false;
    generating.value = false;
    if (!open) return;
    void fetchTemplates();
    Object.assign(form, { title: '', coverUrl: '', idea: '', content: '' });
    baseline.value = JSON.stringify(form);
    version.value = 1;
    if (!id) return;
    loading.value = true;
    try {
      const data = await getContentArticle(id);
      if (current !== epoch) return;
      fillSaved(data);
    } catch {
      if (current === epoch) loadFailed.value = true;
    } finally {
      if (current === epoch) loading.value = false;
    }
  },
);

function fillSaved(data: ContentArticle) {
  Object.assign(form, {
    title: data.title,
    coverUrl: data.coverUrl,
    idea: data.idea,
    content: data.content,
  });
  savedId.value = data.id;
  version.value = data.version;
  baseline.value = JSON.stringify(form);
}
async function fetchTemplates(keyword = '') {
  if (!user.hasPermission('ContentTemplate.read') || !visible.value) return;
  const sequence = ++templateSequence;
  const current = epoch;
  try {
    const result = await getContentTemplates({ pageSize: 100, keyword });
    if (sequence !== templateSequence || current !== epoch) return;
    const selected = templateOptions.value.find(
      (option) => option.value === templateId.value,
    );
    templateOptions.value = result.list.map((row) => ({
      value: String(row.id),
      text: row.name,
    }));
    if (
      selected &&
      !templateOptions.value.some((option) => option.value === selected.value)
    )
      templateOptions.value.unshift(selected);
    templatesTruncated.value = result.total > result.list.length;
  } catch {
    /* 模板读取失败不影响通用写作。 */
  }
}
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
async function saveDraft() {
  if (savedId.value && !dirty.value) return;
  const current = epoch;
  const saved = savedId.value
    ? await updateContentArticle(savedId.value, {
        ...form,
        version: version.value,
      })
    : await createContentArticle({ ...form });
  if (current !== epoch) return;
  fillSaved(saved);
  emit('success');
}
async function generate() {
  if (
    busy.value ||
    loadFailed.value ||
    activeTask.value ||
    !user.hasPermission('ContentArticle.update')
  )
    return;
  await formRef.value?.validate();
  if (busy.value || loadFailed.value || !visible.value) return;
  if (!form.idea.trim()) {
    ElMessage.warning('请先填写想法');
    return;
  }
  generating.value = true;
  const current = epoch;
  try {
    await saveDraft();
    if (current !== epoch || !savedId.value) return;
    const key = JSON.stringify([
      savedId.value,
      version.value,
      templateId.value,
    ]);
    if (!pendingRequest || pendingRequest.key !== key)
      pendingRequest = { key, id: requestId() };
    const result = await generateContentArticle(savedId.value, {
      version: version.value,
      requestId: pendingRequest.id,
      ...(templateId.value ? { templateId: Number(templateId.value) } : {}),
    });
    if (current !== epoch) return;
    pendingRequest = null;
    activeTask.value = isActiveTask(result);
    revision.value++;
    emit('success');
    ElMessage.success('已提交，可在生成记录中查看进度');
  } catch {
    /* 保留已保存的文章和请求号，网络失败重试不重复创建任务。 */
  } finally {
    if (current === epoch) generating.value = false;
  }
}
function adopted(article: ContentArticle) {
  fillSaved(article);
  emit('success');
}
async function handleSubmit() {
  if (busy.value || loadFailed.value) return;
  await formRef.value?.validate();
  if (busy.value || loadFailed.value || !visible.value) return;
  submitting.value = true;
  const current = epoch;
  try {
    await saveDraft();
    if (current !== epoch) return;
    ElMessage.success('保存成功');
    visible.value = false;
  } catch {
    /* 保存失败保留编辑内容，不关闭窗口。 */
  } finally {
    submitting.value = false;
  }
}

async function uploadCover(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    ElMessage.warning('封面仅支持 PNG、JPEG 或 WebP 图片');
    throw new Error('不支持的封面图片格式');
  }
  uploading.value = true;
  const current = epoch;
  try {
    const result = await uploadFile(file);
    if (current !== epoch || !visible.value) throw new Error('当前记录已关闭');
    return result;
  } finally {
    uploading.value = false;
  }
}

async function canLeave() {
  if (!visible.value) return true;
  if (busy.value) {
    ElMessage.warning('请等待当前操作完成');
    return false;
  }
  if (!dirty.value) return true;
  try {
    await ElMessageBox.confirm(
      '有未保存的内容，确认放弃并关闭？',
      '未保存内容',
    );
    return true;
  } catch {
    return false;
  }
}
async function requestClose() {
  if (closing) return;
  closing = true;
  try {
    if (await canLeave()) visible.value = false;
  } finally {
    closing = false;
  }
}
// 必须在 Element Plus 内部关闭前拦截；仅拒绝 v-model 更新无法阻止其关闭动画。
async function beforeClose(done: () => void) {
  await requestClose();
  if (!visible.value) done();
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (visible.value && (dirty.value || busy.value)) {
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
    :title="props.row ? '编辑内容' : '记录想法'"
    width="min(1000px, 94vw)"
    :show-footer="false"
    :before-close="beforeClose"
  >
    <div v-loading="loading" class="article-editor">
      <el-alert
        v-if="loadFailed"
        title="读取失败，请关闭后重新打开，当前无法保存"
        :closable="false"
      />
      <Form
        v-else
        ref="formRef"
        v-model="form"
        :fields="fields"
        :rules="rules"
        label-position="top"
        :disabled="busy"
      >
        <template #field-coverUrl>
          <UploadImage
            v-model="form.coverUrl"
            :upload-request="uploadCover"
            :disabled="busy"
            accept="image/png,image/jpeg,image/webp"
          />
        </template>
        <template #field-content>
          <div class="article-editor__body">
            <Input
              v-model="form.content"
              mode="textarea"
              :rows="12"
              :maxlength="50000"
              :disabled="busy"
              :trim="false"
              placeholder="可先保存想法，之后生成正文；也可直接编辑"
            />
          </div>
        </template>
      </Form>
      <div v-if="!loadFailed && !loading" class="article-editor__generation">
        <Select
          v-if="user.hasPermission('ContentTemplate.read')"
          v-model="templateId"
          :options="templateOptions"
          :disabled="busy"
          placeholder="通用写作 · 可选模板"
          aria-label="写作模板"
          @search="fetchTemplates"
        />
        <Button
          v-if="user.hasPermission(editPermission)"
          perm="ContentArticle.update"
          icon="MagicStick"
          :loading="generating"
          :disabled="busy || activeTask"
          title="保存当前文章并提交后台生成任务，调用可能计费"
          @click="generate"
        >
          {{ activeTask ? '任务进行中' : '保存并生成' }}
        </Button>
        <span v-if="templatesTruncated">匹配项较多，请输入模板名称筛选</span>
      </div>
      <Tasks
        v-if="
          visible &&
          savedId &&
          !loading &&
          !loadFailed &&
          user.hasPermission('ContentArticle.read')
        "
        :key="savedId"
        :article-id="savedId"
        :version="version"
        :revision="revision"
        :can-adopt="!dirty && !busy"
        @active="activeTask = $event"
        @busy="adopting = $event"
        @adopted="adopted"
      />
    </div>
    <template #footer>
      <Button :disabled="busy" @click="requestClose">取消</Button>
      <Button
        :perm="editPermission"
        :loading="submitting"
        :disabled="busy || loadFailed"
        @click="handleSubmit"
        >保存</Button
      >
    </template>
  </Dialog>
</template>

<style scoped>
.article-editor {
  min-width: 0;
  color: #303133;
}
.article-editor__body {
  width: 100%;
  min-width: 0;
}
.article-editor__generation {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}
.article-editor__generation :deep(.select) {
  max-width: 280px;
}
</style>
