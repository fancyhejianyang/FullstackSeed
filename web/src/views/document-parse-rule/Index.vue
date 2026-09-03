<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, type FormRules } from 'element-plus';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Form, { type FormField } from '@/components/Form.vue';
import {
  getCurrentDocumentParseRule,
  saveCurrentDocumentParseRule,
  type DocumentParseRule,
  type DocumentParseRuleForm,
} from '@/api/documentParseRule';

const formRef = ref<InstanceType<typeof Form>>();
const loading = ref(false);
const submitting = ref(false);
const currentId = ref<number | null>(null);
const updatedAt = ref('');

const form = reactive<DocumentParseRuleForm>({
  name: '系统默认文档解析规则',
  textMaxSizeMb: 1,
  textMaxLines: 5000,
  pdfPagesPerPart: 10,
  wordParagraphsPerPart: 200,
  preferSentenceBoundary: true,
  isEnabled: true,
});

const fields: FormField[] = [
  { prop: 'name', label: '规则名称', type: 'input', placeholder: '如 系统默认文档解析规则' },
  {
    prop: 'textMaxSizeMb',
    label: 'TXT目标大小',
    component: 'InputNumber',
    componentProps: { mode: 'integer', min: 1, max: 50, suffixText: 'MB' },
  },
  {
    prop: 'textMaxLines',
    label: 'TXT最大行数',
    component: 'InputNumber',
    componentProps: { mode: 'integer', min: 100, max: 1000000, suffixText: '行' },
  },
  {
    prop: 'pdfPagesPerPart',
    label: 'PDF每份页数',
    component: 'InputNumber',
    componentProps: { mode: 'integer', min: 1, max: 200, suffixText: '页' },
  },
  {
    prop: 'wordParagraphsPerPart',
    label: 'Word每份段落',
    component: 'InputNumber',
    componentProps: { mode: 'integer', min: 10, max: 10000, suffixText: '段' },
  },
  {
    prop: 'preferSentenceBoundary',
    label: '优先完整边界',
    component: 'Switch',
    componentProps: { activeText: '句末/段落', inactiveText: '严格大小' },
  },
  {
    prop: 'isEnabled',
    label: '是否启用',
    component: 'Switch',
    componentProps: { activeText: '启用', inactiveText: '停用' },
  },
];

const rules: FormRules = {
  name: [{ required: true, message: '请输入规则名称', trigger: 'blur' }],
  textMaxSizeMb: [{ required: true, message: '请输入 TXT 目标大小', trigger: 'blur' }],
  textMaxLines: [{ required: true, message: '请输入 TXT 最大行数', trigger: 'blur' }],
  pdfPagesPerPart: [{ required: true, message: '请输入 PDF 每份页数', trigger: 'blur' }],
  wordParagraphsPerPart: [{ required: true, message: '请输入 Word 每份段落数', trigger: 'blur' }],
};

function fillForm(data: DocumentParseRule) {
  currentId.value = data.id;
  updatedAt.value = data.updatedAt;
  Object.assign(form, {
    name: data.name,
    textMaxSizeMb: data.textMaxSizeMb,
    textMaxLines: data.textMaxLines,
    pdfPagesPerPart: data.pdfPagesPerPart,
    wordParagraphsPerPart: data.wordParagraphsPerPart,
    preferSentenceBoundary: !!data.preferSentenceBoundary,
    isEnabled: !!data.isEnabled,
  });
}

async function loadConfig() {
  loading.value = true;
  try {
    fillForm(await getCurrentDocumentParseRule());
  } catch {
    ElMessage.error('获取文档解析规则失败');
  } finally {
    loading.value = false;
  }
}

async function handleSubmit() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  submitting.value = true;
  try {
    fillForm(await saveCurrentDocumentParseRule({ ...form }));
    ElMessage.success(currentId.value ? '保存成功' : '创建成功');
  } finally {
    submitting.value = false;
  }
}

onMounted(loadConfig);
</script>

<template>
  <PageContainer title="文档解析规则">
    <div class="document-parse-rule" v-loading="loading">
      <div class="document-parse-rule__header">
        <div>
          <h2>上传预拆分规则</h2>
          <p>用于大文件进入解析任务前的预处理。TXT/MD 按大小和行数拆分，PDF 按页数规划，Word 按段落规划。</p>
          <p class="document-parse-rule__tip">达到目标后会优先向后寻找句末或段落结束，避免截断完整语义。预拆分不替代后续知识库分片。</p>
        </div>
        <el-tag :type="form.isEnabled ? 'success' : 'info'">
          {{ form.isEnabled ? '启用中' : '已停用' }}
        </el-tag>
      </div>

      <Form ref="formRef" v-model="form" :fields="fields" :rules="rules" label-width="130px" />

      <div class="document-parse-rule__footer">
        <span>{{ updatedAt ? `最后更新：${updatedAt}` : '尚未保存配置' }}</span>
        <Button type="primary" icon="Check" :loading="submitting" @click="handleSubmit">保存配置</Button>
      </div>
    </div>
  </PageContainer>
</template>

<style scoped>
.document-parse-rule {
  max-width: 920px;
}

.document-parse-rule__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.document-parse-rule__header h2 {
  margin: 0 0 8px;
  color: #303133;
  font-size: 16px;
  font-weight: 600;
}

.document-parse-rule__header p {
  margin: 0;
  color: #606266;
  line-height: 1.6;
}

.document-parse-rule__tip {
  margin-top: 4px !important;
  color: #909399 !important;
}

.document-parse-rule__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 8px;
  color: #909399;
  font-size: 12px;
}
</style>
