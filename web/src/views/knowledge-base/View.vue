<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Button from '@/components/Button.vue';
import { formatDateTime } from '@/utils/format';
import {
  getKnowledgeBaseChunks,
  type KnowledgeBase,
  type KnowledgeBaseChunk,
} from '@/api/knowledgeBase';

const props = defineProps<{
  row?: KnowledgeBase | null;
  categoryName?: string;
}>();

const visible = defineModel<boolean>('visible', { required: true });
const rowData = computed(() => props.row);
const activeTab = ref('basic');
const chunkKeyword = ref('');
const chunkLoading = ref(false);
const chunks = ref<KnowledgeBaseChunk[]>([]);
const chunkTotal = ref(0);
const chunkPage = ref(1);
const chunkPageSize = ref(10);

function getContentTypeLabel(value?: KnowledgeBase['contentType']) {
  const map: Record<string, string> = {
    text: '文本',
    pdf: 'PDF',
    word: 'Word',
    file: '文件',
    mixed: '混合',
  };
  return value ? map[value] ?? value : '-';
}

function getStatusLabel(status?: string) {
  const map: Record<string, string> = {
    pending: '待处理',
    processing: '处理中',
    success: '成功',
    failed: '失败',
  };
  return status ? map[status] ?? status : '-';
}

async function fetchChunks() {
  if (!rowData.value?.id) return;
  chunkLoading.value = true;
  try {
    const res = await getKnowledgeBaseChunks({
      page: chunkPage.value,
      pageSize: chunkPageSize.value,
      knowledgeBaseId: rowData.value.id,
      keyword: chunkKeyword.value,
    });
    chunks.value = res.list;
    chunkTotal.value = res.total;
  } finally {
    chunkLoading.value = false;
  }
}

function handleChunkSearch() {
  chunkPage.value = 1;
  void fetchChunks();
}

function handleTabChange(name: string | number) {
  if (name === 'chunks') {
    void fetchChunks();
  }
}

watch(visible, (value) => {
  if (!value) return;
  activeTab.value = 'basic';
  chunkKeyword.value = '';
  chunkPage.value = 1;
  chunks.value = [];
  chunkTotal.value = 0;
});
</script>

<template>
  <el-drawer
    v-model="visible"
    title="查看知识库"
    size="100%"
    append-to-body
    destroy-on-close
  >
    <el-tabs v-model="activeTab" class="knowledge-base-view" @tab-change="handleTabChange">
      <el-tab-pane label="基础信息" name="basic">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="名称">
            {{ rowData?.name || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="所属分类">
            {{ props.categoryName || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="编码">
            {{ rowData?.code || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="rowData?.isEnabled ? 'success' : 'info'">
              {{ rowData?.isEnabled ? '启用' : '停用' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="内容类型">
            {{ getContentTypeLabel(rowData?.contentType) }}
          </el-descriptions-item>
          <el-descriptions-item label="处理阶段">
            {{ rowData?.processStage || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="解析状态">
            {{ getStatusLabel(rowData?.parseStatus) }}
          </el-descriptions-item>
          <el-descriptions-item label="分片状态">
            {{ getStatusLabel(rowData?.chunkStatus) }}
          </el-descriptions-item>
          <el-descriptions-item label="索引状态">
            {{ getStatusLabel(rowData?.indexStatus) }}
          </el-descriptions-item>
          <el-descriptions-item label="处理消息">
            {{ rowData?.lastProcessMessage || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ rowData?.createdAt ? formatDateTime(rowData.createdAt) : '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">
            {{ rowData?.updatedAt ? formatDateTime(rowData.updatedAt) : '-' }}
          </el-descriptions-item>
        </el-descriptions>
      </el-tab-pane>

      <el-tab-pane label="内容" name="content">
        <div v-if="rowData?.contentType === 'text'" class="knowledge-base-view__text">
          {{ rowData?.contentText || '-' }}
        </div>
        <div v-else class="knowledge-base-view__file">
          <span>文件：</span>
          <el-link
            v-if="rowData?.fileUrl"
            type="primary"
            :href="rowData.fileUrl"
            target="_blank"
          >
            {{ rowData.fileName || '下载文件' }}
          </el-link>
          <span v-else>-</span>
        </div>
      </el-tab-pane>

      <el-tab-pane label="分片内容" name="chunks">
        <div class="knowledge-base-view__chunk-toolbar">
          <el-input
            v-model="chunkKeyword"
            clearable
            placeholder="搜索标题/内容"
            @keyup.enter="handleChunkSearch"
          />
          <Button type="primary" icon="Search" :confirm="false" @click="handleChunkSearch">
            查询
          </Button>
          <Button
            :confirm="false"
            @click="
              chunkKeyword = '';
              handleChunkSearch();
            "
          >
            重置
          </Button>
        </div>

        <el-table v-loading="chunkLoading" :data="chunks" border stripe>
          <el-table-column prop="chunkIndex" label="序号" width="90" />
          <el-table-column prop="title" label="标题" min-width="180" />
          <el-table-column prop="content" label="内容" min-width="420">
            <template #default="{ row }">
              <div class="knowledge-base-view__chunk-content">
                {{ row.content || '-' }}
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="tokenCount" label="Token数" width="100" />
          <el-table-column prop="updatedAt" label="更新时间" width="180">
            <template #default="{ row }">
              {{ row.updatedAt ? formatDateTime(row.updatedAt) : '-' }}
            </template>
          </el-table-column>
        </el-table>

        <div class="knowledge-base-view__pagination">
          <el-pagination
            v-model:current-page="chunkPage"
            v-model:page-size="chunkPageSize"
            :total="chunkTotal"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            @current-change="fetchChunks"
            @size-change="handleChunkSearch"
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <div class="knowledge-base-view__footer">
        <Button @click="visible = false">关闭</Button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.knowledge-base-view {
  min-height: 100%;
}

.knowledge-base-view__text {
  min-height: 320px;
  padding: 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.knowledge-base-view__file {
  display: flex;
  align-items: center;
  min-height: 48px;
}

.knowledge-base-view__chunk-toolbar {
  display: flex;
  gap: 12px;
  max-width: 560px;
  margin-bottom: 12px;
}

.knowledge-base-view__chunk-content {
  display: -webkit-box;
  overflow: hidden;
  line-height: 1.6;
  word-break: break-word;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}

.knowledge-base-view__pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.knowledge-base-view__footer {
  display: flex;
  justify-content: flex-end;
}
</style>
