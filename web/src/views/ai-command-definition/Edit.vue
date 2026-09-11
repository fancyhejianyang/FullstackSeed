<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import Dialog from '@/components/Dialog.vue';
import Form, { type FormField } from '@/components/Form.vue';
import {
  getAiCommandDefinition,
  updateAiCommandDefinition,
  type AiCommandDefinition,
  type UpdateAiCommandDefinitionForm,
} from '@/api/aiCommandDefinition';

const props = defineProps<{ row?: AiCommandDefinition | null }>();
const emit = defineEmits<{ success: [] }>();
const visible = defineModel<boolean>('visible', { required: true });
const formRef = ref<InstanceType<typeof Form>>();
const loading = ref(false);
const submitting = ref(false);
const mapping = ref<AiCommandDefinition | null>(null);

const form = reactive({
  name: '',
  semanticKeywordsText: '',
  chatCallable: false,
  requireApproval: false,
  isEnabled: true,
  description: '',
});

const fields = computed<FormField[]>(() => [
  { prop: 'name', label: '指令名称', type: 'input' },
  {
    prop: 'semanticKeywordsText',
    label: '语义关键词',
    type: 'textarea',
    rows: 2,
    placeholder: '使用逗号分隔，用于模型/编排层识别该能力',
  },
  {
    prop: 'chatCallable',
    label: '聊天可调用',
    component: 'Switch',
    componentProps: { activeText: '允许', inactiveText: '禁止' },
  },
  {
    prop: 'requireApproval',
    label: '需要人工确认',
    component: 'Switch',
    componentProps: { activeText: '需要', inactiveText: '不需要' },
  },
  {
    prop: 'isEnabled',
    label: '是否启用',
    component: 'Switch',
    componentProps: { activeText: '启用', inactiveText: '停用' },
  },
  { prop: 'description', label: '说明', type: 'textarea', rows: 3 },
]);

const rules: FormRules = {
  name: [{ required: true, message: '请输入指令名称', trigger: 'blur' }],
};

watch(visible, async (value) => {
  if (!value || !props.row?.id) return;
  loading.value = true;
  try {
    fillForm(await getAiCommandDefinition(props.row.id));
  } finally {
    loading.value = false;
  }
});

function fillForm(data: AiCommandDefinition) {
  mapping.value = data;
  form.name = data.name;
  form.semanticKeywordsText = (data.semanticKeywords ?? []).join(', ');
  form.chatCallable = !!data.chatCallable;
  form.requireApproval = !!data.requireApproval;
  form.isEnabled = !!data.isEnabled;
  form.description = data.description ?? '';
}

function buildPayload(): UpdateAiCommandDefinitionForm {
  return {
    name: form.name.trim(),
    semanticKeywords: Array.from(
      new Set(form.semanticKeywordsText.split(/[,，\r?\n]/).map((item) => item.trim()).filter(Boolean)),
    ),
    chatCallable: form.chatCallable,
    requireApproval: form.requireApproval,
    isEnabled: form.isEnabled,
    description: form.description.trim(),
  };
}

async function handleSubmit() {
  await formRef.value?.validate();
  submitting.value = true;
  try {
    await updateAiCommandDefinition(props.row!.id, buildPayload());
    ElMessage.success('指令配置已更新');
    visible.value = false;
    emit('success');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Dialog v-model="visible" title="编辑 AI 指令" width="860px" :confirm-loading="submitting" @confirm="handleSubmit">
    <div v-loading="loading">
      <div v-if="mapping" class="ai-command-definition-edit__mapping">
        <div><span>指令标识</span><code>{{ mapping.commandKey }}</code></div>
        <div><span>执行目标</span><code>{{ mapping.executionTarget }}</code></div>
        <div><span>调用映射</span><code>{{ mapping.apiMethod }} {{ mapping.apiPath }}</code></div>
        <div><span>执行方式</span><el-tag type="info">{{ mapping.executionMode === 'service' ? '内部服务' : '管理 API' }}</el-tag></div>
        <div class="ai-command-definition-edit__contract">
          <span>请求参数</span><pre>{{ mapping.requestSchema }}</pre>
        </div>
        <div class="ai-command-definition-edit__contract">
          <span>上下文绑定</span><pre>{{ mapping.contextBindings }}</pre>
        </div>
      </div>
      <Form ref="formRef" v-model="form" :fields="fields" :rules="rules" label-width="120px" />
      <div class="ai-command-definition-edit__tip">
        执行目标、请求参数 Schema 和上下文绑定由系统白名单在服务启动时同步，不能改为任意 URL。人工可维护名称、关键词、启停和聊天授权；上下文中的 <code>$chat</code>、<code>$session</code>、<code>$operator</code> 由服务端注入，模型不能自行伪造。
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.ai-command-definition-edit__mapping {
  display: grid;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: #f8fafc;
  color: #606266;
  font-size: 13px;
}

.ai-command-definition-edit__mapping span {
  display: inline-block;
  width: 72px;
  color: #909399;
}

.ai-command-definition-edit__mapping code,
.ai-command-definition-edit__tip code {
  color: #409eff;
}

.ai-command-definition-edit__contract {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  align-items: start;
}

.ai-command-definition-edit__contract pre {
  margin: 0;
  padding: 8px;
  overflow: auto;
  border-radius: 4px;
  background: #eef3f8;
  color: #475569;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-command-definition-edit__tip {
  margin-top: 8px;
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}
</style>
