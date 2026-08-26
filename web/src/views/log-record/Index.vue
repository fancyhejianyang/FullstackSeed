<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Setting } from '@element-plus/icons-vue';
import PageContainer from '@/components/PageContainer.vue';
import Dialog from '@/components/Dialog.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import type { FormField } from '@/components/Form.vue';
import {
  getLogModuleConfigs,
  getLogRecords,
  updateLogModuleConfigs,
  type LogModuleConfigItem,
  type LogModuleConfigPayload,
  type LogRecordItem,
  type QueryLogRecordParams,
} from '@/api/logRecord';
import { formatDateTime } from '@/utils/format';

const tableRef = ref<{ refresh: () => Promise<void> }>();
const configVisible = ref(false);
const configLoading = ref(false);
const savingConfig = ref(false);
const moduleConfigs = ref<LogModuleConfigItem[]>([]);
const selectedModuleIds = ref<string[]>([]);

const moduleOptions = computed(() =>
  moduleConfigs.value.map((item) => ({
    label: item.moduleName,
    value: item.moduleId,
  })),
);

const columns: TableColumn[] = [
  { prop: 'moduleName', label: '模块', width: 140 },
  { prop: 'action', label: '操作', width: 120 },
  { prop: 'recordId', label: '记录ID', width: 120 },
  { prop: 'operatorName', label: '操作人', width: 140 },
  { prop: 'summary', label: '摘要', minWidth: 220 },
  { prop: 'createdAt', label: '操作时间', width: 180, slot: true },
];

const searchFields: FormField[] = [
  {
    prop: 'moduleId',
    label: '模块',
    type: 'select',
    options: moduleOptions,
    slot: true,
  },
  {
    prop: 'keyword',
    label: '关键词',
    type: 'input',
    placeholder: '模块/操作/记录ID/操作人/摘要',
  },
];

function fetchLogs(params: Record<string, unknown>) {
  return getLogRecords(params as QueryLogRecordParams);
}

async function fetchModuleConfigs() {
  moduleConfigs.value = await getLogModuleConfigs();
}

async function openConfig() {
  configVisible.value = true;
  configLoading.value = true;
  try {
    await fetchModuleConfigs();
    selectedModuleIds.value = moduleConfigs.value
      .filter((item) => item.enabled)
      .map((item) => item.moduleId);
  } finally {
    configLoading.value = false;
  }
}

async function saveConfig() {
  savingConfig.value = true;
  try {
    const selected = new Set(selectedModuleIds.value);
    const configs: LogModuleConfigPayload[] = moduleConfigs.value.map((item) => ({
      moduleId: item.moduleId,
      enabled: selected.has(item.moduleId),
    }));
    moduleConfigs.value = await updateLogModuleConfigs(configs);
    selectedModuleIds.value = moduleConfigs.value
      .filter((item) => item.enabled)
      .map((item) => item.moduleId);
    configVisible.value = false;
    ElMessage.success('配置已保存');
    await tableRef.value?.refresh();
  } finally {
    savingConfig.value = false;
  }
}

onMounted(fetchModuleConfigs);
</script>

<template>
  <PageContainer title="日志记录">
    <Table
      ref="tableRef"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchLogs"
      :show-actions="false"
    >
      <template #toolbar>
        <el-button type="primary" :icon="Setting" @click="openConfig">
          配置
        </el-button>
      </template>

      <template #search-moduleId="{ model }">
        <el-select
          v-model="model.moduleId"
          class="log-record__module-filter"
          clearable
          placeholder="请选择模块"
        >
          <el-option
            v-for="item in moduleOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </template>

      <template #column-createdAt="{ row }">
        {{ formatDateTime((row as LogRecordItem).createdAt) }}
      </template>
    </Table>

    <Dialog
      v-model="configVisible"
      title="操作日志模块配置"
      width="900px"
      :confirm-loading="savingConfig"
      @confirm="saveConfig"
    >
      <el-skeleton v-if="configLoading" :rows="5" animated />
      <div v-else class="log-record__config">
        <p class="log-record__config-tip">
          这里按业务模块配置日志开关，不按单个 API 配置；具体 API
          路径和操作会写入日志明细，取消勾选不会删除历史日志。
        </p>

        <el-checkbox-group
          v-model="selectedModuleIds"
          class="log-record__module-grid"
        >
          <el-checkbox
            v-for="item in moduleConfigs"
            :key="item.moduleId"
            :label="item.moduleId"
            class="log-record__module-check"
          >
            <span class="log-record__config-name">{{ item.moduleName }}</span>
            <span class="log-record__config-meta">{{ item.moduleId }}</span>
          </el-checkbox>
        </el-checkbox-group>
      </div>
    </Dialog>
  </PageContainer>
</template>

<style scoped>
.log-record__module-filter {
  width: 180px;
}

.log-record__config {
  max-height: 560px;
  overflow-y: auto;
  padding-right: 4px;
}

.log-record__config-tip {
  margin: 0 0 14px;
  color: #606266;
  font-size: 13px;
  line-height: 1.7;
}

.log-record__module-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
}

.log-record__module-check {
  display: flex;
  align-items: center;
  min-width: 0;
  height: 34px;
  margin-right: 0;
  padding: 0 10px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
}

.log-record__module-check :deep(.el-checkbox__label) {
  min-width: 0;
}

.log-record__config-name {
  margin-right: 8px;
  color: #303133;
  font-weight: 500;
}

.log-record__config-meta {
  color: #909399;
  font-size: 12px;
}
</style>
