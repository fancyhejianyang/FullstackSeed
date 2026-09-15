<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Form, { type FormField } from '@/components/Form.vue';
import {
  askKnowledgeAi,
  type KnowledgeAiChatMessage,
} from '@/api/knowledgeAiChat';
import {
  getAiFeatureConfigs,
  type AiFeatureConfig,
} from '@/api/aiFeatureConfig';
import { getAiWorkflows, type AiWorkflow } from '@/api/aiWorkflow';

const sending = ref(false);
const sessionId = ref<number>();
const lastMessage = ref<KnowledgeAiChatMessage>();
const formRef = ref<InstanceType<typeof Form>>();
const chatConfigs = ref<AiFeatureConfig[]>([]);
const workflows = ref<AiWorkflow[]>([]);

const form = reactive({
  aiFeatureConfigId: '',
  workflowId: '',
  question: '',
});

const fields = computed<FormField[]>(() => [
  {
    prop: 'aiFeatureConfigId',
    label: '聊天配置',
    type: 'select',
    componentProps: { disabled: sending.value },
    placeholder: '请选择已启用的聊天配置',
    options: chatConfigs.value.map((item) => ({
        label: item.name,
        value: item.id,
      })),
  },
  {
    prop: 'workflowId',
    label: '工作流',
    type: 'select',
    componentProps: { disabled: sending.value },
    placeholder: '请选择已启用的工作流',
    options: workflows.value.map((item) => ({
      label: item.name,
      value: item.id,
    })),
    hint: '按所选工作流执行，并使用其关联的检索配置。',
  },
  {
    prop: 'question',
    label: '问题',
    type: 'textarea',
    componentProps: { disabled: sending.value },
    rows: 8,
  },
]);

const rules: FormRules = {
  aiFeatureConfigId: [{ required: true, message: '请选择聊天配置', trigger: 'change' }],
  workflowId: [{ required: true, message: '请选择工作流', trigger: 'change' }],
  question: [{ required: true, message: '请输入问题', trigger: 'blur' }],
};

async function handleAsk() {
  if (sending.value) return;
  await formRef.value?.validate();
  sending.value = true;
  try {
    const result = await askKnowledgeAi({
      question: form.question,
      workflowId: Number(form.workflowId),
      aiFeatureConfigId: Number(form.aiFeatureConfigId),
      sessionId: sessionId.value,
    });
    sessionId.value = result.session.id;
    lastMessage.value = result.message;
    if (result.message.isSuccess) {
      ElMessage.success('问答调用成功');
    } else {
      ElMessage.error(result.message.errorMessage || '问答调用失败');
    }
  } finally {
    sending.value = false;
  }
}

function startNewSession() {
  sessionId.value = undefined;
  lastMessage.value = undefined;
}

async function fetchChatConfigs() {
  const result = await getAiFeatureConfigs({
    page: 1,
    pageSize: 200,
    featureType: 'chat',
    isEnabled: true,
  });
  chatConfigs.value = result.list.filter((item) => item.isEnabled);
}

watch(
  () => [form.aiFeatureConfigId, form.workflowId],
  startNewSession,
);

async function fetchWorkflows() {
  const result = await getAiWorkflows({
    page: 1,
    pageSize: 200,
    isEnabled: true,
  });
  workflows.value = result.list.filter((item) => item.isEnabled);
}

onMounted(async () => {
  await Promise.allSettled([fetchChatConfigs(), fetchWorkflows()]);
});
</script>

<template>
  <PageContainer title="AI 问答测试">
    <div class="ai-chat-form">
      <Form ref="formRef" v-model="form" :fields="fields" :rules="rules" label-width="90px" />
      <div class="ai-chat-form__actions">
        <Button type="primary" icon="Promotion" :loading="sending" @click="handleAsk">
          发送问题
        </Button>
        <Button icon="Refresh" :disabled="sending" @click="startNewSession">新会话</Button>
      </div>

      <div v-if="lastMessage" class="ai-chat-form__result">
        <div class="ai-chat-form__result-title">测试结果</div>
        <div class="ai-chat-form__answer" :class="{ 'is-error': !lastMessage.isSuccess }">
          {{ lastMessage.answer || lastMessage.errorMessage || '-' }}
        </div>
        <div class="ai-chat-form__meta">
          {{ lastMessage.providerName || '-' }} / {{ lastMessage.model || '-' }} /
          {{ lastMessage.elapsedMilliseconds }} ms
        </div>
      </div>
    </div>
  </PageContainer>
</template>

<style scoped>
.ai-chat-form {
  width: 100%;
}

.ai-chat-form__actions {
  display: flex;
  gap: 10px;
  padding-left: 90px;
}

.ai-chat-form__result {
  margin-top: 20px;
  padding-left: 90px;
}

.ai-chat-form__result-title {
  margin-bottom: 8px;
  color: #303133;
  font-weight: 600;
}

.ai-chat-form__answer {
  min-height: 96px;
  padding: 12px;
  color: #606266;
  line-height: 1.6;
  white-space: pre-wrap;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: #fff;
}

.ai-chat-form__answer.is-error {
  color: #f56c6c;
}

.ai-chat-form__meta {
  margin-top: 8px;
  color: #909399;
  font-size: 12px;
}

@media (max-width: 720px) {
  .ai-chat-form__actions,
  .ai-chat-form__result {
    padding-left: 0;
  }
}
</style>
