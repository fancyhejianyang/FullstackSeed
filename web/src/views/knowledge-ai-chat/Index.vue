<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Form, { type FormField } from '@/components/Form.vue';
import {
  getKnowledgeAiProviders,
  type KnowledgeAiProvider,
} from '@/api/knowledgeAiProvider';
import {
  askKnowledgeAi,
  type KnowledgeAiChatMessage,
} from '@/api/knowledgeAiChat';

const loadingProviders = ref(false);
const sending = ref(false);
const providers = ref<KnowledgeAiProvider[]>([]);
const sessionId = ref<number>();
const messages = ref<KnowledgeAiChatMessage[]>([]);
const formRef = ref<InstanceType<typeof Form>>();

const form = reactive({
  providerId: undefined as number | undefined,
  model: '',
  systemPrompt:
    '你是洗车小程序客服助手。只能根据给定知识库文档回答，回答要简洁、准确、面向用户。',
  question:
    '用户问题：如何充值？\n\n知识库文档：\n用户可以在小程序余额页面进行充值。',
});

const providerOptions = computed(() =>
  providers.value
    .filter((provider) => provider.isEnabled)
    .map((provider) => ({
      label: provider.name,
      value: provider.id,
    })),
);

const selectedProvider = computed(() =>
  providers.value.find((provider) => provider.id === Number(form.providerId)),
);

const modelOptions = computed(() => getModelOptions(selectedProvider.value?.models ?? ''));

const fields = computed<FormField[]>(() => [
  {
    prop: 'providerId',
    label: '大模型账号',
    type: 'select',
    options: providerOptions.value,
    placeholder: '请选择大模型账号',
  },
  {
    prop: 'model',
    label: '模型',
    type: 'select',
    options: modelOptions.value,
    placeholder: '请选择模型',
  },
  {
    prop: 'systemPrompt',
    label: '系统提示',
    type: 'textarea',
    rows: 3,
  },
  {
    prop: 'question',
    label: '问题',
    type: 'textarea',
    rows: 6,
  },
]);

const rules: FormRules = {
  providerId: [{ required: true, message: '请选择大模型账号', trigger: 'change' }],
  model: [{ required: true, message: '请选择模型', trigger: 'change' }],
  question: [{ required: true, message: '请输入问题', trigger: 'blur' }],
};

function getModelOptions(models: string) {
  return (models || 'qwen-plus')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [code, name] = line.split('#');
      return {
        label: name || code,
        value: code,
      };
    });
}

async function fetchProviders() {
  loadingProviders.value = true;
  try {
    const res = await getKnowledgeAiProviders({ page: 1, pageSize: 1000 });
    providers.value = res.list;
    if (!form.providerId && providerOptions.value.length) {
      form.providerId = Number(providerOptions.value[0].value);
    }
  } finally {
    loadingProviders.value = false;
  }
}

watch(
  () => form.providerId,
  () => {
    form.model = String(modelOptions.value[0]?.value ?? '');
  },
);

async function handleAsk() {
  await formRef.value?.validate();
  if (!form.providerId) {
    ElMessage.warning('请选择大模型账号');
    return;
  }
  sending.value = true;
  try {
    const result = await askKnowledgeAi({
      providerId: Number(form.providerId),
      model: form.model,
      question: form.question,
      systemPrompt: form.systemPrompt,
      sessionId: sessionId.value,
    });
    sessionId.value = result.session.id;
    messages.value = [...messages.value, result.message];
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
  messages.value = [];
}

onMounted(fetchProviders);
</script>

<template>
  <PageContainer title="AI 问答测试">
    <div v-loading="loadingProviders" class="ai-chat">
      <div class="ai-chat__form">
        <Form ref="formRef" v-model="form" :fields="fields" :rules="rules" label-width="100px" />
        <div class="ai-chat__actions">
          <Button type="primary" icon="Promotion" :loading="sending" @click="handleAsk">
            发送问题
          </Button>
          <Button icon="Refresh" @click="startNewSession">新会话</Button>
        </div>
      </div>

      <div class="ai-chat__messages">
        <el-empty v-if="!messages.length" description="暂无问答内容" />
        <div
          v-for="message in messages"
          :key="message.id"
          class="ai-chat__message"
          :class="{ 'is-error': !message.isSuccess }"
        >
          <div class="ai-chat__question">{{ message.question }}</div>
          <div class="ai-chat__answer">
            {{ message.answer || message.errorMessage || '-' }}
          </div>
          <div class="ai-chat__meta">
            {{ message.providerName }} / {{ message.model }} / {{ message.elapsedMilliseconds }} ms
          </div>
        </div>
      </div>
    </div>
  </PageContainer>
</template>

<style scoped>
.ai-chat {
  display: grid;
  grid-template-columns: minmax(360px, 520px) minmax(0, 1fr);
  gap: 20px;
}

.ai-chat__form {
  min-width: 0;
}

.ai-chat__actions {
  display: flex;
  gap: 10px;
  padding-left: 100px;
}

.ai-chat__messages {
  min-width: 0;
  padding-left: 20px;
  border-left: 1px solid #ebeef5;
}

.ai-chat__message {
  padding: 12px 0;
  border-bottom: 1px solid #ebeef5;
}

.ai-chat__question {
  margin-bottom: 8px;
  color: #303133;
  font-weight: 600;
  white-space: pre-wrap;
}

.ai-chat__answer {
  color: #606266;
  line-height: 1.6;
  white-space: pre-wrap;
}

.ai-chat__message.is-error .ai-chat__answer {
  color: #f56c6c;
}

.ai-chat__meta {
  margin-top: 8px;
  color: #909399;
  font-size: 12px;
}

@media (max-width: 960px) {
  .ai-chat {
    grid-template-columns: 1fr;
  }

  .ai-chat__messages {
    padding-left: 0;
    border-left: 0;
  }
}
</style>
