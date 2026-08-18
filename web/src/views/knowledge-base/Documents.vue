<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import type { FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import {
  getKnowledgeBases,
  getKnowledgeBaseDocuments,
  parseKnowledgeBaseDocument,
  type KnowledgeBase,
  type KnowledgeBaseDocument,
  type KnowledgeBaseParseMode,
} from '@/api/knowledgeBase';

const tableRef = ref<{ refresh: () => Promise<void> }>();
const bases = ref<KnowledgeBase[]>([]);
const parsingKey = ref('');

const baseOptions = computed(() =>
  bases.value.map((item) => ({ label: item.name, value: item.id })),
);
const baseNameMap = computed(() => {
  const map = new Map<number, string>();
  bases.value.forEach((item) => map.set(item.id, item.name));
  return map;
});

const columns: TableColumn[] = [
  { prop: 'title', label: '标题', minWidth: 180 },
  { prop: 'knowledgeBaseId', label: '知识库', minWidth: 160, slot: true },
  { prop: 'sourceType', label: '来源', width: 110, slot: true },
  { prop: 'sourceName', label: '来源名称', minWidth: 180 },
  { prop: 'status', label: '状态', width: 100, slot: true },
  { prop: 'description', label: '处理结果', minWidth: 220, slot: true },
  { prop: 'content', label: '正文', minWidth: 260, slot: true },
  { prop: 'updatedAt', label: '更新时间', width: 180, slot: true },
];

const searchFields = computed<FormField[]>(() => [
  {
    prop: 'knowledgeBaseId',
    label: '知识库',
    type: 'select',
    options: baseOptions.value,
    placeholder: '请选择知识库',
  },
  { prop: 'keyword', label: '关键词', type: 'input', placeholder: '标题/来源/内容' },
]);

function fetchDocuments(params: Record<string, unknown>) {
  return getKnowledgeBaseDocuments(params);
}

async function fetchBases() {
  const res = await getKnowledgeBases({ page: 1, pageSize: 500 });
  bases.value = res.list;
}

function getBaseName(id?: number) {
  return id ? baseNameMap.value.get(id) ?? `#${id}` : '-';
}

function getSourceTypeLabel(value?: string) {
  const map: Record<string, string> = {
    manual: '手动',
    text: '文本',
    pdf: 'PDF',
    word: 'Word',
    mineru: 'MinerU',
  };
  return value ? map[value] ?? value : '-';
}

function getStatusLabel(value?: string) {
  const map: Record<string, string> = {
    draft: '草稿',
    parsed: '已解析',
    pending: '待处理',
    processing: '处理中',
    failed: '失败',
  };
  return value ? map[value] ?? value : '-';
}

function getStatusType(value?: string) {
  if (value === 'parsed') return 'success';
  if (value === 'processing') return 'warning';
  if (value === 'failed') return 'danger';
  return 'info';
}

function isParsing(row: KnowledgeBaseDocument) {
  return parsingKey.value === String(row.id);
}

async function chooseParseMode(): Promise<KnowledgeBaseParseMode | null> {
  try {
    await ElMessageBox.confirm(
      '请选择本次文档解析方式。手动解析会调用系统内置解析器；MinerU 解析会调用第三方配置。',
      '选择解析模式',
      {
        confirmButtonText: 'MinerU 解析',
        cancelButtonText: '手动解析',
        distinguishCancelAndClose: true,
        type: 'info',
      },
    );
    return 'mineru';
  } catch (action) {
    return action === 'cancel' ? 'manual' : null;
  }
}

async function promptMineruFileUrl(row: KnowledgeBaseDocument) {
  try {
    const { value } = await ElMessageBox.prompt(
      '请输入需要 MinerU 解析的文件完整 URL',
      'MinerU 文件地址',
      {
        inputValue: isUrl(row.sourceName) ? row.sourceName : '',
        inputPlaceholder: 'https://example.com/file.pdf',
        confirmButtonText: '开始解析',
        cancelButtonText: '取消',
        inputPattern: /^https?:\/\/.+/i,
        inputErrorMessage: '请输入 http 或 https 开头的完整 URL',
      },
    );
    return value;
  } catch {
    return '';
  }
}

function isUrl(value?: string) {
  if (!value) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

async function handleParse(row: KnowledgeBaseDocument) {
  const parseMode = await chooseParseMode();
  if (!parseMode) return;
  let fileUrl = '';
  if (parseMode === 'mineru') {
    fileUrl = await promptMineruFileUrl(row);
    if (!fileUrl) return;
  }
  parsingKey.value = String(row.id);
  try {
    await parseKnowledgeBaseDocument(row.id, {
      parseMode,
      fileUrl: fileUrl || undefined,
      fileName: row.sourceName || row.title,
      waitForResult: true,
    });
    ElMessage.success(
      `${parseMode === 'mineru' ? 'MinerU' : '手动'}解析任务已提交`,
    );
    await tableRef.value?.refresh();
  } finally {
    parsingKey.value = '';
  }
}

onMounted(fetchBases);
</script>

<template>
  <PageContainer title="知识库文档">
    <Table
      ref="tableRef"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchDocuments"
      :show-actions="false"
      action-width="120"
      perm-module="knowledgeBase"
    >
      <template #column-knowledgeBaseId="{ row }">
        {{ getBaseName(row.knowledgeBaseId) }}
      </template>

      <template #column-sourceType="{ row }">
        <el-tag type="info">{{ getSourceTypeLabel(row.sourceType) }}</el-tag>
      </template>

      <template #column-status="{ row }">
        <el-tag :type="getStatusType(row.status)">
          {{ getStatusLabel(row.status) }}
        </el-tag>
      </template>

      <template #column-description="{ row }">
        <div class="knowledge-documents__result">
          {{ row.description || '-' }}
        </div>
      </template>

      <template #column-content="{ row }">
        <div class="knowledge-documents__content">
          {{ row.content || '-' }}
        </div>
      </template>

      <template #column-updatedAt="{ row }">
        {{ formatDateTime(row.updatedAt) }}
      </template>

      <template #actions="{ row }">
        <Button
          link
          perm="KnowledgeBase.update"
          icon="DocumentChecked"
          :confirm="false"
          :loading="isParsing(row)"
          @click="handleParse(row)"
        >
          解析
        </Button>
      </template>
    </Table>
  </PageContainer>
</template>

<style scoped>
.knowledge-documents__content {
  display: -webkit-box;
  overflow: hidden;
  line-height: 1.6;
  word-break: break-word;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.knowledge-documents__result {
  display: -webkit-box;
  overflow: hidden;
  line-height: 1.6;
  word-break: break-word;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
</style>
