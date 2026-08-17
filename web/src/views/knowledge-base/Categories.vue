<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormRules } from 'element-plus';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Dialog from '@/components/Dialog.vue';
import Form, { type FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import {
  createKnowledgeBaseCategory,
  deleteKnowledgeBaseCategory,
  getKnowledgeBaseCategoryTree,
  updateKnowledgeBaseCategory,
  type KnowledgeBaseCategoryTreeNode,
} from '@/api/knowledgeBase';

const categoryTree = ref<KnowledgeBaseCategoryTreeNode[]>([]);
const selectedCategoryId = ref<number>();
const keyword = ref('');
const loadingCategories = ref(false);
const saving = ref(false);
const visible = ref(false);
const editingRow = ref<KnowledgeBaseCategoryTreeNode | null>(null);
const formRef = ref<InstanceType<typeof Form>>();

const selectedCategory = computed(() =>
  findCategoryById(categoryTree.value, selectedCategoryId.value),
);

const parentOptions = computed(() => [
  { label: '顶级分类', value: '' },
  ...flattenCategoryOptions(categoryTree.value).filter(
    (item) => Number(item.value) !== editingRow.value?.id,
  ),
]);

const form = reactive({
  parentId: '' as string | number,
  name: '',
  code: '',
  description: '',
  sort: 0,
});

const fields = computed<FormField[]>(() => [
  {
    prop: 'parentId',
    label: '上级分类',
    type: 'select',
    options: parentOptions.value,
  },
  { prop: 'name', label: '名称', type: 'input' },
  { prop: 'code', label: '编码', type: 'input' },
  { prop: 'description', label: '描述', type: 'textarea', rows: 3 },
  { prop: 'sort', label: '排序', component: 'InputNumber', componentProps: { min: 0 } },
]);

const rules: FormRules = {
  name: [{ required: true, message: '请输入分类名称', trigger: 'blur' }],
};

async function fetchCategories() {
  loadingCategories.value = true;
  try {
    categoryTree.value = await getKnowledgeBaseCategoryTree({
      keyword: keyword.value,
    });
  } finally {
    loadingCategories.value = false;
  }
}

async function handleSearch() {
  selectedCategoryId.value = undefined;
  await fetchCategories();
}

async function handleReset() {
  keyword.value = '';
  selectedCategoryId.value = undefined;
  await fetchCategories();
}

function flattenCategoryOptions(
  nodes: KnowledgeBaseCategoryTreeNode[],
  level = 0,
): Array<{ label: string; value: string | number }> {
  return nodes.flatMap((node) => [
    { label: `${'　'.repeat(level)}${node.name}`, value: node.id },
    ...flattenCategoryOptions(node.children ?? [], level + 1),
  ]);
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

function openCreate() {
  editingRow.value = null;
  Object.assign(form, {
    parentId: selectedCategoryId.value ?? '',
    name: '',
    code: '',
    description: '',
    sort: 0,
  });
  visible.value = true;
}

function openEdit() {
  const row = selectedCategory.value;
  if (!row) {
    ElMessage.warning('请先选择分类');
    return;
  }
  editingRow.value = row;
  Object.assign(form, {
    parentId: row.parentId ?? '',
    name: row.name,
    code: row.code,
    description: row.description ?? '',
    sort: row.sort,
  });
  visible.value = true;
}

async function save() {
  await formRef.value?.validate();
  saving.value = true;
  try {
    const payload = {
      parentId: form.parentId ? Number(form.parentId) : null,
      name: form.name,
      code: form.code,
      description: form.description,
      sort: form.sort,
    };
    const saved = editingRow.value
      ? await updateKnowledgeBaseCategory(editingRow.value.id, payload)
      : await createKnowledgeBaseCategory(payload);
    selectedCategoryId.value = saved.id;
    visible.value = false;
    await fetchCategories();
    ElMessage.success('保存成功');
  } finally {
    saving.value = false;
  }
}

async function removeSelected() {
  if (!selectedCategoryId.value) {
    ElMessage.warning('请先选择分类');
    return;
  }
  await ElMessageBox.confirm(
    '确认删除该分类及其下级分类？若分类下已有知识库，后端会阻止删除。',
    '提示',
    { type: 'warning' },
  );
  await deleteKnowledgeBaseCategory(selectedCategoryId.value);
  selectedCategoryId.value = undefined;
  await fetchCategories();
  ElMessage.success('删除成功');
}

function handleNodeClick(row: KnowledgeBaseCategoryTreeNode) {
  selectedCategoryId.value = row.id;
}

function handleCurrentChange(row?: KnowledgeBaseCategoryTreeNode) {
  selectedCategoryId.value = row?.id;
}

onMounted(fetchCategories);
</script>

<template>
  <PageContainer title="知识库分类">
    <div class="knowledge-category">
      <div class="knowledge-category__search">
        <span class="knowledge-category__label">关键词</span>
        <el-input
          v-model="keyword"
          class="knowledge-category__keyword"
          clearable
          placeholder="名称/编码/描述"
          @keyup.enter="handleSearch"
        />
        <Button type="primary" icon="Search" @click="handleSearch">查询</Button>
        <Button icon="RefreshLeft" @click="handleReset">重置</Button>
      </div>

      <div class="knowledge-category__toolbar">
        <Button perm="KnowledgeBase.create" icon="Plus" @click="openCreate">
          新增分类
        </Button>
        <Button
          perm="KnowledgeBase.update"
          icon="Edit"
          :disabled="!selectedCategoryId"
          @click="openEdit"
        >
          编辑分类
        </Button>
        <Button
          perm="KnowledgeBase.delete"
          icon="Delete"
          :disabled="!selectedCategoryId"
          @click="removeSelected"
        >
          删除分类
        </Button>
      </div>

      <div class="knowledge-category__meta">
        当前分类：{{ selectedCategory?.name || '-' }}
      </div>

      <el-table
        v-loading="loadingCategories"
        class="knowledge-category__table"
        :data="categoryTree"
        row-key="id"
        border
        stripe
        :tree-props="{ children: 'children' }"
        highlight-current
        default-expand-all
        @row-click="handleNodeClick"
        @current-change="handleCurrentChange"
      >
        <el-table-column prop="name" label="名称" min-width="180" />
        <el-table-column prop="code" label="编码" min-width="140" />
        <el-table-column prop="description" label="描述" min-width="220" />
        <el-table-column prop="sort" label="排序" width="90" />
        <el-table-column prop="updatedAt" label="更新时间" width="180">
          <template #default="{ row }">
            {{ row.updatedAt ? formatDateTime(row.updatedAt) : '-' }}
          </template>
        </el-table-column>
      </el-table>
    </div>

    <Dialog
      v-model="visible"
      :title="editingRow ? '编辑知识库分类' : '新增知识库分类'"
      width="640px"
      :confirm-loading="saving"
      @confirm="save"
    >
      <Form
        ref="formRef"
        v-model="form"
        :fields="fields"
        :rules="rules"
        label-width="90px"
      />
    </Dialog>
  </PageContainer>
</template>

<style scoped>
.knowledge-category {
  min-height: 460px;
}

.knowledge-category__search,
.knowledge-category__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}

.knowledge-category__toolbar {
  margin-bottom: 14px;
}

.knowledge-category__label {
  color: #303133;
  font-size: 14px;
}

.knowledge-category__keyword {
  width: 240px;
}

.knowledge-category__meta {
  margin-bottom: 12px;
  color: #909399;
  font-size: 13px;
}

.knowledge-category__table {
  width: 100%;
}
</style>
