<script setup lang="ts">
import { ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import Dialog from '@/components/Dialog.vue';
import Button from '@/components/Button.vue';
import type { FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import {
  batchDeleteKnowledgeAiChatSessions,
  deleteKnowledgeAiChatSession,
  getKnowledgeAiChatSession,
  getKnowledgeAiChatSessions,
  type KnowledgeAiChatSession,
  type KnowledgeAiChatSessionDetail,
  type QueryKnowledgeAiChatSessionParams,
} from '@/api/knowledgeAiChat';

const tableRef = ref<{
  refresh: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();
const detailVisible = ref(false);
const detailLoading = ref(false);
const currentDetail = ref<KnowledgeAiChatSessionDetail | null>(null);

const columns: TableColumn[] = [
  { prop: 'title', label: '会话标题', minWidth: 220 },
  { prop: 'providerName', label: '大模型账号', minWidth: 160 },
  { prop: 'model', label: '模型', minWidth: 140 },
  { prop: 'messageCount', label: '轮次', width: 90 },
  { prop: 'isSuccess', label: '状态', width: 90, slot: true },
  { prop: 'lastQuestion', label: '最近问题', minWidth: 220 },
  { prop: 'elapsedMilliseconds', label: '耗时', width: 110, slot: true },
  { prop: 'createdAt', label: '创建时间', width: 180, slot: true },
];

const searchFields: FormField[] = [
  {
    prop: 'keyword',
    label: '关键词',
    type: 'input',
    placeholder: '标题/账号/模型/问题/回答',
  },
];

function fetchSessions(params: Record<string, unknown>) {
  return getKnowledgeAiChatSessions(params as QueryKnowledgeAiChatSessionParams);
}

function deleteRequest(row: KnowledgeAiChatSession) {
  return deleteKnowledgeAiChatSession(row.id);
}

async function batchDeleteRequest(payload: { ids: Array<string | number> }) {
  await batchDeleteKnowledgeAiChatSessions(payload.ids);
}

async function handleView(row: KnowledgeAiChatSession) {
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    currentDetail.value = await getKnowledgeAiChatSession(row.id);
  } finally {
    detailLoading.value = false;
  }
}
</script>

<template>
  <PageContainer title="问题记录">
    <Table
      ref="tableRef"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchSessions"
      :checkAble="true"
      :show-edit="false"
      :delete-request="deleteRequest"
      :batch-delete-request="batchDeleteRequest"
      @view="handleView"
    >
      <template #toolbar>
        <Button
          icon="Delete"
          type="danger"
          :confirm="false"
          @click="tableRef?.runBatchDelete()"
        >
          批量删除
        </Button>
      </template>

      <template #column-isSuccess="{ row }">
        <el-tag :type="row.isSuccess ? 'success' : 'danger'">
          {{ row.isSuccess ? '成功' : '失败' }}
        </el-tag>
      </template>

      <template #column-elapsedMilliseconds="{ row }">
        {{ row.elapsedMilliseconds }} ms
      </template>

      <template #column-createdAt="{ row }">
        {{ formatDateTime(row.createdAt) }}
      </template>
    </Table>

    <Dialog v-model="detailVisible" title="问答详情" width="900px" :show-footer="false">
      <div v-loading="detailLoading">
        <el-empty v-if="!currentDetail?.messages.length" description="暂无问答内容" />
        <div
          v-for="message in currentDetail?.messages || []"
          :key="message.id"
          class="ai-record__message"
          :class="{ 'is-error': !message.isSuccess }"
        >
          <div class="ai-record__question">{{ message.question }}</div>
          <div class="ai-record__answer">
            {{ message.answer || message.errorMessage || '-' }}
          </div>
          <div class="ai-record__meta">
            {{ message.providerName }} / {{ message.model }} /
            {{ message.elapsedMilliseconds }} ms /
            {{ formatDateTime(message.createdAt) }}
          </div>
        </div>
      </div>
    </Dialog>
  </PageContainer>
</template>

<style scoped>
.ai-record__message {
  padding: 14px 0;
  border-bottom: 1px solid #ebeef5;
}

.ai-record__question {
  margin-bottom: 8px;
  color: #303133;
  font-weight: 600;
  white-space: pre-wrap;
}

.ai-record__answer {
  color: #606266;
  line-height: 1.6;
  white-space: pre-wrap;
}

.ai-record__message.is-error .ai-record__answer {
  color: #f56c6c;
}

.ai-record__meta {
  margin-top: 8px;
  color: #909399;
  font-size: 12px;
}
</style>
