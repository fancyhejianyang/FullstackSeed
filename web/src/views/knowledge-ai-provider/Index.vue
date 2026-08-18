<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { FormRules } from 'element-plus';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import Dialog from '@/components/Dialog.vue';
import Form, { type FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import {
  batchDeleteKnowledgeAiProviders,
  deleteKnowledgeAiProvider,
  getKnowledgeAiProviders,
  testKnowledgeAiProvider,
  type KnowledgeAiProvider,
  type QueryKnowledgeAiProviderParams,
  type TestKnowledgeAiProviderResult,
} from '@/api/knowledgeAiProvider';
import Edit from './Edit.vue';

const tableRef = ref<{
  refresh: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();

const columns: TableColumn[] = [
  { prop: 'name', label: '名称', minWidth: 180 },
  { prop: 'apiUrl', label: 'API 地址', minWidth: 220 },
  { prop: 'chatApiPath', label: 'Chat API 路径', minWidth: 180 },
  { prop: 'models', label: '模型列表', minWidth: 220, slot: true },
  { prop: 'textModels', label: '文本模型', minWidth: 220, slot: true },
  { prop: 'visionModels', label: '视觉模型', minWidth: 220, slot: true },
  { prop: 'embeddingModels', label: '向量模型', minWidth: 220, slot: true },
  { prop: 'secretKeySet', label: '密钥', width: 90, slot: true },
  { prop: 'isEnabled', label: '状态', width: 90, slot: true },
  { prop: 'description', label: '描述', minWidth: 180 },
  { prop: 'updatedAt', label: '更新时间', width: 180, slot: true },
];

const searchFields: FormField[] = [
  { prop: 'keyword', label: '关键词', type: 'input', placeholder: '名称/API地址/描述' },
];

const editVisible = ref(false);
const editingRow = ref<KnowledgeAiProvider | null>(null);
const testVisible = ref(false);
const testing = ref(false);
const testResult = ref<TestKnowledgeAiProviderResult | null>(null);
const testForm = reactive({
  id: 0,
  model: '',
  question: '请用一句话说明当前模型已经可以正常响应。',
});
const testFormRef = ref<InstanceType<typeof Form>>();

const testFields = computed<FormField[]>(() => [
  {
    prop: 'model',
    label: '模型',
    type: 'select',
    options: getModelOptions(editingRow.value?.models ?? ''),
  },
  {
    prop: 'question',
    label: '问题',
    type: 'textarea',
    rows: 5,
    placeholder: '请输入用于验证模型连通性的测试问题',
  },
]);

const testRules: FormRules = {
  model: [{ required: true, message: '请选择模型', trigger: 'change' }],
  question: [{ required: true, message: '请输入测试问题', trigger: 'blur' }],
};

function fetchProviders(params: Record<string, unknown>) {
  return getKnowledgeAiProviders(params as QueryKnowledgeAiProviderParams);
}

function openCreate() {
  editingRow.value = null;
  editVisible.value = true;
}

function handleEdit(row: KnowledgeAiProvider) {
  editingRow.value = row;
  editVisible.value = true;
}

function deleteRequest(row: KnowledgeAiProvider) {
  return deleteKnowledgeAiProvider(row.id);
}

async function batchDeleteRequest(payload: { ids: Array<string | number> }) {
  await batchDeleteKnowledgeAiProviders(payload.ids);
}

function getModelLines(models: string) {
  return models
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getModelOptions(models: string) {
  return getModelLines(models).map((line) => {
    const [code, name] = line.split('#');
    return {
      label: name || code,
      value: code,
    };
  });
}

function openTest(row: KnowledgeAiProvider) {
  editingRow.value = row;
  const options = getModelOptions(row.models || 'qwen-plus');
  testForm.id = row.id;
  testForm.model = String(options[0]?.value ?? 'qwen-plus');
  testForm.question = '请用一句话说明当前模型已经可以正常响应。';
  testResult.value = null;
  testVisible.value = true;
}

async function handleTest() {
  await testFormRef.value?.validate();
  testing.value = true;
  try {
    testResult.value = await testKnowledgeAiProvider({ ...testForm });
    if (testResult.value.isSuccess) {
      ElMessage.success('测试调用成功');
    } else {
      ElMessage.error(testResult.value.errorMessage || '测试调用失败');
    }
  } finally {
    testing.value = false;
  }
}
</script>

<template>
  <PageContainer title="AI 大模型账号">
    <Table
      ref="tableRef"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchProviders"
      :checkAble="true"
      :show-view="false"
      :delete-request="deleteRequest"
      :batch-delete-request="batchDeleteRequest"
      @edit="handleEdit"
    >
      <template #toolbar>
        <Button type="primary" icon="Plus" @click="openCreate">新增账号</Button>
        <Button
          icon="Delete"
          type="danger"
          :confirm="false"
          @click="tableRef?.runBatchDelete()"
        >
          批量删除
        </Button>
      </template>

      <template #actions="{ row }">
        <Button
          link
          type="primary"
          icon="Connection"
          :disabled="!row.isEnabled"
          @click="openTest(row)"
        >
          测试
        </Button>
      </template>

      <template #column-models="{ row }">
        <div class="ai-provider__models">
          <el-tag
            v-for="line in getModelLines(row.models).slice(0, 3)"
            :key="line"
            type="info"
          >
            {{ line }}
          </el-tag>
          <span v-if="!getModelLines(row.models).length">-</span>
        </div>
      </template>

      <template #column-textModels="{ row }">
        <div class="ai-provider__models">
          <el-tag
            v-for="line in getModelLines(row.textModels).slice(0, 3)"
            :key="line"
            type="info"
          >
            {{ line }}
          </el-tag>
          <span v-if="!getModelLines(row.textModels).length">-</span>
        </div>
      </template>

      <template #column-visionModels="{ row }">
        <div class="ai-provider__models">
          <el-tag
            v-for="line in getModelLines(row.visionModels).slice(0, 3)"
            :key="line"
            type="info"
          >
            {{ line }}
          </el-tag>
          <span v-if="!getModelLines(row.visionModels).length">-</span>
        </div>
      </template>

      <template #column-embeddingModels="{ row }">
        <div class="ai-provider__models">
          <el-tag
            v-for="line in getModelLines(row.embeddingModels).slice(0, 3)"
            :key="line"
            type="info"
          >
            {{ line }}
          </el-tag>
          <span v-if="!getModelLines(row.embeddingModels).length">-</span>
        </div>
      </template>

      <template #column-secretKeySet="{ row }">
        <el-tag :type="row.secretKeySet ? 'success' : 'warning'">
          {{ row.secretKeySet ? '已配置' : '未配置' }}
        </el-tag>
      </template>

      <template #column-isEnabled="{ row }">
        <el-tag :type="row.isEnabled ? 'success' : 'info'">
          {{ row.isEnabled ? '启用' : '停用' }}
        </el-tag>
      </template>

      <template #column-updatedAt="{ row }">
        {{ formatDateTime(row.updatedAt) }}
      </template>
    </Table>

    <Edit
      v-model:visible="editVisible"
      :row="editingRow"
      @success="tableRef?.refresh()"
    />

    <Dialog
      v-model="testVisible"
      title="测试大模型账号"
      width="760px"
      :confirm-loading="testing"
      confirm-text="开始测试"
      @confirm="handleTest"
    >
      <Form
        ref="testFormRef"
        v-model="testForm"
        :fields="testFields"
        :rules="testRules"
        label-width="80px"
      />
      <div v-if="testResult" class="ai-provider__result">
        <el-alert
          :type="testResult.isSuccess ? 'success' : 'error'"
          :title="testResult.isSuccess ? '测试成功' : '测试失败'"
          :description="testResult.errorMessage || `耗时 ${testResult.elapsedMilliseconds} ms`"
          show-icon
          :closable="false"
        />
        <el-input
          v-if="testResult.answer"
          class="ai-provider__answer"
          :model-value="testResult.answer"
          type="textarea"
          :rows="5"
          readonly
        />
      </div>
    </Dialog>
  </PageContainer>
</template>

<style scoped>
.ai-provider__models {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ai-provider__result {
  margin-top: 16px;
}

.ai-provider__answer {
  margin-top: 12px;
}
</style>
