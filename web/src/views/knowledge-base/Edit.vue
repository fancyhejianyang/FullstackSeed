<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import Button from '@/components/Button.vue';
import Form, { type FormField } from '@/components/Form.vue';
import UploadFile from '@/components/UploadFile.vue';
import {
  createKnowledgeBase,
  getKnowledgeBaseCategoryTree,
  updateKnowledgeBase,
  type KnowledgeBase,
  type KnowledgeBaseCategoryTreeNode,
} from '@/api/knowledgeBase';

const props = defineProps<{
  row?: KnowledgeBase | null;
}>();

const emit = defineEmits<{ success: [] }>();

const visible = defineModel<boolean>('visible', { required: true });
const submitting = ref(false);
const baseFormRef = ref<InstanceType<typeof Form>>();
const contentFormRef = ref<InstanceType<typeof Form>>();
const categoryTree = ref<KnowledgeBaseCategoryTreeNode[]>([]);

const form = reactive({
  categoryId: '' as string | number,
  name: '',
  code: '',
  contentType: 'text' as KnowledgeBase['contentType'],
  contentText: '',
  contentFile: '',
  fileName: '',
  fileUrl: '',
  isEnabled: true,
});

const contentTypeOptions = [
  { label: '文本', value: 'text' },
  { label: 'PDF', value: 'pdf' },
  { label: 'Word', value: 'word' },
];

const categoryOptions = computed(() => flattenCategoryOptions(categoryTree.value));

const baseFields = computed<FormField[]>(() => [
  {
    prop: 'categoryId',
    label: '所属分类',
    type: 'select',
    options: categoryOptions.value,
    placeholder: '请选择所属分类',
  },
  { prop: 'name', label: '名称', type: 'input' },
  { prop: 'code', label: '编码', type: 'input' },
  {
    prop: 'isEnabled',
    label: '状态',
    component: 'Switch',
    componentProps: { activeText: '启用', inactiveText: '停用' },
  },
]);

const contentFields = computed<FormField[]>(() => [
  {
    prop: 'contentType',
    label: '内容类型',
    type: 'select',
    options: contentTypeOptions,
    placeholder: '请选择内容类型',
  },
  form.contentType === 'text'
    ? {
        prop: 'contentText',
        label: '文本内容',
        type: 'textarea',
        rows: 8,
        placeholder: '请输入知识库文本内容',
      }
    : {
        prop: 'contentFile',
        label: form.contentType === 'pdf' ? '上传 PDF' : '上传 Word',
        slot: true,
      },
]);

const rules: FormRules = {
  categoryId: [{ required: true, message: '请选择所属分类', trigger: 'change' }],
  name: [{ required: true, message: '请输入知识库名称', trigger: 'blur' }],
  contentType: [{ required: true, message: '请选择内容类型', trigger: 'change' }],
  contentText: [
    {
      validator: (_rule, value, callback) => {
        if (form.contentType === 'text' && !String(value || '').trim()) {
          callback(new Error('请输入文本内容'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
  contentFile: [
    {
      validator: (_rule, _value, callback) => {
        if (form.contentType !== 'text' && !form.fileUrl) {
          callback(new Error('请上传文件'));
          return;
        }
        callback();
      },
      trigger: 'change',
    },
  ],
};

const fileAccept = computed(() =>
  form.contentType === 'pdf' ? '.pdf' : '.doc,.docx',
);

function flattenCategoryOptions(
  nodes: KnowledgeBaseCategoryTreeNode[],
  level = 0,
): Array<{ label: string; value: number }> {
  return nodes.flatMap((node) => [
    { label: `${'　'.repeat(level)}${node.name}`, value: node.id },
    ...flattenCategoryOptions(node.children ?? [], level + 1),
  ]);
}

async function fetchCategories() {
  categoryTree.value = await getKnowledgeBaseCategoryTree({});
}

function resetForm() {
  Object.assign(form, {
    categoryId: '',
    name: '',
    code: '',
    contentType: 'text',
    contentText: '',
    contentFile: '',
    fileName: '',
    fileUrl: '',
    isEnabled: true,
  });
}

function fillForm(row: KnowledgeBase) {
  Object.assign(form, {
    categoryId: row.categoryId ?? '',
    name: row.name ?? '',
    code: row.code ?? '',
    contentType: row.contentType ?? 'text',
    contentText: row.contentText ?? '',
    contentFile: '',
    fileName: row.fileName ?? '',
    fileUrl: row.fileUrl ?? '',
    isEnabled: !!row.isEnabled,
  });
}

watch(visible, (val) => {
  if (!val) return;
  void fetchCategories();
  if (props.row) {
    fillForm(props.row);
  } else {
    resetForm();
  }
});

watch(
  () => form.contentType,
  (value, oldValue) => {
    if (value === 'text') {
      form.fileName = '';
      form.fileUrl = '';
      form.contentFile = '';
      return;
    }
    form.contentText = '';
    if (oldValue && oldValue !== value) {
      form.fileName = '';
      form.fileUrl = '';
      form.contentFile = '';
    }
  },
);

async function handleSubmit() {
  await baseFormRef.value?.validate();
  await contentFormRef.value?.validate();
  submitting.value = true;
  try {
    const payload = {
      categoryId: Number(form.categoryId),
      name: form.name,
      code: form.code,
      contentType: form.contentType,
      contentText: form.contentType === 'text' ? form.contentText : undefined,
      fileName: form.contentType === 'text' ? undefined : form.fileName,
      fileUrl: form.contentType === 'text' ? undefined : form.fileUrl,
      isEnabled: form.isEnabled,
    };
    if (props.row) {
      await updateKnowledgeBase(props.row.id, payload);
      ElMessage.success('更新成功');
    } else {
      await createKnowledgeBase(payload);
      ElMessage.success('创建成功');
    }
    visible.value = false;
    emit('success');
  } finally {
    submitting.value = false;
  }
}

onMounted(fetchCategories);
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="props.row ? '编辑知识库' : '新增知识库'"
    size="100%"
    append-to-body
    destroy-on-close
  >
    <div class="knowledge-base-edit">
      <div class="knowledge-base-edit__section">基础信息</div>
      <Form
        ref="baseFormRef"
        v-model="form"
        :fields="baseFields"
        :rules="rules"
        label-width="100px"
      />
      <div class="knowledge-base-edit__section knowledge-base-edit__section--next">
        内容配置
      </div>
      <Form
        ref="contentFormRef"
        v-model="form"
        :fields="contentFields"
        :rules="rules"
        label-width="100px"
      >
        <template #field-contentFile>
          <UploadFile
            v-model="form.fileUrl"
            v-model:name="form.fileName"
            :accept="fileAccept"
            :drag-text="form.contentType === 'pdf' ? '上传 PDF 文件' : '上传 Word 文件'"
          />
        </template>
      </Form>
    </div>

    <template #footer>
      <div class="knowledge-base-edit__footer">
        <Button @click="visible = false">取消</Button>
        <Button type="primary" :loading="submitting" @click="handleSubmit">
          确定
        </Button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.knowledge-base-edit {
  max-width: 960px;
}

.knowledge-base-edit__section {
  margin-bottom: 12px;
  color: #303133;
  font-weight: 600;
}

.knowledge-base-edit__section--next {
  margin-top: 18px;
}

.knowledge-base-edit__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
