<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useSubmissionGuard } from './submissionGuard';
import { ElMessage, type FormRules } from 'element-plus';
import Dialog from '@/components/Dialog.vue';
import Form, { type FormField } from '@/components/Form.vue';
import Button from '@/components/Button.vue';
import GenerationSettings from '@/views/content-article/GenerationSettings.vue';
import { useUserStore } from '@/stores/user';
import { getHotTopic, createHotArticle, type HotTopic } from '@/api/hotTopic';
const props = defineProps<{ row: Pick<HotTopic, 'id'> | null }>();
const emit = defineEmits<{ success: [] }>();
const visible = defineModel<boolean>('visible', { required: true });
const user = useUserStore();
const canCreate = computed(
  () =>
    user.hasPermission('HotTopic.create') &&
    user.hasPermission('ContentArticle.create'),
);
const canGenerate = computed(
  () => canCreate.value && user.hasPermission('ContentArticle.aiGenerate'),
);
const formRef = ref<InstanceType<typeof Form>>();
const form = reactive({
  idea: '',
  generate: false,
  aiConfigId: null as number | null,
  templateId: null as number | null,
});
const loading = ref(false),
  failed = ref(false),
  submitting = ref(false);
const detail = ref<HotTopic | null>(null);
let epoch = 0;
let pending: { key: string; requestId: string } | null = null;
const fields = computed<FormField[]>(() => [
  {
    prop: 'idea',
    label: '我的创作想法',
    type: 'textarea',
    rows: 6,
    placeholder:
      '写下你想表达的观点、选择的角度或补充信息；参考来源将单独关联，不混入个人想法。',
  },
  ...(canGenerate.value
    ? [
        {
          prop: 'generate',
          label: '创建后立即生成',
          component: 'Switch' as const,
          hint: '关闭时只创建文章，不调用模型；开启后提交后台生成，可能产生模型及封面费用。',
        },
      ]
    : []),
]);
const rules: FormRules = {
  idea: [{ max: 20000, message: '创作想法最多 20000 字', trigger: 'blur' }],
};
async function load() {
  const sequence = ++epoch;
  detail.value = null;
  failed.value = false;
  loading.value = true;
  Object.assign(form, {
    idea: '',
    generate: false,
    aiConfigId: null,
    templateId: null,
  });
  if (!props.row) {
    loading.value = false;
    return;
  }
  try {
    const result = await getHotTopic(props.row.id);
    if (visible.value && sequence === epoch) detail.value = result;
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
  if (
    submitting.value ||
    loading.value ||
    !detail.value ||
    detail.value.articleId
  )
    return;
  await formRef.value?.validate();
  if (!canCreate.value || (form.generate && !canGenerate.value))
    return void ElMessage.warning('缺少选题创建文章或生成权限');
  if (
    form.generate &&
    form.templateId &&
    !user.hasPermission('ContentTemplate.read')
  )
    return void ElMessage.warning('缺少写作模板读取权限，请清除模板后继续');
  if (form.generate && !form.aiConfigId)
    return void ElMessage.warning('请选择用于文章生成的 AI 配置');
  if (form.generate && !form.idea.trim())
    return void ElMessage.warning('立即生成前请填写自己的创作想法');
  const data = {
    idea: form.idea.trim(),
    generate: form.generate,
    ...(form.generate && form.aiConfigId
      ? { aiConfigId: form.aiConfigId }
      : {}),
    ...(form.generate && form.templateId
      ? { templateId: form.templateId }
      : {}),
  };
  const key = JSON.stringify([detail.value.id, data]);
  if (pending?.key !== key) pending = { key, requestId: crypto.randomUUID() };
  submitting.value = true;
  try {
    const result = await createHotArticle(detail.value.id, {
      ...data,
      requestId: pending.requestId,
    });
    pending = null;
    ElMessage.success(
      result.taskId ? '文章已创建，已提交后台生成' : '文章已创建',
    );
    visible.value = false;
    emit('success');
  } catch {
    /* Preserve the request ID if submission outcome is uncertain. */
  } finally {
    submitting.value = false;
  }
}
</script>
<template>
  <Dialog
    :model-value="visible"
    @update:model-value="close"
    title="选取热点创作"
    width="800px"
    :show-footer="false"
    :show-close="!submitting"
    :close-on-press-escape="!submitting"
  >
    <el-empty v-if="failed" description="选题信息读取失败"
      ><Button @click="load">重新读取</Button></el-empty
    >
    <div v-else v-loading="loading">
      <h3>{{ detail?.title }}</h3>
      <p v-if="detail?.articleId">
        这个选题已经创建文章，请在文章创作中继续处理。
      </p>
      <template v-else>
        <Form
          ref="formRef"
          v-model="form"
          :fields="fields"
          :rules="rules"
          :disabled="submitting || loading"
          label-position="top"
        />
        <GenerationSettings
          v-if="visible && form.generate && canGenerate"
          v-model:ai-config-id="form.aiConfigId"
          v-model:template-id="form.templateId"
          :disabled="submitting"
        />
        <p class="hint">
          创建时会保存本次选题与参考素材快照；生成内容仍需你采纳，不会自动发布。
        </p>
      </template>
    </div>
    <template #footer
      ><Button :disabled="submitting" @click="close">取消</Button
      ><Button
        perm="ContentArticle.create"
        :disabled="loading || failed || !!detail?.articleId || !canCreate"
        :loading="submitting"
        @click="submit"
        >{{ form.generate ? '创建并生成' : '创建文章' }}</Button
      ></template
    >
  </Dialog>
</template>
<style scoped>
h3 {
  margin: 0 0 24px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.7;
}
</style>
