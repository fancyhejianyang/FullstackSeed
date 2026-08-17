<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type FormRules } from 'element-plus';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Dialog from '@/components/Dialog.vue';
import Form, { type FormField } from '@/components/Form.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import { formatDateTime } from '@/utils/format';
import {
  createKnowledgeBase,
  createKnowledgeBaseCategory,
  createKnowledgeBaseChunk,
  createKnowledgeBaseDocument,
  deleteKnowledgeBase,
  deleteKnowledgeBaseCategory,
  deleteKnowledgeBaseChunk,
  deleteKnowledgeBaseDocument,
  getKnowledgeBaseCategoryTree,
  getKnowledgeBaseChunks,
  getKnowledgeBaseDocuments,
  getKnowledgeBases,
  updateKnowledgeBase,
  updateKnowledgeBaseCategory,
  updateKnowledgeBaseChunk,
  updateKnowledgeBaseDocument,
  type KnowledgeBase,
  type KnowledgeBaseCategoryTreeNode,
  type KnowledgeBaseChunk,
  type KnowledgeBaseDocument,
} from '@/api/knowledgeBase';

type CategoryOption = { label: string; value: string | number };

const bases = ref<KnowledgeBase[]>([]);
const categoryTree = ref<KnowledgeBaseCategoryTreeNode[]>([]);
const selectedBaseId = ref<number>();
const selectedCategoryId = ref<number>();
const selectedDocument = ref<KnowledgeBaseDocument | null>(null);
const loadingBases = ref(false);
const loadingCategories = ref(false);
const savingBase = ref(false);
const savingCategory = ref(false);
const savingDocument = ref(false);
const savingChunk = ref(false);
const baseVisible = ref(false);
const categoryVisible = ref(false);
const documentVisible = ref(false);
const chunkVisible = ref(false);
const editingBase = ref<KnowledgeBase | null>(null);
const editingCategory = ref<KnowledgeBaseCategoryTreeNode | null>(null);
const editingDocument = ref<KnowledgeBaseDocument | null>(null);
const editingChunk = ref<KnowledgeBaseChunk | null>(null);
const documentTableRef = ref<{ refresh: () => Promise<void>; runBatchDelete: () => Promise<void> }>();
const chunkTableRef = ref<{ refresh: () => Promise<void> }>();
const baseFormRef = ref<InstanceType<typeof Form>>();
const categoryFormRef = ref<InstanceType<typeof Form>>();
const documentFormRef = ref<InstanceType<typeof Form>>();
const chunkFormRef = ref<InstanceType<typeof Form>>();

const baseForm = reactive({
  name: '',
  code: '',
  description: '',
  isEnabled: true,
  sort: 0,
});

const categoryForm = reactive({
  parentId: null as number | null,
  name: '',
  code: '',
  description: '',
  sort: 0,
});

const documentForm = reactive({
  categoryId: '' as string | number,
  title: '',
  sourceType: 'manual',
  sourceName: '',
  status: 'draft',
  content: '',
  description: '',
  sort: 0,
});

const chunkForm = reactive({
  chunkIndex: 0,
  title: '',
  content: '',
  tokenCount: 0,
  sort: 0,
});

const selectedBase = computed(() =>
  bases.value.find((item) => item.id === selectedBaseId.value),
);

const categoryOptions = computed<CategoryOption[]>(() => [
  { label: '未分类', value: '' },
  ...flattenCategoryOptions(categoryTree.value),
]);

const baseFields: FormField[] = [
  { prop: 'name', label: '名称', type: 'input' },
  { prop: 'code', label: '编码', type: 'input' },
  { prop: 'description', label: '描述', type: 'textarea', rows: 3 },
  { prop: 'isEnabled', label: '启用', slot: true },
  { prop: 'sort', label: '排序', component: 'InputNumber', componentProps: { min: 0 } },
];

const categoryFields: FormField[] = [
  { prop: 'name', label: '名称', type: 'input' },
  { prop: 'code', label: '编码', type: 'input' },
  { prop: 'description', label: '描述', type: 'textarea', rows: 3 },
  { prop: 'sort', label: '排序', component: 'InputNumber', componentProps: { min: 0 } },
];

