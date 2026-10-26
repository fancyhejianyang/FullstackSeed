<script setup lang="ts">
import { ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import Button from '@/components/Button.vue';
import type { FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import {
  getHotSources,
  deleteHotSource,
  batchDeleteHotSources,
  sourceKindLabels,
  type HotSource,
} from '@/api/hotTopic';
import { fixedHotSourceUrl, hotSourceAccessLabel } from '@/api/hotTopicSources';
import Edit from './Edit.vue';
import View from './View.vue';
const tableRef = ref<{
  refresh: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();
const visible = ref(false);
const editing = ref<HotSource | null>(null);
const viewVisible = ref(false);
const viewing = ref<HotSource | null>(null);
const columns: TableColumn[] = [
  { prop: 'name', label: '来源名称', minWidth: 180 },
  { prop: 'kind', label: '来源类型', width: 140, slot: true },
  { prop: 'accessMode', label: '获取方式', width: 150, slot: true },
  { prop: 'url', label: '页面 / 固定接口', minWidth: 260, slot: true },
  { prop: 'isEnabled', label: '状态', width: 90, slot: true },
  { prop: 'updatedAt', label: '更新时间', width: 180, slot: true },
];
const searchFields: FormField[] = [
  { prop: 'keyword', label: '关键词', placeholder: '来源名称', type: 'input' },
];
function edit(row: HotSource | null = null) {
  editing.value = row;
  visible.value = true;
}
</script>
<template>
  <PageContainer title="热点来源配置">
    <p class="source-hint">
      抖音热搜与网易国内新闻使用系统固定接口；微博仍可配置官方热点页或合规聚合页。
      保存配置不会触发采集或 AI
      调用；遇到登录、验证码或访问限制时会如实报告失败。
    </p>
    <Table
      ref="tableRef"
      :columns="columns"
      :search-fields="searchFields"
      :request="getHotSources"
      perm-module="hotTopicSource"
      check-able
      :delete-request="(row: HotSource) => deleteHotSource(row.id)"
      :batch-delete-request="({ ids }) => batchDeleteHotSources(ids)"
      @edit="edit"
      @view="
        (row: HotSource) => {
          viewing = row;
          viewVisible = true;
        }
      "
    >
      <template #toolbar>
        <Button perm="HotTopicSource.create" @click="edit()">新增来源</Button>
        <Button
          perm="HotTopicSource.batchDelete"
          :confirm="false"
          @click="tableRef?.runBatchDelete()"
          >批量删除</Button
        >
      </template>
      <template #column-kind="{ row }">{{
        sourceKindLabels[row.kind as keyof typeof sourceKindLabels]
      }}</template>
      <template #column-accessMode="{ row }">{{
        hotSourceAccessLabel(row)
      }}</template>
      <template #column-url="{ row }">{{
        fixedHotSourceUrl(row.kind) || row.url
      }}</template>
      <template #column-isEnabled="{ row }">{{
        row.isEnabled ? '已启用' : '已停用'
      }}</template>
      <template #column-updatedAt="{ row }">{{
        formatDateTime(row.updatedAt)
      }}</template>
    </Table>
    <Edit
      v-model:visible="visible"
      :row="editing"
      @success="tableRef?.refresh()"
    />
    <View v-model:visible="viewVisible" :row="viewing" />
  </PageContainer>
</template>
<style scoped>
.source-hint {
  color: var(--el-text-color-regular);
  line-height: 1.7;
  margin: 0 0 20px;
}
</style>
