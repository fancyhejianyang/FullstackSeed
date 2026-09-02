<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import Button from '@/components/Button.vue';
import Form, { type FormField } from '@/components/Form.vue';
import Input from '@/components/Input.vue';
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
const fillingForm = ref(false);
const textSourceMode = ref<'input' | 'upload'>('input');

const form = reactive({
  categoryId: '' as string | number,
  name: '',
  hitKeywords: '',
  colloquialDescription: '',
  matchPriority: 1,
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
  { label: '图片', value: 'image' },
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
  {
    prop: 'hitKeywords',
    label: '命中关键字',
    type: 'textarea',
    rows: 3,
    placeholder: '多个关键字可用逗号、空格或换行分隔',
  },
  {
    prop: 'colloquialDescription',
    label: '口语化说法',
    type: 'textarea',
    rows: 3,
    placeholder: '仅用于检索匹配，如用户可能会说的问法、简称、别名',
  },
  {
    prop: 'matchPriority',
    label: '匹配优先级',
    component: 'InputNumber',
    componentProps: { mode: 'integer', min: 1, max: 9999 },
  },
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
        slot: true,
      }
    : {
        prop: 'contentFile',
        label: getUploadLabel(form.contentType),
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
  form.contentType === 'text'
    ? '.txt,.md'
    : form.contentType === 'pdf'
    ? '.pdf'
    : form.contentType === 'image'
      ? '.png,.jpg,.jpeg,.webp,.bmp'
      : '.doc,.docx',
);

const uploadDragText = computed(() => {
  if (form.contentType === 'text') return '上传 TXT / Markdown 文件';
  if (form.contentType === 'pdf') return '上传 PDF 文件';
  if (form.contentType === 'image') return '上传图片文件';
  return '上传 Word 文件';
});

function getUploadLabel(contentType: KnowledgeBase['contentType']) {
  if (contentType === 'text') return '文本文件';
  if (contentType === 'pdf') return '上传 PDF';
  if (contentType === 'image') return '上传图片';
  return '上传 Word';
}

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
  textSourceMode.value = 'input';
  Object.assign(form, {
    categoryId: '',
    name: '',
    hitKeywords: '',
    colloquialDescription: '',
    matchPriority: 1,
    contentType: 'text',
    contentText: '',
    contentFile: '',
    fileName: '',
    fileUrl: '',
    isEnabled: true,
  });
}

function fillForm(row: KnowledgeBase) {
  fillingForm.value = true;
  textSourceMode.value = 'input';
  Object.assign(form, {
    categoryId: row.categoryId ?? '',
    name: row.name ?? '',
    hitKeywords: row.hitKeywords ?? '',
    colloquialDescription: row.colloquialDescription ?? '',
    matchPriority: row.matchPriority ?? 1,
    contentType: row.contentType ?? 'text',
    contentText: row.contentText ?? '',
    contentFile: '',
    fileName: row.fileName ?? '',
    fileUrl: row.fileUrl ?? '',
    isEnabled: !!row.isEnabled,
  });
  void nextTick(() => {
    fillingForm.value = false;
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
    if (fillingForm.value) return;
    if (value === 'text') {
      form.fileName = '';
      form.fileUrl = '';
      form.contentFile = '';
      textSourceMode.value = 'input';
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

watch(textSourceMode, (value) => {
  if (value !== 'input') return;
  form.fileName = '';
  form.fileUrl = '';
  form.contentFile = '';
});

async function handleSubmit() {
  await baseFormRef.value?.validate();
  await contentFormRef.value?.validate();
  submitting.value = true;
  try {
    const payload = {
      categoryId: Number(form.categoryId),
      name: form.name,
      hitKeywords: form.hitKeywords,
      colloquialDescription: form.colloquialDescription,
      matchPriority: Number(form.matchPriority || 1),
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
        <template #field-contentText>
          <div class="knowledge-base-edit__text-source">
            <el-radio-group v-model="textSourceMode" size="small">
              <el-radio-button label="input">直接录入</el-radio-button>
              <el-radio-button label="upload">上传 TXT / MD</el-radio-button>
            </el-radio-group>

            <Input
              v-if="textSourceMode === 'input'"
              v-model="form.contentText"
              mode="textarea"
              :rows="8"
              placeholder="请输入知识库文本内容"
            />
            <UploadFile
              v-else
              v-model="form.fileUrl"
              v-model:name="form.fileName"
              v-model:content="form.contentText"
              :accept="fileAccept"
              :drag-text="uploadDragText"
              read-text
            />
            <div v-if="textSourceMode === 'upload'" class="knowledge-base-edit__text-tip">
              上传后会读取 TXT / Markdown 正文并保存为文本内容，文件名仅用于本次上传展示。
            </div>
          </div>
        </template>
        <template #field-contentFile>
          <UploadFile
            v-model="form.fileUrl"
            v-model:name="form.fileName"
            :accept="fileAccept"
            :drag-text="uploadDragText"
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
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  box-sizing: border-box;
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

.knowledge-base-edit__text-source {
  width: 100%;
}

.knowledge-base-edit__text-source > .el-radio-group {
  margin-bottom: 8px;
}

.knowledge-base-edit__text-source :deep(.input-wrapper),
.knowledge-base-edit__text-source :deep(.el-textarea),
.knowledge-base-edit__text-source :deep(.upload-file) {
  width: 100%;
}

.knowledge-base-edit__text-tip {
  margin-top: 6px;
  color: #909399;
  font-size: 12px;
  line-height: 1.4;
}
</style>
