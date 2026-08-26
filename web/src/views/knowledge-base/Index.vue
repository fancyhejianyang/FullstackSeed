<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import type { FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import {
  batchDeleteKnowledgeBases,
  chunkKnowledgeBase,
  deleteKnowledgeBase,
  getKnowledgeBaseCategoryTree,
  getKnowledgeBases,
  indexKnowledgeBase,
  parseKnowledgeBase,
  type KnowledgeBase,
  type KnowledgeBaseCategoryTreeNode,
  type KnowledgeBaseParseMode,
} from '@/api/knowledgeBase';
import Edit from './Edit.vue';
import View from './View.vue';

const tableRef = ref<{
  refresh: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();
const categoryTree = ref<KnowledgeBaseCategoryTreeNode[]>([]);

const columns: TableColumn[] = [
  { prop: 'name', label: '名称', minWidth: 180 },
  { prop: 'lastProcessMessage', label: '处理结果', width: 250, slot: true },
  { prop: 'categoryId', label: '所属分类', minWidth: 140, slot: true },
  { prop: 'hitKeywords', label: '命中关键字', minWidth: 180, slot: true },
  { prop: 'matchPriority', label: '匹配优先级', width: 110 },
  { prop: 'contentType', label: '内容类型', width: 110, slot: true },
  { prop: 'processStage', label: '处理阶段', width: 120, slot: true },
  { prop: 'fileName', label: '文件', width: 250, slot: true },
  { prop: 'isEnabled', label: '状态', width: 90, slot: true },
  { prop: 'updatedAt', label: '更新时间', width: 180, slot: true },
];

const searchFields: FormField[] = [
  { prop: 'keyword', label: '关键词', type: 'input', placeholder: '名称/关键字' },
];

const editVisible = ref(false);
const viewVisible = ref(false);
const editingRow = ref<KnowledgeBase | null>(null);
const viewingRow = ref<KnowledgeBase | null>(null);
const processingKey = ref('');
const categoryNameMap = computed(() => {
  const map = new Map<number, string>();
  flattenCategories(categoryTree.value).forEach((item) => {
    map.set(item.id, item.name);
  });
  return map;
});

function fetchKnowledgeBases(params: Record<string, unknown>) {
  return getKnowledgeBases(params);
}

function flattenCategories(
  nodes: KnowledgeBaseCategoryTreeNode[],
): KnowledgeBaseCategoryTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenCategories(node.children ?? [])]);
}

async function fetchCategories() {
  categoryTree.value = await getKnowledgeBaseCategoryTree({});
}

function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}

function handleEdit(row: KnowledgeBase) {
  editingRow.value = row;
  editVisible.value = true;
}

function handleView(row: KnowledgeBase) {
  viewingRow.value = row;
  viewVisible.value = true;
}

function deleteRequest(row: KnowledgeBase) {
  return deleteKnowledgeBase(row.id);
}

async function batchDeleteRequest(payload: { ids: Array<string | number> }) {
  await batchDeleteKnowledgeBases(payload.ids);
}

function getContentTypeLabel(value: KnowledgeBase['contentType']) {
  const map: Record<string, string> = {
    text: '文本',
    pdf: 'PDF',
    word: 'Word',
    image: '图片',
    file: '文件',
    mixed: '混合',
  };
  return map[value] ?? value;
}

function getCategoryName(categoryId?: number | null) {
  if (!categoryId) return '-';
  return categoryNameMap.value.get(categoryId) ?? `#${categoryId}`;
}

function getStageLabel(stage?: string) {
  const map: Record<string, string> = {
    draft: '待补充',
    ready: '待解析',
    uploaded: '待解析',
    parsing: '解析中',
    parsed: '已解析',
    chunking: '分片中',
    chunked: '已分片',
    indexing: '索引中',
    indexed: '已索引',
    failed: '处理失败',
  };
  return stage ? map[stage] ?? stage : '-';
}

function getStageType(stage?: string) {
  if (stage === 'indexed') return 'success';
  if (stage === 'failed') return 'danger';
  if (stage === 'parsing' || stage === 'chunking' || stage === 'indexing') {
    return 'warning';
  }
  if (stage === 'parsed' || stage === 'chunked') return 'primary';
  return 'info';
}

function canParse(row: KnowledgeBase) {
  if (row.contentType === 'text') return !!row.contentText?.trim();
  return !!row.fileUrl;
}

function canChunk(row: KnowledgeBase) {
  return row.parseStatus === 'success';
}

function canIndex(row: KnowledgeBase) {
  return row.chunkStatus === 'success';
}

function isProcessing(row: KnowledgeBase, action: string) {
  return processingKey.value === `${action}:${row.id}`;
}

async function runProcess(
  row: KnowledgeBase,
  action: 'parse' | 'chunk' | 'index',
) {
  let parseMode: KnowledgeBaseParseMode | undefined;
  if (action === 'parse') {
    const chosen = await chooseParseMode();
    // 用户取消或关闭弹窗时终止流程
    if (!chosen) return;
    parseMode = chosen;
  }
  const actionMap = {
    parse: {
      label: parseMode === 'mineru' ? 'MinerU 解析' : '手动解析',
      request: (id: number) => parseKnowledgeBase(id, { parseMode }),
    },
    chunk: { label: '分片', request: chunkKnowledgeBase },
    index: { label: '索引', request: indexKnowledgeBase },
  };
  processingKey.value = `${action}:${row.id}`;
  try {
    await actionMap[action].request(row.id);
    ElMessage.success(`${actionMap[action].label}任务已提交`);
    await tableRef.value?.refresh();
  } finally {
    processingKey.value = '';
  }
}

