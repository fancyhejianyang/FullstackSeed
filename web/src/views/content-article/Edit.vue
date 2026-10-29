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
import GenerationSettings from './GenerationSettings.vue';
import SourceMaterials from './SourceMaterials.vue';
import { useUserStore } from '@/stores/user';
import UploadImage from '@/components/UploadImage.vue';
import { uploadFile, type UploadRequestOptions } from '@/api/upload';
import {
  createContentArticle,
  getContentArticlePreview,
  updateContentArticle,
  type ContentArticle,
  type ContentSourceMaterial,
  type ContentArticleForm,
  type ContentArticleSummary,
  type ContentTaskDetail,
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
  aiConfigId: null,
  templateId: null,
});
const user = useUserStore();
const version = ref(1);
const savedId = ref<number | null>(null);
const loading = ref(false);
const loadFailed = ref(false);
const submitting = ref(false);
const uploading = ref(false);
const latestCandidate = ref<ContentTaskDetail | null>(null);
const sourceMaterials = ref<ContentSourceMaterial[] | null>(null);
const loadedGeneratedBody = ref(false);
const canLoadGeneratedBody = computed(
  () =>
    !!latestCandidate.value?.result &&
    latestCandidate.value.result !== form.content,
);
const baseline = ref(JSON.stringify(form));
const dirty = computed(() => JSON.stringify(form) !== baseline.value);
const busy = computed(
  () => loading.value || submitting.value || uploading.value,
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
    formRef.value?.resetUploads();
    uploading.value = false;
    savedId.value = id ?? null;
    loadFailed.value = false;
    loading.value = false;
    latestCandidate.value = null;
    sourceMaterials.value = null;
    loadedGeneratedBody.value = false;
    if (!open) return;
    Object.assign(form, {
      title: '',
      coverUrl: '',
      idea: '',
      content: '',
      aiConfigId: null,
      templateId: null,
    });
    baseline.value = JSON.stringify(form);
    version.value = 1;
    if (!id) return;
    loading.value = true;
    try {
      const { article: data, latestTask } = await getContentArticlePreview(id);
      if (current !== epoch) return;
      fillSaved(data);
      if (
        latestTask &&
        ['succeeded', 'adopted'].includes(latestTask.status) &&
        latestTask.result?.trim()
      ) {
        latestCandidate.value = latestTask;
        // 只填入空白且未变更版本的正文；基线仍是已保存数据，回填属于未保存编辑。
        if (
          !data.content?.trim() &&
          latestTask.status === 'succeeded' &&
          latestTask.articleVersion === data.version
        ) {
          form.content = latestTask.result;
          loadedGeneratedBody.value = true;
        }
      }
    } catch {
      if (current === epoch) loadFailed.value = true;
    } finally {
      if (current === epoch) loading.value = false;
    }
  },
);

function fillSaved(data: ContentArticle) {
  sourceMaterials.value = data.sourceMaterials ?? null;
  Object.assign(form, {
    title: data.title,
    coverUrl: data.coverUrl,
    idea: data.idea,
    content: data.content,
    aiConfigId: data.aiConfigId ?? null,
    templateId: data.templateId ?? null,
  });
  savedId.value = data.id;
  version.value = data.version;
  baseline.value = JSON.stringify(form);
}
function loadGeneratedBody() {
  if (
    busy.value ||
    loadFailed.value ||
    !visible.value ||
    !user.hasPermission('ContentArticle.update') ||
    !canLoadGeneratedBody.value
  )
    return;
  form.content = latestCandidate.value!.result!;
  loadedGeneratedBody.value = true;
}
async function saveContent() {
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
async function handleSubmit() {
  if (busy.value || loadFailed.value) return;
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  if (busy.value || loadFailed.value || !visible.value) return;
  submitting.value = true;
  const current = epoch;
  try {
    await saveContent();
    if (current !== epoch) return;
    ElMessage.success('保存成功');
    visible.value = false;
  } catch {
    /* 保存失败保留编辑内容，不关闭窗口。 */
  } finally {
    submitting.value = false;
  }
}

async function uploadCover(file: File, options?: UploadRequestOptions) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('不支持的封面图片格式');
  }
  uploading.value = true;
  const current = epoch;
  try {
    const result = await uploadFile(file, options);
    if (current !== epoch || !visible.value) throw new Error('当前记录已关闭');
    return result;
  } finally {
    if (current === epoch) uploading.value = false;
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
        :disabled="loading || submitting"
      >
        <template #field-coverUrl>
          <UploadImage
            v-model="form.coverUrl"
            :context-key="`${visible}:${props.row?.id ?? 'new'}`"
            :upload-request="uploadCover"
            :disabled="loading || submitting"
            accept="image/png,image/jpeg,image/webp"
          />
        </template>
        <template #field-content>
          <div class="article-editor__body">
            <div v-if="latestCandidate" class="article-editor__body-tools">
              <span v-if="loadedGeneratedBody"
                >已载入生成正文，保存后生效。</span
              >
              <span v-else-if="canLoadGeneratedBody"
                >保留已保存内容，可手动载入最新生成正文。</span
              >
              <Button
                v-if="canLoadGeneratedBody"
                perm="ContentArticle.update"
                :disabled="busy"
                link
                :auto-icon="false"
                confirm
                confirm-text="将用最新生成正文替换编辑框中的正文，保存后才生效，确认载入？"
                @click="loadGeneratedBody"
                >载入最新生成正文</Button
              >
            </div>
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
      <SourceMaterials
        v-if="!loading && !loadFailed"
        :materials="sourceMaterials"
      />
      <GenerationSettings
        v-if="
          visible &&
          savedId &&
          !loading &&
          !loadFailed &&
          user.hasPermission('ContentArticle.update')
        "
        :key="savedId"
        v-model:ai-config-id="form.aiConfigId"
        v-model:template-id="form.templateId"
        :disabled="busy"
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
.article-editor__body-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  color: #606266;
}
</style>