const documentFields = computed<FormField[]>(() => [
  {
    prop: 'categoryId',
    label: '分类',
    type: 'select',
    options: categoryOptions.value,
  },
  { prop: 'title', label: '标题', type: 'input' },
  {
    prop: 'sourceType',
    label: '来源类型',
    type: 'select',
    options: [
      { label: '手动录入', value: 'manual' },
      { label: '文件导入', value: 'file' },
      { label: '网页', value: 'web' },
    ],
  },
  { prop: 'sourceName', label: '来源名称', type: 'input' },
  {
    prop: 'status',
    label: '状态',
    type: 'select',
    options: [
      { label: '草稿', value: 'draft' },
      { label: '已发布', value: 'published' },
      { label: '停用', value: 'disabled' },
    ],
  },
  { prop: 'content', label: '内容', type: 'textarea', rows: 8 },
  { prop: 'description', label: '描述', type: 'textarea', rows: 3 },
  { prop: 'sort', label: '排序', component: 'InputNumber', componentProps: { min: 0 } },
]);

const chunkFields: FormField[] = [
  { prop: 'chunkIndex', label: '序号', component: 'InputNumber', componentProps: { min: 0 } },
  { prop: 'title', label: '标题', type: 'input' },
  { prop: 'content', label: '内容', type: 'textarea', rows: 8 },
  { prop: 'tokenCount', label: 'Token数', component: 'InputNumber', componentProps: { min: 0 } },
  { prop: 'sort', label: '排序', component: 'InputNumber', componentProps: { min: 0 } },
];

const baseRules: FormRules = {
  name: [{ required: true, message: '请输入知识库名称', trigger: 'blur' }],
};

const categoryRules: FormRules = {
  name: [{ required: true, message: '请输入分类名称', trigger: 'blur' }],
};

const documentRules: FormRules = {
  title: [{ required: true, message: '请输入文档标题', trigger: 'blur' }],
};

const chunkRules: FormRules = {
  content: [{ required: true, message: '请输入分片内容', trigger: 'blur' }],
};

const documentColumns: TableColumn[] = [
  { prop: 'title', label: '标题', minWidth: 180 },
  { prop: 'status', label: '状态', width: 90, slot: true },
  { prop: 'sourceType', label: '来源', width: 100 },
  { prop: 'sourceName', label: '来源名称', minWidth: 140 },
  { prop: 'updatedAt', label: '更新时间', width: 180, slot: true },
];

const chunkColumns: TableColumn[] = [
  { prop: 'chunkIndex', label: '序号', width: 80 },
  { prop: 'title', label: '标题', minWidth: 160 },
  { prop: 'content', label: '内容', minWidth: 320, slot: true },
  { prop: 'tokenCount', label: 'Token数', width: 100 },
  { prop: 'updatedAt', label: '更新时间', width: 180, slot: true },
];

const documentSearchFields: FormField[] = [
  { prop: 'keyword', label: '关键词', type: 'input', placeholder: '标题/来源/内容' },
];

const chunkSearchFields: FormField[] = [
  { prop: 'keyword', label: '关键词', type: 'input', placeholder: '标题/内容' },
];

watch(selectedBaseId, async () => {
  selectedCategoryId.value = undefined;
  selectedDocument.value = null;
  await fetchCategories();
  await nextTick();
  await documentTableRef.value?.refresh();
  await chunkTableRef.value?.refresh();
});

watch(selectedCategoryId, async () => {
  selectedDocument.value = null;
  await nextTick();
  await documentTableRef.value?.refresh();
  await chunkTableRef.value?.refresh();
});

watch(
  () => selectedDocument.value?.id,
  async () => {
    await nextTick();
    await chunkTableRef.value?.refresh();
  },
);

