<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, type UploadFile, type UploadUserFile } from 'element-plus';
import { Close, Setting, UploadFilled } from '@element-plus/icons-vue';
import PageContainer from '@/components/PageContainer.vue';
import Dialog from '@/components/Dialog.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import type { FormField } from '@/components/Form.vue';
import {
  createDataImportConfig,
  downloadDataImportTemplate,
  getDataImportConfigs,
  updateDataImportConfig,
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

interface ImportFieldMappingForm {
  id: string;
  templateField: string;
  fieldProp: string;
}

const tableRef = ref<{ refresh: () => Promise<void> }>();
const configVisible = ref(false);
const configLoading = ref(false);
const savingConfig = ref(false);
const editingConfig = ref<DataImportConfigItem | null>(null);
const modules = ref<ModuleModelSummary[]>([]);
const moduleFields = ref<ModuleModelFieldMeta[]>([]);
const selectedModuleId = ref('');
const selectedFieldProps = ref<string[]>([]);
const uploadFiles = ref<UploadUserFile[]>([]);
const templateFile = ref<File>();
const existingTemplate = ref<{
  id: number;
  name: string;
  size: number;
}>();
const fieldMappings = ref<ImportFieldMappingForm[]>([]);

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

const selectedFieldMetas = computed(() =>
  selectedFieldProps.value
    .map((prop) => importableFields.value.find((field) => field.prop === prop))
    .filter((field): field is ModuleModelFieldMeta => !!field),
);

const systemFieldOptions = computed(() =>
  selectedFieldMetas.value.map((field) => ({
    label: field.label,
    value: field.prop,
  })),
);

const hasTemplate = computed(() => !!templateFile.value || !!existingTemplate.value);

const columns: TableColumn[] = [
  { prop: 'moduleName', label: '模块', width: 140, slot: true },
  { prop: 'fieldLabels', label: '导入字段', minWidth: 260, slot: true },
  { prop: 'templateName', label: '模板文件', minWidth: 180, slot: true },
  { prop: 'templateSize', label: '文件大小', width: 120, slot: true },
  { prop: 'createdAt', label: '上传时间', width: 180, slot: true },
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
  editingConfig.value = null;
  selectedModuleId.value = '';
  selectedFieldProps.value = [];
  moduleFields.value = [];
  uploadFiles.value = [];
  templateFile.value = undefined;
  existingTemplate.value = undefined;
  fieldMappings.value = [];
  configLoading.value = true;
  try {
    if (!modules.value.length) {
      await fetchModules();
    }
  } finally {
    configLoading.value = false;
  }
}

async function openEditConfig(row: DataImportConfigItem) {
  configVisible.value = true;
  editingConfig.value = row;
  selectedModuleId.value = row.moduleId;
  selectedFieldProps.value = [...row.fieldProps];
  uploadFiles.value = [];
  templateFile.value = undefined;
  existingTemplate.value = {
    id: row.id,
    name: row.templateName,
    size: row.templateSize,
  };
  configLoading.value = true;
  try {
    if (!modules.value.length) {
      await fetchModules();
    }
    moduleFields.value = await getModuleModelFields(row.moduleId);
    fieldMappings.value = row.fieldMappings?.length
      ? row.fieldMappings.map((item) => ({
          id: item.fieldProp,
          templateField: item.templateField,
          fieldProp: item.fieldProp,
        }))
      : row.fieldProps.map((fieldProp, index) => ({
          id: fieldProp,
          templateField: row.fieldLabels[index] ?? fieldProp,
          fieldProp,
        }));
  } finally {
    configLoading.value = false;
  }
}

async function handleModuleChange(moduleId: string) {
  selectedFieldProps.value = [];
  moduleFields.value = [];
  fieldMappings.value = [];
  if (!moduleId) return;
  moduleFields.value = await getModuleModelFields(moduleId);
}

function handleTemplateChange(file: UploadFile) {
  uploadFiles.value = [file];
  templateFile.value = file.raw as File | undefined;
  syncFieldMappings();
}

function handleTemplateRemove() {
  uploadFiles.value = [];
  templateFile.value = undefined;
  existingTemplate.value = undefined;
  fieldMappings.value = [];
}

function syncFieldMappings() {
  const existing = new Map(
    fieldMappings.value.map((item) => [item.fieldProp, item]),
  );
  fieldMappings.value = selectedFieldMetas.value.map((field) => {
    const current = existing.get(field.prop);
    return {
      id: field.prop,
      templateField: current?.templateField || field.label,
      fieldProp: field.prop,
    };
  });
}

function getSystemFieldLabel(fieldProp: string) {
  return (
    importableFields.value.find((field) => field.prop === fieldProp)?.label ??
    fieldProp
  );
}

async function downloadTemplate(row: DataImportConfigItem) {
  const blob = await downloadDataImportTemplate(row.id);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = row.templateName;
  link.click();
  URL.revokeObjectURL(url);
}

async function downloadExistingTemplate() {
  if (!existingTemplate.value) return;
  await downloadTemplate({
    id: existingTemplate.value.id,
    templateName: existingTemplate.value.name,
  } as DataImportConfigItem);
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
  if (!hasTemplate.value) {
    ElMessage.warning('请上传模板文件');
    return;
  }

  savingConfig.value = true;
  try {
    const payload = {
      moduleId: selectedModuleId.value,
      fieldProps: selectedFieldProps.value,
      fieldMappings: fieldMappings.value.map((item) => ({
        templateField: item.templateField,
        fieldProp: item.fieldProp,
      })),
      template: templateFile.value,
    };
    if (editingConfig.value) {
      await updateDataImportConfig(editingConfig.value.id, payload);
    } else {
      await createDataImportConfig(payload);
    }
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
    <Table
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

      <template #column-moduleName="{ row }">
        <el-button
          link
          type="primary"
          @click="openEditConfig(row as DataImportConfigItem)"
        >
          {{ (row as DataImportConfigItem).moduleName }}
        </el-button>
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

      <template #column-templateName="{ row }">
        <el-button
          link
          type="primary"
          @click="downloadTemplate(row as DataImportConfigItem)"
        >
          {{ (row as DataImportConfigItem).templateName }}
        </el-button>
      </template>

      <template #column-templateSize="{ row }">
        {{ formatFileSize((row as DataImportConfigItem).templateSize) }}
      </template>

      <template #column-createdAt="{ row }">
        {{ formatDateTime((row as DataImportConfigItem).createdAt) }}
      </template>
    </Table>

    <Dialog
      v-model="configVisible"
      :title="editingConfig ? '编辑数据导入配置' : '数据导入配置'"
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
          <el-checkbox-group
            v-else
            v-model="selectedFieldProps"
            @change="syncFieldMappings"
          >
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
            v-if="!hasTemplate"
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
          <div v-else class="data-import__uploaded-file">
            <div>
              <el-button
                v-if="existingTemplate && !templateFile"
                link
                type="primary"
                class="data-import__uploaded-name"
                @click="downloadExistingTemplate"
              >
                {{ existingTemplate.name }}
              </el-button>
              <div v-else class="data-import__uploaded-name">
                {{ templateFile?.name }}
              </div>
              <div class="data-import__uploaded-meta">
                {{
                  formatFileSize(
                    templateFile?.size ?? existingTemplate?.size ?? 0,
                  )
                }}
              </div>
            </div>
            <el-button
              circle
              text
              :icon="Close"
              aria-label="移除模板文件"
              @click="handleTemplateRemove"
            />
          </div>
        </section>

        <section v-if="hasTemplate" class="data-import__section">
          <div class="data-import__section-title">字段映射</div>
          <el-empty
            v-if="!fieldMappings.length"
            description="请选择导入字段后确认映射关系"
          />
          <el-table v-else :data="fieldMappings" border>
            <el-table-column label="模板字段" min-width="220">
              <template #default="{ row }">
                <el-input
                  v-model="row.templateField"
                  placeholder="模板中的字段名"
                />
              </template>
            </el-table-column>
            <el-table-column label="系统字段" min-width="220">
              <template #default="{ row }">
                <el-select
                  v-model="row.fieldProp"
                  class="data-import__mapping-select"
                  placeholder="请选择系统字段"
                >
                  <el-option
                    v-for="field in systemFieldOptions"
                    :key="field.value"
                    :label="field.label"
                    :value="field.value"
                  />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="字段标识" min-width="180">
              <template #default="{ row }">
                <span class="data-import__field-prop">
                  {{ row.fieldProp }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="确认" width="120">
              <template #default="{ row }">
                {{ row.templateField }} → {{ getSystemFieldLabel(row.fieldProp) }}
              </template>
            </el-table-column>
          </el-table>
        </section>
      </div>
    </Dialog>
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

.data-import__uploaded-file {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 64px;
  padding: 12px 16px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: #fafafa;
}

.data-import__uploaded-name {
  color: #303133;
  font-size: 14px;
  font-weight: 500;
}

.data-import__uploaded-meta {
  margin-top: 4px;
  color: #909399;
  font-size: 12px;
}

.data-import__mapping-select {
  width: 100%;
}
</style>
