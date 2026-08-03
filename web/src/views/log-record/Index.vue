<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Setting } from '@element-plus/icons-vue';
import PageContainer from '@/components/PageContainer.vue';
import ProDialog from '@/components/ProDialog.vue';
import ProTable, { type ProTableColumn } from '@/components/ProTable.vue';
import type { ProFormField } from '@/components/ProForm.vue';
import {
  getLogModuleConfigs,
  getLogRecords,
  updateLogModuleConfigs,
  type LogModuleConfigItem,
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

const columns: ProTableColumn[] = [
  { prop: 'moduleName', label: '模块', width: 140 },
  { prop: 'action', label: '操作', width: 120 },
  { prop: 'recordId', label: '记录ID', width: 120 },
  { prop: 'operatorName', label: '操作人', width: 140 },
  { prop: 'summary', label: '摘要', minWidth: 220 },
  { prop: 'createdAt', label: '操作时间', width: 180, slot: true },
];

const searchFields: ProFormField[] = [
  {
    prop: 'moduleId',
    label: '模块',
    type: 'select',
    options: moduleOptions,
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
    moduleConfigs.value = await updateLogModuleConfigs(selectedModuleIds.value);
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
    <ProTable
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

      <template #column-createdAt="{ row }">
        {{ formatDateTime((row as LogRecordItem).createdAt) }}
      </template>
    </ProTable>

    <ProDialog
      v-model="configVisible"
      title="日志统计配置"
      width="720px"
      :confirm-loading="savingConfig"
      @confirm="saveConfig"
    >
      <el-skeleton v-if="configLoading" :rows="5" animated />
      <el-checkbox-group v-else v-model="selectedModuleIds">
        <div class="log-record__config-grid">
          <el-checkbox
            v-for="item in moduleConfigs"
            :key="item.moduleId"
            :label="item.moduleId"
            border
          >
            <span class="log-record__config-name">{{ item.moduleName }}</span>
            <span class="log-record__config-meta">{{ item.tableName }}</span>
          </el-checkbox>
        </div>
      </el-checkbox-group>
    </ProDialog>
  </PageContainer>
</template>

<style scoped>
.log-record__config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.log-record__config-name {
  margin-right: 8px;
}

.log-record__config-meta {
  color: #909399;
  font-size: 12px;
}
</style>