async function fetchBases() {
  loadingBases.value = true;
  try {
    const res = await getKnowledgeBases({ page: 1, pageSize: 1000 });
    bases.value = res.list;
    if (!selectedBaseId.value && bases.value.length) {
      selectedBaseId.value = bases.value[0].id;
    }
  } finally {
    loadingBases.value = false;
  }
}

async function fetchCategories() {
  if (!selectedBaseId.value) {
    categoryTree.value = [];
    return;
  }
  loadingCategories.value = true;
  try {
    categoryTree.value = await getKnowledgeBaseCategoryTree({
      knowledgeBaseId: selectedBaseId.value,
    });
  } finally {
    loadingCategories.value = false;
  }
}

function fetchDocuments(params: Record<string, unknown>) {
  if (!selectedBaseId.value) return Promise.resolve({ list: [], total: 0 });
  return getKnowledgeBaseDocuments({
    ...params,
    knowledgeBaseId: selectedBaseId.value,
    categoryId: selectedCategoryId.value,
  });
}

function fetchChunks(params: Record<string, unknown>) {
  if (!selectedBaseId.value || !selectedDocument.value) {
    return Promise.resolve({ list: [], total: 0 });
  }
  return getKnowledgeBaseChunks({
    ...params,
    knowledgeBaseId: selectedBaseId.value,
    documentId: selectedDocument.value.id,
  });
}

function flattenCategoryOptions(
  nodes: KnowledgeBaseCategoryTreeNode[],
  level = 0,
): CategoryOption[] {
  return nodes.flatMap((node) => [
    { label: `${'　'.repeat(level)}${node.name}`, value: node.id },
    ...flattenCategoryOptions(node.children ?? [], level + 1),
  ]);
}

function openCreateBase() {
  editingBase.value = null;
  Object.assign(baseForm, {
    name: '',
    code: '',
    description: '',
    isEnabled: true,
    sort: 0,
  });
  baseVisible.value = true;
}

function openEditBase() {
  if (!selectedBase.value) return;
  editingBase.value = selectedBase.value;
  Object.assign(baseForm, {
    name: selectedBase.value.name,
    code: selectedBase.value.code,
    description: selectedBase.value.description ?? '',
    isEnabled: selectedBase.value.isEnabled,
    sort: selectedBase.value.sort,
  });
  baseVisible.value = true;
}

async function saveBase() {
  await baseFormRef.value?.validate();
  savingBase.value = true;
  try {
    const payload = { ...baseForm };
    const saved = editingBase.value
      ? await updateKnowledgeBase(editingBase.value.id, payload)
      : await createKnowledgeBase(payload);
    selectedBaseId.value = saved.id;
    baseVisible.value = false;
    await fetchBases();
    ElMessage.success('保存成功');
  } finally {
    savingBase.value = false;
  }
}

async function removeSelectedBase() {
  if (!selectedBase.value) return;
  await ElMessageBox.confirm('确认删除该知识库及其下级分类、文档、分片？', '提示', {
    type: 'warning',
  });
  await deleteKnowledgeBase(selectedBase.value.id);
  selectedBaseId.value = undefined;
  await fetchBases();
  selectedBaseId.value = bases.value[0]?.id;
  ElMessage.success('删除成功');
}

function openCreateCategory() {
  if (!selectedBaseId.value) {
    ElMessage.warning('请先选择知识库');
    return;
  }
  editingCategory.value = null;
  Object.assign(categoryForm, {
    parentId: selectedCategoryId.value ?? null,
    name: '',
    code: '',
    description: '',
    sort: 0,
  });
  categoryVisible.value = true;
}

function openEditCategory() {
  const category = findCategoryById(categoryTree.value, selectedCategoryId.value);
  if (!category) return;
  editingCategory.value = category;
  Object.assign(categoryForm, {
    parentId: category.parentId,
    name: category.name,
    code: category.code,
    description: category.description ?? '',
    sort: category.sort,
  });
  categoryVisible.value = true;
}

