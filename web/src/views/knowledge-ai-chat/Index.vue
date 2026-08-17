<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Form, { type FormField } from '@/components/Form.vue';
import {
  askKnowledgeAi,
  type KnowledgeAiChatMessage,
} from '@/api/knowledgeAiChat';

const sending = ref(false);
const sessionId = ref<number>();
const lastMessage = ref<KnowledgeAiChatMessage>();
const formRef = ref<InstanceType<typeof Form>>();

const form = reactive({
  systemPrompt:
    '你是洗车小程序客服助手。只能根据给定知识库文档回答，回答要简洁、准确、面向用户。',
  question:
    '用户问题：如何充值？\n\n知识库文档：\n用户可以在小程序余额页面进行充值。',
});

const fields = computed<FormField[]>(() => [
  {
    prop: 'systemPrompt',
    label: '系统提示',
    type: 'textarea',
    rows: 4,
  },
  {
    prop: 'question',
    label: '问题',
    type: 'textarea',
    rows: 8,
  },
]);

const rules: FormRules = {
  question: [{ required: true, message: '请输入问题', trigger: 'blur' }],
};

async function handleAsk() {
  await formRef.value?.validate();
  sending.value = true;
  try {
    const result = await askKnowledgeAi({
      question: form.question,
      systemPrompt: form.systemPrompt,
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
</script>

<template>
  <PageContainer title="AI 问答测试">
    <div class="ai-chat-form">
      <Form ref="formRef" v-model="form" :fields="fields" :rules="rules" label-width="90px" />
      <div class="ai-chat-form__actions">
        <Button type="primary" icon="Promotion" :loading="sending" @click="handleAsk">
          发送问题
        </Button>
        <Button icon="Refresh" @click="startNewSession">新会话</Button>
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
