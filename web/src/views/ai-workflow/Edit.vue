<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import Dialog from '@/components/Dialog.vue';
import Form, { type FormField } from '@/components/Form.vue';
import AiWorkflowEditor from '@/components/AiWorkflowEditor.vue';
import {
  createAiWorkflow,
  getAiWorkflow,
  updateAiWorkflow,
  type AiWorkflow,
  type AiWorkflowDefinition,
  type AiWorkflowForm,
} from '@/api/aiWorkflow';
import {
  createInitialAiWorkflowDefinition,
  getWorkflowValidationErrors,
  normalizeAiWorkflowDefinition,
} from '@/utils/aiWorkflow';

const props = defineProps<{
  row?: AiWorkflow | null;
}>();

const emit = defineEmits<{ success: [] }>();

type WorkflowForm = {
  name: string;
  workflowDefinition: AiWorkflowDefinition;
  aiInstruction: string;
  isEnabled: boolean;
  description: string;
};

const visible = defineModel<boolean>('visible', { required: true });
const loading = ref(false);
const submitting = ref(false);
const formRef = ref<InstanceType<typeof Form>>();

const form = reactive<WorkflowForm>({
  name: '',
  workflowDefinition: createInitialAiWorkflowDefinition(),
  aiInstruction: '',
  isEnabled: true,
  description: '',
});

const fields: FormField[] = [
  {
    prop: 'name',
    label: '工作流名称',
    type: 'input',
    placeholder: '如 通用知识库客服、商品业务客服',
    span: 2,
  },
  {
    prop: 'workflowDefinition',
    label: '流程编排',
    slot: true,
    span: 2,
    hint: '新建流程只保留输入清洗入口。按节点库加入节点，从右侧或底部蓝点拖到目标节点建立流向；保存前必须连通回答节点。',
  },
  {
    prop: 'aiInstruction',
    label: 'AI 执行说明',
    type: 'textarea',
    rows: 6,
    span: 2,
    placeholder: '说明回答边界、资料使用规则、业务术语和资料不足时的处理方式。',
    hint: '此纯文本会随本次实际执行结果一并提供给回答模型；画布控制“是否执行”，说明文本约束“如何理解和回答”。',
  },
  {
    prop: 'isEnabled',
    label: '是否启用',
    component: 'Switch',
    componentProps: { activeText: '启用', inactiveText: '停用' },
  },
  { prop: 'description', label: '备注', type: 'textarea', rows: 3, span: 2 },
];

const rules: FormRules = {
  name: [{ required: true, message: '请输入工作流名称', trigger: 'blur' }],
  aiInstruction: [
    { required: true, message: '请填写给 AI 的执行说明', trigger: 'blur' },
  ],
};

watch(visible, async (value) => {
  if (!value) return;
  loading.value = true;
  try {
    if (props.row?.id) {
      fillForm(await getAiWorkflow(props.row.id));
    } else {
      resetForm();
    }
  } finally {
    loading.value = false;
  }
});

function resetForm() {
  form.name = '';
  form.workflowDefinition = createInitialAiWorkflowDefinition();
  form.aiInstruction = '';
  form.isEnabled = true;
  form.description = '';
}

function fillForm(data: AiWorkflow) {
  form.name = data.name ?? '';
  form.workflowDefinition = normalizeAiWorkflowDefinition(data.workflowDefinition);
  form.aiInstruction = data.aiInstruction ?? '';
  form.isEnabled = Boolean(data.isEnabled);
  form.description = data.description ?? '';
}

function buildPayload(): AiWorkflowForm {
  return {
    name: form.name.trim(),
    workflowDefinition: normalizeAiWorkflowDefinition(form.workflowDefinition),
    aiInstruction: form.aiInstruction.trim(),
    isEnabled: form.isEnabled,
    description: form.description.trim(),
  };
}

async function handleSubmit() {
  await formRef.value?.validate();
  const errors = getWorkflowValidationErrors(form.workflowDefinition);
  if (errors.length) {
    ElMessage.warning(errors[0]);
    return;
  }
  submitting.value = true;
  try {
    if (props.row?.id) {
      await updateAiWorkflow(props.row.id, buildPayload());
      ElMessage.success('工作流已更新');
    } else {
      await createAiWorkflow(buildPayload());
      ElMessage.success('工作流已创建');
    }
    visible.value = false;
    emit('success');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Dialog
    v-model="visible"
    :title="props.row ? '编辑 AI 工作流' : '新增 AI 工作流'"
    width="min(1180px, calc(100vw - 32px))"
    body-max-height="82vh"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <div v-loading="loading">
      <Form
        ref="formRef"
        v-model="form"
        :fields="fields"
        :rules="rules"
        label-width="118px"
        :columns="2"
      >
        <template #field-workflowDefinition>
          <AiWorkflowEditor v-model="form.workflowDefinition" />
        </template>
      </Form>
    </div>
  </Dialog>
</template>
