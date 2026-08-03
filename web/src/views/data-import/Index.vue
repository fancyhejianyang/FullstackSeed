<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, type UploadFile, type UploadUserFile } from 'element-plus';
import { Setting, UploadFilled } from '@element-plus/icons-vue';
import PageContainer from '@/components/PageContainer.vue';
import ProDialog from '@/components/ProDialog.vue';
import ProTable, { type ProTableColumn } from '@/components/ProTable.vue';
import type { ProFormField } from '@/components/ProForm.vue';
import {
  createDataImportConfig,
  getDataImportConfigs,
  type DataImportConfigItem,
  type QueryDataImportConfigParams,
} from '@/api/dataImport';
import {
  getModuleModelFields,
  getModuleModels,
  type ModuleModelFieldMeta,
  type ModuleModelSummary,
} from '@/api/moduleModel';
import { formatDateTime } from '@/utils/format';

const tableRef = ref<{ refresh: () => Promise<void> }>();
const configVisible = ref(false);
const configLoading = ref(false);
const savingConfig = ref(false);
const modules = ref<ModuleModelSummary[]>([]);
const moduleFields = ref<ModuleModelFieldMeta[]>([]);
const selectedModuleId = ref('');
const selectedFieldProps = ref<string[]>([]);
const uploadFiles = ref<UploadUserFile[]>([]);
const templateFile = ref<File>();

const moduleOptions = computed(() =>
  modules.value.map((item) => ({
    label: item.moduleName,
    value: item.moduleId,
  })),
);

const selectedModule = computed(() =>
  modules.value.find((item) => item.moduleId === selectedModuleId.value),
);

const importableFields = computed(() =>
  moduleFields.value.filter((field) => !field.readonly),
);

const columns: ProTableColumn[] = [
  { prop: 'moduleName', label: '模块', width: 140 },
  { prop: 'fieldLabels', label: '导入字段', minWidth: 260, slot: true },
  { prop: 'templateName', label: '模板文件', minWidth: 180 },
  { prop: 'templateSize', label: '文件大小', width: 120, slot: true },
  { prop: 'createdAt', label: '上传时间', width: 180, slot: true },
];

const searchFields: ProFormField[] = [
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
    placeholder: '模块/模板文件',
  },
];

function fetchConfigs(params: Record<string, unknown>) {
  return getDataImportConfigs(params as QueryDataImportConfigParams);
}

async function fetchModules() {
  modules.value = await getModuleModels();
}

async function openConfig() {
  configVisible.value = true;
  selectedModuleId.value = '';
  selectedFieldProps.value = [];
  moduleFields.value = [];
  uploadFiles.value = [];
  templateFile.value = undefined;
  configLoading.value = true;
  try {
    if (!modules.value.length) {
      await fetchModules();
    }
  } finally {
    configLoading.value = false;
  }
}

async function handleModuleChange(moduleId: string) {
  selectedFieldProps.value = [];
  moduleFields.value = [];
  if (!moduleId) return;
  moduleFields.value = await getModuleModelFields(moduleId);
}

function handleTemplateChange(file: UploadFile) {
  uploadFiles.value = [file];
  templateFile.value = file.raw as File | undefined;
}

function handleTemplateRemove() {
  uploadFiles.value = [];
  templateFile.value = undefined;
}

