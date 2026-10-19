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
import UploadImage from '@/components/UploadImage.vue';
import { uploadFile } from '@/api/upload';
import {
  createContentArticle,
  getContentArticle,
  updateContentArticle,
  generateContentArticle,
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
const version = ref(1);
const loading = ref(false);
const loadFailed = ref(false);
const submitting = ref(false);
const generating = ref(false);
const uploading = ref(false);
const candidate = ref('');
const baseline = ref(JSON.stringify(form));
const dirty = computed(
  () => JSON.stringify(form) !== baseline.value || !!candidate.value,
);
const busy = computed(
  () =>
    loading.value || submitting.value || generating.value || uploading.value,
);
const editPermission = computed(() =>
  props.row ? 'ContentArticle.update' : 'ContentArticle.create',
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
    candidate.value = '';
    loadFailed.value = false;
    loading.value = false;
    generating.value = false;
    if (!open) return;
    Object.assign(form, { title: '', coverUrl: '', idea: '', content: '' });
    baseline.value = JSON.stringify(form);
    version.value = 1;
    if (!id) return;
    loading.value = true;
    try {
      const data = await getContentArticle(id);
      if (current !== epoch) return;
      Object.assign(form, {
        title: data.title,
        coverUrl: data.coverUrl,
        idea: data.idea,
        content: data.content,
      });
      version.value = data.version;
      baseline.value = JSON.stringify(form);
    } catch {
      if (current === epoch) loadFailed.value = true;
    } finally {
      if (current === epoch) loading.value = false;
    }
  },
);

async function generate() {
  if (busy.value || loadFailed.value || candidate.value) return;
  await formRef.value?.validate();
  if (busy.value || loadFailed.value || !visible.value) return;
  if (!form.idea.trim()) {
    ElMessage.warning('请先填写想法');
    return;
  }
  generating.value = true;
  const current = epoch;
  try {
    const result = await generateContentArticle(
      { title: form.title, idea: form.idea },
      props.row?.id,
    );
    if (current === epoch) candidate.value = result.content;
  } catch {
    // 统一请求层提示错误；已有正文与候选稿保持不变。
  } finally {
    if (current === epoch) generating.value = false;
  }
}

function adopt() {
  if (!candidate.value || busy.value) return;
  form.content = candidate.value;
  candidate.value = '';
}

async function handleSubmit() {
  if (busy.value || loadFailed.value) return;
  if (candidate.value) {
    ElMessage.warning('请先采用或放弃生成结果，再保存');
    return;
  }
  await formRef.value?.validate();
  if (busy.value || loadFailed.value || !visible.value) return;
  submitting.value = true;
  const current = epoch;
  try {
    if (props.row)
      await updateContentArticle(props.row.id, {
        ...form,
        version: version.value,
      });
    else await createContentArticle({ ...form });
    if (current !== epoch) return;
    baseline.value = JSON.stringify(form);
    ElMessage.success('保存成功');
    visible.value = false;
    emit('success');
  } catch {
    // 失败保留编辑内容（包含版本冲突），不关闭窗口。
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
            <div class="article-editor__toolbar">
              <Button
                :perm="editPermission"
                icon="MagicStick"
                title="使用最新创建的已启用聊天 AI 配置；会发送当前标题和想法，调用可能计费"
                :loading="generating"
                :disabled="busy || !!candidate"
                @click="generate"
                >生成正文</Button
              >
              <span v-if="generating" role="status">正在生成，请稍候…</span>
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
            <section v-if="candidate" class="article-editor__candidate">
              <div class="article-editor__toolbar">
                <strong>生成结果 · 未采用</strong>
                <Button
                  :perm="editPermission"
                  :disabled="busy"
                  :confirm="!!form.content.trim()"
                  confirm-text="采用后将替换编辑框中的正文，保存后才会写入记录。确认采用？"
                  @click="adopt"
                  >采用正文</Button
                >
                <Button :disabled="busy" @click="candidate = ''">放弃</Button>
              </div>
              <pre>{{ candidate }}</pre>
            </section>
          </div>
        </template>
      </Form>
    </div>
    <template #footer>
      <Button :disabled="busy" @click="requestClose">取消</Button>
      <Button
        :perm="editPermission"
        :loading="submitting"
        :disabled="busy || loadFailed || !!candidate"
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
.article-editor__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  color: #606266;
}
.article-editor__candidate {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid #b3d8ff;
  border-radius: 8px;
  background: #f5f9ff;
}
.article-editor__candidate pre {
  margin: 0;
  max-height: 360px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
  line-height: 1.8;
}
</style>