async function chooseParseMode(): Promise<KnowledgeBaseParseMode | null> {
  try {
    await ElMessageBox.confirm(
      '请选择本次解析方式。手动解析优先走系统内置逻辑；MinerU 解析会调用第三方配置。',
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

async function handleDelete(row: KnowledgeBase) {
  await deleteKnowledgeBase(row.id);
  ElMessage.success('删除成功');
  await tableRef.value?.refresh();
}

onMounted(fetchCategories);
</script>

<template>
  <PageContainer title="知识库列表">
    <Table
      ref="tableRef"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchKnowledgeBases"
      :checkAble="true"
      :delete-request="deleteRequest"
      :batch-delete-request="batchDeleteRequest"
      :show-actions="false"
      :fit="false"
      action-width="380"
      perm-module="knowledgeBase"
    >
      <template #toolbar>
        <Button perm="KnowledgeBase.create" icon="Plus" @click="openCreate">
          新增知识库
        </Button>
        <Button
          perm="KnowledgeBase.batchDelete"
          :confirm="false"
          @click="tableRef?.runBatchDelete()"
        >
          批量删除
        </Button>
      </template>

      <template #column-isEnabled="{ row }">
        <el-tag :type="row.isEnabled ? 'success' : 'info'">
          {{ row.isEnabled ? '启用' : '停用' }}
        </el-tag>
      </template>

      <template #column-categoryId="{ row }">
        {{ getCategoryName(row.categoryId) }}
      </template>

      <template #column-contentType="{ row }">
        <el-tag type="info">{{ getContentTypeLabel(row.contentType) }}</el-tag>
      </template>

      <template #column-hitKeywords="{ row }">
        <div class="knowledge-base-index__process-result">
          {{ row.hitKeywords || '-' }}
        </div>
      </template>

      <template #column-processStage="{ row }">
        <el-tooltip
          v-if="row.lastProcessMessage"
          :content="row.lastProcessMessage"
          placement="top"
        >
          <el-tag :type="getStageType(row.processStage)">
            {{ getStageLabel(row.processStage) }}
          </el-tag>
        </el-tooltip>
        <el-tag v-else :type="getStageType(row.processStage)">
          {{ getStageLabel(row.processStage) }}
        </el-tag>
      </template>

      <template #column-lastProcessMessage="{ row }">
        <div class="knowledge-base-index__process-result">
          {{ row.lastProcessMessage || '-' }}
        </div>
      </template>

      <template #column-fileName="{ row }">
        <el-tooltip
          v-if="row.fileUrl"
          :content="row.fileName || '下载文件'"
          placement="top"
        >
          <el-link
            type="primary"
            :href="row.fileUrl"
            target="_blank"
            class="knowledge-base-index__file-link"
          >
            {{ row.fileName || '下载文件' }}
          </el-link>
        </el-tooltip>
        <span v-else>-</span>
      </template>

      <template #column-updatedAt="{ row }">
        {{ formatDateTime(row.updatedAt) }}
      </template>

      <template #actions="{ row }">
        <Button link type="info" :confirm="false" @click="handleView(row)">
          查看
        </Button>
        <Button link type="primary" :confirm="false" @click="handleEdit(row)">
          编辑
        </Button>
        <Button link perm="KnowledgeBase.delete" icon="" @click="handleDelete(row)">
          删除
        </Button>
        <Button
          link
          perm="KnowledgeBase.update"
          icon="DocumentChecked"
          :confirm="false"
          :disabled="!canParse(row)"
          :loading="isProcessing(row, 'parse')"
          @click="runProcess(row, 'parse')"
        >
          解析
        </Button>
        <Button
          link
          perm="KnowledgeBase.update"
          icon="Operation"
          :confirm="false"
          :disabled="!canChunk(row)"
          :loading="isProcessing(row, 'chunk')"
          @click="runProcess(row, 'chunk')"
        >
          分片
        </Button>
        <Button
          link
          perm="KnowledgeBase.update"
          icon="Connection"
          :confirm="false"
          :disabled="!canIndex(row)"
          :loading="isProcessing(row, 'index')"
          @click="runProcess(row, 'index')"
        >
          索引
        </Button>
      </template>
    </Table>

    <Edit
      v-model:visible="editVisible"
      :row="editingRow"
      @success="tableRef?.refresh(); fetchCategories()"
    />

    <View
      v-model:visible="viewVisible"
      :row="viewingRow"
      :category-name="getCategoryName(viewingRow?.categoryId)"
    />
  </PageContainer>
</template>

<style scoped>
.knowledge-base-index__process-result {
  display: -webkit-box;
  overflow: hidden;
  line-height: 1.6;
  word-break: break-word;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.knowledge-base-index__file-link {
  max-width: 250px;
  overflow: hidden;
  vertical-align: middle;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