async function saveCategory() {
  if (!selectedBaseId.value) return;
  await categoryFormRef.value?.validate();
  savingCategory.value = true;
  try {
    const payload = {
      ...categoryForm,
      knowledgeBaseId: selectedBaseId.value,
      parentId: categoryForm.parentId || null,
    };
    const saved = editingCategory.value
      ? await updateKnowledgeBaseCategory(editingCategory.value.id, payload)
      : await createKnowledgeBaseCategory(payload);
    selectedCategoryId.value = saved.id;
    categoryVisible.value = false;
    await fetchCategories();
    ElMessage.success('保存成功');
  } finally {
    savingCategory.value = false;
  }
}

async function removeSelectedCategory() {
  if (!selectedCategoryId.value) return;
  await ElMessageBox.confirm('确认删除该分类及其下级分类、文档、分片？', '提示', {
    type: 'warning',
  });
  await deleteKnowledgeBaseCategory(selectedCategoryId.value);
  selectedCategoryId.value = undefined;
  await fetchCategories();
  await documentTableRef.value?.refresh();
  ElMessage.success('删除成功');
}

function findCategoryById(
  nodes: KnowledgeBaseCategoryTreeNode[],
  id?: number,
): KnowledgeBaseCategoryTreeNode | null {
  if (!id) return null;
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findCategoryById(node.children ?? [], id);
    if (child) return child;
  }
  return null;
}

function handleCategoryClick(data: KnowledgeBaseCategoryTreeNode) {
  selectedCategoryId.value = data.id;
}

function clearCategory() {
  selectedCategoryId.value = undefined;
}

function openCreateDocument() {
  if (!selectedBaseId.value) {
    ElMessage.warning('请先选择知识库');
    return;
  }
  editingDocument.value = null;
  Object.assign(documentForm, {
    categoryId: selectedCategoryId.value ?? '',
    title: '',
    sourceType: 'manual',
    sourceName: '',
    status: 'draft',
    content: '',
    description: '',
    sort: 0,
  });
  documentVisible.value = true;
}

function openEditDocument(row: KnowledgeBaseDocument) {
  editingDocument.value = row;
  Object.assign(documentForm, {
    categoryId: row.categoryId ?? '',
    title: row.title,
    sourceType: row.sourceType,
    sourceName: row.sourceName,
    status: row.status,
    content: row.content ?? '',
    description: row.description ?? '',
    sort: row.sort,
  });
  documentVisible.value = true;
}

async function saveDocument() {
  if (!selectedBaseId.value) return;
  await documentFormRef.value?.validate();
  savingDocument.value = true;
  try {
    const payload = {
      ...documentForm,
      knowledgeBaseId: selectedBaseId.value,
      categoryId: documentForm.categoryId ? Number(documentForm.categoryId) : null,
    };
    const saved = editingDocument.value
      ? await updateKnowledgeBaseDocument(editingDocument.value.id, payload)
      : await createKnowledgeBaseDocument(payload);
    selectedDocument.value = saved;
    documentVisible.value = false;
    await documentTableRef.value?.refresh();
    ElMessage.success('保存成功');
  } finally {
    savingDocument.value = false;
  }
}

function deleteDocumentRequest(row: KnowledgeBaseDocument) {
  if (selectedDocument.value?.id === row.id) selectedDocument.value = null;
  return deleteKnowledgeBaseDocument(row.id);
}

function openCreateChunk() {
  if (!selectedDocument.value) {
    ElMessage.warning('请先选择文档');
    return;
  }
  editingChunk.value = null;
  Object.assign(chunkForm, {
    chunkIndex: 0,
    title: '',
    content: '',
    tokenCount: 0,
    sort: 0,
  });
  chunkVisible.value = true;
}

function openEditChunk(row: KnowledgeBaseChunk) {
  editingChunk.value = row;
  Object.assign(chunkForm, {
    chunkIndex: row.chunkIndex,
    title: row.title,
    content: row.content,
    tokenCount: row.tokenCount,
    sort: row.sort,
  });
  chunkVisible.value = true;
}