async function saveConfig() {
  if (!selectedModuleId.value) {
    ElMessage.warning('请选择模块');
    return;
  }
  if (!selectedFieldProps.value.length) {
    ElMessage.warning('请选择需要导入的字段');
    return;
  }
  if (!templateFile.value) {
    ElMessage.warning('请上传模板文件');
    return;
  }

  savingConfig.value = true;
  try {
    await createDataImportConfig({
      moduleId: selectedModuleId.value,
      fieldProps: selectedFieldProps.value,
      template: templateFile.value,
    });
    ElMessage.success('配置已保存');
    configVisible.value = false;
    await tableRef.value?.refresh();
  } finally {
    savingConfig.value = false;
  }
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function getFieldTypeLabel(field: ModuleModelFieldMeta) {
  const typeMap: Record<string, string> = {
    number: '数字',
    string: '文本',
    text: '长文本',
    boolean: '布尔',
    datetime: '时间',
    enum: '枚举',
    array: '数组',
    relation: '关联',
  };
  return typeMap[field.type] ?? field.type;
}

onMounted(fetchModules);
</script>

<template>
  <PageContainer title="数据导入">
    <ProTable
      ref="tableRef"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchConfigs"
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
          class="data-import__module-filter"
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

      <template #column-fieldLabels="{ row }">
        <div class="data-import__field-tags">
          <el-tag
            v-for="field in (row as DataImportConfigItem).fieldLabels"
            :key="field"
            type="info"
          >
            {{ field }}
          </el-tag>
        </div>
      </template>

      <template #column-templateSize="{ row }">
        {{ formatFileSize((row as DataImportConfigItem).templateSize) }}
      </template>

      <template #column-createdAt="{ row }">
        {{ formatDateTime((row as DataImportConfigItem).createdAt) }}
      </template>
    </ProTable>

    <ProDialog
      v-model="configVisible"
      title="数据导入配置"
      width="960px"
      body-max-height="72vh"
      confirm-text="保存配置"
      :confirm-loading="savingConfig"
      @confirm="saveConfig"
    >
      <el-skeleton v-if="configLoading" :rows="6" animated />
      <div v-else class="data-import__config">
        <section class="data-import__section">
          <div class="data-import__section-title">选择模块</div>
          <el-select
            v-model="selectedModuleId"
            class="data-import__module-select"
            clearable
            filterable
            placeholder="请选择需要导入数据的模块"
            @change="handleModuleChange"
          >
            <el-option
              v-for="item in moduleOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <span v-if="selectedModule" class="data-import__module-meta">
            {{ selectedModule.tableName }} / {{ selectedModule.modelName }}
          </span>
        </section>

        <section class="data-import__section">
          <div class="data-import__section-title">导入字段</div>
          <el-empty
            v-if="!selectedModuleId"
            description="请选择模块后配置导入字段"
          />
          <el-empty
            v-else-if="!importableFields.length"
            description="当前模块暂无可导入字段"
          />
          <el-checkbox-group v-else v-model="selectedFieldProps">
            <div class="data-import__field-list">
              <el-checkbox
                v-for="field in importableFields"
                :key="field.prop"
                :label="field.prop"
                class="data-import__field-item"
              >
                <span class="data-import__field-name">{{ field.label }}</span>
                <span class="data-import__field-prop">{{ field.prop }}</span>
                <el-tag size="small" type="info">
                  {{ getFieldTypeLabel(field) }}
                </el-tag>
                <el-tag v-if="field.required" size="small" type="danger">
                  必填
                </el-tag>
              </el-checkbox>
            </div>
          </el-checkbox-group>
        </section>

        <section class="data-import__section">
          <div class="data-import__section-title">上传模板</div>
          <el-upload
            drag
            :auto-upload="false"
            :limit="1"
            :file-list="uploadFiles"
            accept=".xlsx,.xls,.csv"
            :on-change="handleTemplateChange"
            :on-remove="handleTemplateRemove"
          >
            <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
            <div class="el-upload__text">
              将模板文件拖到此处，或点击上传
            </div>
            <template #tip>
              <div class="el-upload__tip">
                支持 .xlsx / .xls / .csv，保存配置时会同步上传模板。
              </div>
            </template>
          </el-upload>
        </section>
      </div>
    </ProDialog>
  </PageContainer>
</template>

<style scoped>
.data-import__module-filter {
  width: 180px;
}

.data-import__field-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.data-import__config {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.data-import__section {
  width: 100%;
}

.data-import__section-title {
  margin-bottom: 12px;
  color: #303133;
  font-size: 14px;
  font-weight: 600;
}

.data-import__module-select {
  width: 320px;
}

.data-import__module-meta {
  margin-left: 12px;
  color: #909399;
  font-size: 12px;
}

.data-import__field-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px 16px;
}

.data-import__field-item {
  height: 28px;
}

.data-import__field-name {
  display: inline-block;
  min-width: 72px;
  font-weight: 500;
}

.data-import__field-prop {
  margin-right: 8px;
  color: #909399;
  font-size: 12px;
}
</style>
