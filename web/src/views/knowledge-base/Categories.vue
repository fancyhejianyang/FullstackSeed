<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type FormRules } from 'element-plus';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Dialog from '@/components/Dialog.vue';
import Form, { type FormField } from '@/components/Form.vue';
import {
  createKnowledgeBaseCategory,
  deleteKnowledgeBaseCategory,
  getKnowledgeBaseCategoryTree,
  getKnowledgeBases,
  updateKnowledgeBaseCategory,
  type KnowledgeBase,
  type KnowledgeBaseCategoryTreeNode,
} from '@/api/knowledgeBase';

const bases = ref<KnowledgeBase[]>([]);
const categoryTree = ref<KnowledgeBaseCategoryTreeNode[]>([]);
const selectedBaseId = ref<number>();
const selectedCategoryId = ref<number>();
const loadingBases = ref(false);
const loadingCategories = ref(false);
const saving = ref(false);
const visible = ref(false);
const editingRow = ref<KnowledgeBaseCategoryTreeNode | null>(null);
const formRef = ref<InstanceType<typeof Form>>();

const selectedBase = computed(() =>
  bases.value.find((item) => item.id === selectedBaseId.value),
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

watch(selectedBaseId, async () => {
  selectedCategoryId.value = undefined;
  await fetchCategories();
});

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
  if (!selectedBaseId.value) {
    ElMessage.warning('请先选择知识库');
    return;
  }
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
  const row = findCategoryById(categoryTree.value, selectedCategoryId.value);
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
  if (!selectedBaseId.value) return;
  await formRef.value?.validate();
  saving.value = true;
  try {
    const payload = {
      knowledgeBaseId: selectedBaseId.value,
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
  await ElMessageBox.confirm('确认删除该分类及其下级分类、文档、分片？', '提示', {
    type: 'warning',
  });
  await deleteKnowledgeBaseCategory(selectedCategoryId.value);
  selectedCategoryId.value = undefined;
  await fetchCategories();
  ElMessage.success('删除成功');
}

function handleNodeClick(row: KnowledgeBaseCategoryTreeNode) {
  selectedCategoryId.value = row.id;
}

onMounted(async () => {
  await fetchBases();
  await fetchCategories();
});
</script>

<template>
  <PageContainer title="知识库分类">
    <div class="knowledge-category">
      <div class="knowledge-category__toolbar">
        <el-select
          v-model="selectedBaseId"
          v-loading="loadingBases"
          class="knowledge-category__select"
          placeholder="请选择知识库"
        >
          <el-option
            v-for="item in bases"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
        <Button perm="KnowledgeBase.create" icon="Plus" :disabled="!selectedBaseId" @click="openCreate">
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
        当前知识库：{{ selectedBase?.name || '-' }}
      </div>

      <el-tree
        v-loading="loadingCategories"
        class="knowledge-category__tree"
        :data="categoryTree"
        node-key="id"
        :props="{ label: 'name', children: 'children' }"
        highlight-current
        default-expand-all
        @node-click="handleNodeClick"
      />
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

.knowledge-category__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}

.knowledge-category__select {
  width: 280px;
}

.knowledge-category__meta {
  margin-bottom: 12px;
  color: #909399;
  font-size: 13px;
}

.knowledge-category__tree {
  max-width: 720px;
}
</style>
