<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type FormRules } from 'element-plus';
import Form, { type FormField } from '@/components/Form.vue';
import Dialog from '@/components/Dialog.vue';
import Button from '@/components/Button.vue';
import {
  createContentTemplate,
  getContentTemplate,
  updateContentTemplate,
  type ContentTemplateForm,
  type ContentTemplateSummary,
} from '@/api/contentTemplate';

const props = defineProps<{ row?: ContentTemplateSummary | null }>();
const emit = defineEmits<{ success: [] }>();
const visible = defineModel<boolean>('visible', { required: true });
const formRef = ref<InstanceType<typeof Form>>();
const form = reactive<ContentTemplateForm>({ name: '', instruction: '' });
const loading = ref(false),
  submitting = ref(false),
  failed = ref(false);
const baseline = ref('');
const dirty = computed(() => JSON.stringify(form) !== baseline.value);
let epoch = 0;
const fields: FormField[] = [
  {
    prop: 'name',
    label: '模板名称',
    type: 'input',
    componentProps: { maxlength: 120 },
    placeholder: '如：公众号经验分享',
  },
  {
    prop: 'instruction',
    label: '写作要求',
    type: 'textarea',
    rows: 12,
    componentProps: { maxlength: 8000, showWordLimit: true },
    placeholder: '描述适用平台、读者、口吻、段落结构和篇幅；也可粘贴排版样例',
  },
];
const rules: FormRules = {
  name: [
    {
      required: true,
      whitespace: true,
      message: '请输入模板名称',
      trigger: 'blur',
    },
    { max: 120, message: '名称最多 120 字', trigger: 'blur' },
  ],
  instruction: [
    {
      required: true,
      whitespace: true,
      message: '请输入写作要求',
      trigger: 'blur',
    },
    { max: 8000, message: '写作要求最多 8000 字', trigger: 'blur' },
  ],
};
watch(
  () => [visible.value, props.row?.id] as const,
  async ([open, id]) => {
    const current = ++epoch;
    failed.value = false;
    loading.value = false;
    Object.assign(form, { name: '', instruction: '' });
    baseline.value = JSON.stringify(form);
    if (!open || !id) return;
    loading.value = true;
    try {
      const data = await getContentTemplate(id);
      if (current !== epoch) return;
      Object.assign(form, { name: data.name, instruction: data.instruction });
      baseline.value = JSON.stringify(form);
    } catch {
      if (current === epoch) failed.value = true;
    } finally {
      if (current === epoch) loading.value = false;
    }
  },
);
async function handleSubmit() {
  if (loading.value || submitting.value || failed.value) return;
  await formRef.value?.validate();
  if (submitting.value || !visible.value) return;
  submitting.value = true;
  const current = epoch;
  try {
    if (props.row) await updateContentTemplate(props.row.id, { ...form });
    else await createContentTemplate({ ...form });
    if (current !== epoch) return;
    baseline.value = JSON.stringify(form);
    visible.value = false;
    emit('success');
    ElMessage.success('模板已保存');
  } catch {
    /* 保留编辑内容。 */
  } finally {
    submitting.value = false;
  }
}
async function beforeClose(done: () => void) {
  if (submitting.value || loading.value) return;
  if (dirty.value) {
    try {
      await ElMessageBox.confirm(
        '有未保存的模板内容，确认放弃？',
        '未保存内容',
      );
    } catch {
      return;
    }
  }
  visible.value = false;
  done();
}
onBeforeUnmount(() => {
  ++epoch;
});
</script>
<template>
  <Dialog
    v-model="visible"
    :title="row ? '编辑模板' : '新增模板'"
    width="min(760px, 94vw)"
    :show-footer="false"
    :before-close="beforeClose"
  >
    <div v-loading="loading">
      <el-alert
        v-if="failed"
        title="模板读取失败，请关闭后重新打开"
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
      />
    </div>
    <template #footer>
      <Button :disabled="loading || submitting" @click="beforeClose(() => {})"
        >取消</Button
      >
      <Button
        :perm="row ? 'ContentTemplate.update' : 'ContentTemplate.create'"
        :loading="submitting"
        :disabled="loading || submitting || failed"
        @click="handleSubmit"
        >保存</Button
      >
    </template>
  </Dialog>
</template>
