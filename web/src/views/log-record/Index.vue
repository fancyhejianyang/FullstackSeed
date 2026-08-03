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
  type LogAction,
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
const activeModulePanels = ref<string[]>([]);
const selectedActionsMap = ref<Record<string, LogAction[]>>({});

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
    selectedActionsMap.value = Object.fromEntries(
      moduleConfigs.value.map((item) => [item.moduleId, item.enabledActions]),
    );
    activeModulePanels.value = moduleConfigs.value
      .filter((item) => item.enabledActions.length > 0)
      .map((item) => item.moduleId);
  } finally {
    configLoading.value = false;
  }
}

async function saveConfig() {
  savingConfig.value = true;
  try {
    const configs: LogModuleConfigPayload[] = Object.entries(
      selectedActionsMap.value,
    ).map(([moduleId, actions]) => ({ moduleId, actions }));
    moduleConfigs.value = await updateLogModuleConfigs(configs);
    selectedActionsMap.value = Object.fromEntries(
      moduleConfigs.value.map((item) => [item.moduleId, item.enabledActions]),
    );
    configVisible.value = false;
    ElMessage.success('配置已保存');
    await tableRef.value?.refresh();
  } finally {
    savingConfig.value = false;
  }
}

function getModuleActions(moduleId: string) {
  return selectedActionsMap.value[moduleId] ?? [];
}

function setModuleActions(moduleId: string, actions: LogAction[]) {
  selectedActionsMap.value = {
    ...selectedActionsMap.value,
    [moduleId]: actions,
  };
}

function isModuleChecked(item: LogModuleConfigItem) {
  return getModuleActions(item.moduleId).length === item.actions.length;
}

function isModuleIndeterminate(item: LogModuleConfigItem) {
  const count = getModuleActions(item.moduleId).length;
  return count > 0 && count < item.actions.length;
}

function handleModuleCheck(item: LogModuleConfigItem, checked: boolean) {
  setModuleActions(
    item.moduleId,
    checked ? item.actions.map((api) => api.action) : [],
  );
  if (checked && !activeModulePanels.value.includes(item.moduleId)) {
    activeModulePanels.value = [...activeModulePanels.value, item.moduleId];
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
      <el-collapse v-else v-model="activeModulePanels">
        <el-collapse-item
          v-for="item in moduleConfigs"
          :key="item.moduleId"
          :name="item.moduleId"
        >
          <template #title>
            <div class="log-record__module-head" @click.stop>
              <el-checkbox
                :model-value="isModuleChecked(item)"
                :indeterminate="isModuleIndeterminate(item)"
                @change="(checked: boolean) => handleModuleCheck(item, checked)"
              >
                <span class="log-record__config-name">{{ item.moduleName }}</span>
                <span class="log-record__config-meta">{{ item.tableName }}</span>
              </el-checkbox>
            </div>
          </template>

          <el-checkbox-group
            :model-value="getModuleActions(item.moduleId)"
            @update:model-value="(actions: LogAction[]) => setModuleActions(item.moduleId, actions)"
          >
            <div class="log-record__api-list">
              <el-checkbox
                v-for="api in item.actions"
                :key="api.action"
                :label="api.action"
                class="log-record__api-item"
              >
                <span class="log-record__api-label">{{ api.label }}</span>
                <el-tag size="small" effect="plain">{{ api.method }}</el-tag>
                <span class="log-record__api-path">{{ api.path }}</span>
              </el-checkbox>
            </div>
          </el-checkbox-group>
        </el-collapse-item>
      </el-collapse>
    </ProDialog>
  </PageContainer>
</template>

<style scoped>
.log-record__module-head {
  display: flex;
  align-items: center;
  width: 100%;
}

.log-record__config-name {
  margin-right: 8px;
}

.log-record__config-meta {
  color: #909399;
  font-size: 12px;
}

.log-record__api-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0 6px 28px;
}

.log-record__api-item {
  height: 24px;
}

.log-record__api-label {
  display: inline-block;
  min-width: 72px;
  font-weight: 500;
}

.log-record__api-path {
  margin-left: 8px;
  color: #606266;
  font-size: 12px;
}
</style>