async function saveChunk() {
  if (!selectedDocument.value) return;
  await chunkFormRef.value?.validate();
  savingChunk.value = true;
  try {
    const payload = {
      ...chunkForm,
      documentId: selectedDocument.value.id,
    };
    if (editingChunk.value) {
      await updateKnowledgeBaseChunk(editingChunk.value.id, payload);
    } else {
      await createKnowledgeBaseChunk(payload);
    }
    chunkVisible.value = false;
    await chunkTableRef.value?.refresh();
    ElMessage.success('保存成功');
  } finally {
    savingChunk.value = false;
  }
}

function deleteChunkRequest(row: KnowledgeBaseChunk) {
  return deleteKnowledgeBaseChunk(row.id);
}

function selectDocument(row: KnowledgeBaseDocument) {
  selectedDocument.value = row;
}

onMounted(async () => {
  await fetchBases();
  await fetchCategories();
});
</script>

<template>
  <PageContainer title="知识库列表">
    <div class="knowledge-base">
      <aside class="knowledge-base__side">
        <div class="knowledge-base__side-title">知识库</div>
        <div class="knowledge-base__actions">
          <Button perm="KnowledgeBase.create" icon="Plus" size="small" @click="openCreateBase">
            新增
          </Button>
          <Button
            perm="KnowledgeBase.update"
            icon="Edit"
            size="small"
            :disabled="!selectedBase"
            @click="openEditBase"
          >
            编辑
          </Button>
          <Button
            perm="KnowledgeBase.delete"
            icon="Delete"
            size="small"
            :disabled="!selectedBase"
            @click="removeSelectedBase"
          >
            删除
          </Button>
        </div>
        <el-select
          v-model="selectedBaseId"
          v-loading="loadingBases"
          class="knowledge-base__select"
          placeholder="请选择知识库"
        >
          <el-option
            v-for="item in bases"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>

        <div class="knowledge-base__side-title knowledge-base__side-title--category">
          分类/目录
        </div>
        <div class="knowledge-base__actions">
          <Button perm="KnowledgeBase.create" icon="Plus" size="small" @click="openCreateCategory">
            新增
          </Button>
          <Button
            perm="KnowledgeBase.update"
            icon="Edit"
            size="small"
            :disabled="!selectedCategoryId"
            @click="openEditCategory"
          >
            编辑
          </Button>
          <Button
            perm="KnowledgeBase.delete"
            icon="Delete"
            size="small"
            :disabled="!selectedCategoryId"
            @click="removeSelectedCategory"
          >
            删除
          </Button>
        </div>
        <Button size="small" icon="RefreshLeft" :disabled="!selectedCategoryId" @click="clearCategory">
          全部文档
        </Button>
        <el-tree
          v-loading="loadingCategories"
          class="knowledge-base__tree"
          :data="categoryTree"
          node-key="id"
          :props="{ label: 'name', children: 'children' }"
          highlight-current
          default-expand-all
          @node-click="handleCategoryClick"
        />
      </aside>

      <main class="knowledge-base__main">
        <section class="knowledge-base__section">
          <div class="knowledge-base__section-title">
            文档
            <span v-if="selectedBase" class="knowledge-base__hint">
              {{ selectedBase.name }}
            </span>
          </div>
          <Table
            ref="documentTableRef"
            :columns="documentColumns"
            :search-fields="documentSearchFields"
            :request="fetchDocuments"
            :checkAble="false"
            :show-view="false"
            :delete-request="deleteDocumentRequest"
            action-width="210"
            perm-module="knowledgeBase"
            @edit="openEditDocument"
          >
            <template #toolbar>
              <Button
                perm="KnowledgeBase.create"
                icon="Plus"
                :disabled="!selectedBaseId"
                @click="openCreateDocument"
              >
                新增文档
              </Button>
            </template>
            <template #actions="{ row }">
              <Button link type="primary" icon="Files" @click="selectDocument(row)">
                分片
              </Button>
            </template>
            <template #column-status="{ row }">
              <el-tag :type="row.status === 'published' ? 'success' : 'info'">
                {{ row.status === 'published' ? '已发布' : row.status === 'disabled' ? '停用' : '草稿' }}
              </el-tag>
            </template>
            <template #column-updatedAt="{ row }">
              {{ formatDateTime(row.updatedAt) }}
            </template>
          </Table>
        </section>

        <section class="knowledge-base__section">
          <div class="knowledge-base__section-title">
            分片
            <span v-if="selectedDocument" class="knowledge-base__hint">
              {{ selectedDocument.title }}
            </span>
          </div>
          <Table
            ref="chunkTableRef"
            :columns="chunkColumns"
            :search-fields="chunkSearchFields"
            :request="fetchChunks"
            :checkAble="false"
            :show-view="false"
            :delete-request="deleteChunkRequest"
            action-width="150"
            perm-module="knowledgeBase"
            @edit="openEditChunk"
          >
            <template #toolbar>
              <Button
                perm="KnowledgeBase.create"
                icon="Plus"
                :disabled="!selectedDocument"
                @click="openCreateChunk"
              >
                新增分片
              </Button>
            </template>
            <template #column-content="{ row }">
              <span class="knowledge-base__chunk-content">{{ row.content }}</span>
            </template>
            <template #column-updatedAt="{ row }">
              {{ formatDateTime(row.updatedAt) }}
            </template>
          </Table>
        </section>
      </main>
    </div>

    <Dialog
      v-model="baseVisible"
      :title="editingBase ? '编辑知识库' : '新增知识库'"
      width="640px"
      :confirm-loading="savingBase"
      @confirm="saveBase"
    >
      <Form
        ref="baseFormRef"
        v-model="baseForm"
        :fields="baseFields"
        :rules="baseRules"
        label-width="90px"
      >
        <template #field-isEnabled="{ model }">
          <el-switch v-model="model.isEnabled" />
        </template>
      </Form>
    </Dialog>

    <Dialog
      v-model="categoryVisible"
      :title="editingCategory ? '编辑分类/目录' : '新增分类/目录'"
      width="640px"
      :confirm-loading="savingCategory"
      @confirm="saveCategory"
    >
      <Form
        ref="categoryFormRef"
        v-model="categoryForm"
        :fields="categoryFields"
        :rules="categoryRules"
        label-width="90px"
      />
    </Dialog>

    <Dialog
      v-model="documentVisible"
      :title="editingDocument ? '编辑文档' : '新增文档'"
      width="900px"
      :confirm-loading="savingDocument"
      @confirm="saveDocument"
    >
      <Form
        ref="documentFormRef"
        v-model="documentForm"
        :fields="documentFields"
        :rules="documentRules"
        label-width="90px"
      />
    </Dialog>

    <Dialog
      v-model="chunkVisible"
      :title="editingChunk ? '编辑分片' : '新增分片'"
      width="860px"
      :confirm-loading="savingChunk"
      @confirm="saveChunk"
    >
      <Form
        ref="chunkFormRef"
        v-model="chunkForm"
        :fields="chunkFields"
        :rules="chunkRules"
        label-width="90px"
      />
    </Dialog>
  </PageContainer>
</template>

<style scoped>
.knowledge-base {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 16px;
}

.knowledge-base__side {
  min-width: 0;
  padding-right: 16px;
  border-right: 1px solid #dcdfe6;
}

.knowledge-base__side-title,
.knowledge-base__section-title {
  margin-bottom: 10px;
  color: #303133;
  font-weight: 600;
}

.knowledge-base__side-title--category {
  margin-top: 18px;
}

.knowledge-base__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.knowledge-base__select {
  width: 100%;
}

.knowledge-base__tree {
  margin-top: 10px;
}

.knowledge-base__main {
  min-width: 0;
}

.knowledge-base__section + .knowledge-base__section {
  margin-top: 20px;
}

.knowledge-base__hint {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
  font-weight: 400;
}

.knowledge-base__chunk-content {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  white-space: normal;
}

@media (max-width: 1080px) {
  .knowledge-base {
    grid-template-columns: 1fr;
  }

  .knowledge-base__side {
    padding-right: 0;
    border-right: 0;
  }
}
</style>
