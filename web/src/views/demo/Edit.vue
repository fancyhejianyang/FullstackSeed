<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import {
  ElMessage,
  type FormRules,
  type UploadFile,
  type UploadUserFile,
} from 'element-plus';
import { UploadFilled } from '@element-plus/icons-vue';
import ProForm, { type ProFormField } from '@/components/ProForm.vue';
import ProDialog from '@/components/ProDialog.vue';
import {
  createDemo,
  getDemo,
  updateDemo,
  type Demo,
  type DemoForm,
} from '@/api/demo';
import { DicService, type DicItem } from '@/dic/service';
import { DEMO_CATEGORY, DEMO_STATUS, DEMO_TAG } from '@/dic';

const props = defineProps<{
  // 编辑对象；为 null 表示新增
  row?: Demo | null;
}>();

const emit = defineEmits<{ success: [] }>();

const visible = defineModel<boolean>('visible', { required: true });

const submitting = ref(false);
const loading = ref(false);
const formRef = ref<InstanceType<typeof ProForm>>();
const form = reactive<DemoForm>({
  title: '',
  content: '',
  status: 'draft',
  category: '',
  contactPhone: '',
  quantity: 0,
  unitPrice: 0,
  budgetAmount: 0,
  isFeatured: false,
  tags: [],
  imageUrl: '',
  attachmentName: '',
  attachmentUrl: '',
});
const imageFiles = ref<UploadUserFile[]>([]);
const attachmentFiles = ref<UploadUserFile[]>([]);

const categoryDic = ref<DicItem[]>([]);
const statusDic = ref<DicItem[]>([]);
const tagDic = ref<DicItem[]>([]);
DicService.init(DEMO_CATEGORY, categoryDic);
DicService.init(DEMO_STATUS, statusDic);
DicService.init(DEMO_TAG, tagDic);

const demoTotalAmount = 10000;

const fields: ProFormField[] = [
  { prop: 'title', label: '标题', type: 'input' },
  { prop: 'category', label: '分类', type: 'select', options: categoryDic },
  { prop: 'status', label: '状态', type: 'select', options: statusDic },
  {
    prop: 'contactPhone',
    label: '联系电话',
    component: 'InputPhone',
    componentProps: { required: false },
  },
  {
    prop: 'quantity',
    label: '数量',
    component: 'InputNumber',
    componentProps: { mode: 'integer', min: 0, precision: 0 },
  },
  {
    prop: 'unitPrice',
    label: '单价',
    component: 'InputNumber',
    componentProps: { mode: 'money', min: 0, suffixText: '元' },
  },
  {
    prop: 'budgetAmount',
    label: '预算金额',
    component: 'InputAmount',
    componentProps: {
      totalAmount: demoTotalAmount,
      switchable: true,
      min: 0,
      max: demoTotalAmount,
    },
  },
  { prop: 'isFeatured', label: '推荐', slot: true },
  { prop: 'tags', label: '标签', slot: true },
  { prop: 'imageUrl', label: '封面图片', slot: true },
  { prop: 'attachmentUrl', label: '附件文件', slot: true },
  { prop: 'content', label: '内容', type: 'textarea', rows: 4 },
];

const rules: FormRules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  category: [{ required: true, message: '请选择分类', trigger: 'change' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }],
};

function resetForm() {
  form.title = '';
  form.content = '';
  form.category = '';
  form.status = 'draft';
  form.contactPhone = '';
  form.quantity = 0;
  form.unitPrice = 0;
  form.budgetAmount = 0;
  form.isFeatured = false;
  form.tags = [];
  form.imageUrl = '';
  form.attachmentName = '';
  form.attachmentUrl = '';
  imageFiles.value = [];
  attachmentFiles.value = [];
}

function fillForm(data: Demo) {
  form.title = data.title ?? '';
  form.content = data.content ?? '';
  form.category = data.category ?? '';
  form.status = data.status ?? 'draft';
  form.contactPhone = data.contactPhone ?? '';
  form.quantity = data.quantity ?? 0;
  form.unitPrice = data.unitPrice ?? 0;
  form.budgetAmount = data.budgetAmount ?? 0;
  form.isFeatured = !!data.isFeatured;
  form.tags = data.tags ?? [];
  form.imageUrl = data.imageUrl ?? '';
  form.attachmentName = data.attachmentName ?? '';
  form.attachmentUrl = data.attachmentUrl ?? '';
  imageFiles.value = form.imageUrl
    ? [{ name: '封面图片', url: form.imageUrl }]
    : [];
  attachmentFiles.value = form.attachmentUrl
    ? [{ name: form.attachmentName || '附件文件', url: form.attachmentUrl }]
    : [];
}

watch(visible, async (val) => {
  if (!val) return;
  if (props.row?.id) {
    loading.value = true;
    try {
      const detail = await getDemo(props.row.id);
      fillForm(detail);
    } finally {
      loading.value = false;
    }
  } else {
    resetForm();
  }
});

async function handleSubmit() {
  await formRef.value?.validate();
  submitting.value = true;
  try {
    if (props.row) {
      await updateDemo(props.row.id, { ...form });
      ElMessage.success('更新成功');
    } else {
      await createDemo({ ...form });
      ElMessage.success('创建成功');
    }
    visible.value = false;
    emit('success');
  } finally {
    submitting.value = false;
  }
}

async function handleImageChange(file: UploadFile) {
  const url = await readFileAsDataUrl(file);
  form.imageUrl = url;
  imageFiles.value = [{ name: file.name, url }];
}

function handleImageRemove() {
  form.imageUrl = '';
  imageFiles.value = [];
}

async function handleAttachmentChange(file: UploadFile) {
  const url = await readFileAsDataUrl(file);
  form.attachmentName = file.name;
  form.attachmentUrl = url;
  attachmentFiles.value = [{ name: file.name, url }];
}

function handleAttachmentRemove() {
  form.attachmentName = '';
  form.attachmentUrl = '';
  attachmentFiles.value = [];
}

function readFileAsDataUrl(file: UploadFile) {
  return new Promise<string>((resolve, reject) => {
    if (!file.raw) {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file.raw);
  });
}
</script>

<template>
  <ProDialog
    v-model="visible"
    :title="props.row ? '编辑示例' : '新增示例'"
    width="860px"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <div v-loading="loading">
      <ProForm ref="formRef" v-model="form" :fields="fields" :rules="rules">
        <template #field-isFeatured>
          <el-checkbox v-model="form.isFeatured">推荐到首页</el-checkbox>
        </template>

        <template #field-tags>
          <el-checkbox-group v-model="form.tags">
            <el-checkbox
              v-for="item in tagDic"
              :key="item.value"
              :label="item.value"
            >
              {{ item.label }}
            </el-checkbox>
          </el-checkbox-group>
        </template>

        <template #field-imageUrl>
          <el-upload
            list-type="picture-card"
            :auto-upload="false"
            :limit="1"
            :file-list="imageFiles"
            accept="image/*"
            :on-change="handleImageChange"
            :on-remove="handleImageRemove"
          >
            <el-icon><UploadFilled /></el-icon>
          </el-upload>
        </template>

        <template #field-attachmentUrl>
          <el-upload
            drag
            :auto-upload="false"
            :limit="1"
            :file-list="attachmentFiles"
            :on-change="handleAttachmentChange"
            :on-remove="handleAttachmentRemove"
          >
            <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
            <div class="el-upload__text">
              将文件拖到此处，或点击上传
            </div>
          </el-upload>
        </template>
      </ProForm>
    </div>
  </ProDialog>
</template>
