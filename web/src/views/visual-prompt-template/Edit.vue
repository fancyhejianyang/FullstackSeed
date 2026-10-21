<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { ElMessage, type FormRules } from "element-plus";
import Dialog from "@/components/Dialog.vue";
import Form, { type FormField } from "@/components/Form.vue";
import {
  createVisualPromptTemplate,
  getVisualPromptAiConfigOptions,
  getVisualPromptTemplate,
  updateVisualPromptTemplate,
  type VisualPromptTemplate,
  type VisualPromptTemplateSummary,
  type VisualPromptTemplateForm,
} from "@/api/visualPromptTemplate";

const props = defineProps<{ row?: VisualPromptTemplateSummary | null }>();
const emit = defineEmits<{ success: [] }>();
const visible = defineModel<boolean>("visible", { required: true });
const formRef = ref<InstanceType<typeof Form>>();
const loading = ref(false);
const submitting = ref(false);
const configs = ref<Array<{ id: number; name: string; model: string | null }>>(
  [],
);
type EditorForm = Omit<VisualPromptTemplateForm, "variables"> & {
  variablesText: string;
};
const form = reactive<EditorForm>({
  name: "",
  mediaType: "image",
  targetModel: "",
  sourcePlatform: "",
  aiConfigId: "",
  sourcePrompt: "",
  sourceNegativePrompt: "",
  positiveTemplate: "",
  negativeTemplate: "",
  styleSummary: "",
  modelRules: "",
  variablesText: "",
  isEnabled: true,
});
const fields = computed<FormField[]>(() => [
  {
    prop: "name",
    label: "规范名称",
    type: "input",
    placeholder: "如：Flux 写实人像",
  },
  {
    prop: "mediaType",
    label: "媒体类型",
    type: "select",
    options: [
      { label: "图片", value: "image" },
      { label: "视频", value: "video" },
    ],
  },
  {
    prop: "targetModel",
    label: "目标模型",
    type: "input",
    placeholder: "如 flux1-dev；留空表示通用",
    hint: "建议填写工作流实际加载的模型标识；模型不同时提示词语法、标签顺序和负面词规则可能不同。",
  },
  {
    prop: "sourcePlatform",
    label: "Demo 来源",
    type: "input",
    placeholder: "如 ComfyUI 官方 Demo",
  },
  {
    prop: "aiConfigId",
    label: "提炼配置",
    type: "select",
    options: configs.value.map((item) => ({
      label: `${item.name}${item.model ? ` · ${item.model}` : ""}`,
      value: item.id,
    })),
    hint: "只使用“模型提示词规范”类型的 AI 配置，不调用 Agent。",
  },
  {
    prop: "sourcePrompt",
    label: "正向 Demo",
    type: "textarea",
    rows: 7,
    span: 2,
    placeholder: "粘贴官方或优质 Demo 中的正向提示词",
  },
  {
    prop: "sourceNegativePrompt",
    label: "负向 Demo",
    type: "textarea",
    rows: 5,
    span: 2,
    placeholder: "可选；粘贴 Demo 中的负向提示词",
  },
  {
    prop: "positiveTemplate",
    label: "正向提示词格式",
    type: "textarea",
    rows: 6,
    span: 2,
    placeholder: "可手动维护，也可保存后在列表点击“AI 提炼”",
  },
  {
    prop: "negativeTemplate",
    label: "负向提示词格式",
    type: "textarea",
    rows: 5,
    span: 2,
    placeholder: "模型不使用负向提示词时可留空",
  },
  {
    prop: "styleSummary",
    label: "风格摘要",
    type: "textarea",
    rows: 3,
    span: 2,
  },
  {
    prop: "modelRules",
    label: "模型规则",
    type: "textarea",
    rows: 5,
    span: 2,
    placeholder: "记录权重、标签顺序、分隔符、镜头或运动描述等模型专用规则",
  },
  {
    prop: "variablesText",
    label: "可变参数",
    type: "input",
    span: 2,
    placeholder: "逗号分隔，如 主体,场景,光线,镜头",
  },
  {
    prop: "isEnabled",
    label: "是否启用",
    component: "Switch",
    componentProps: { activeText: "启用", inactiveText: "停用" },
  },
]);
const rules: FormRules = {
  name: [{ required: true, message: "请输入规范名称", trigger: "blur" }],
  mediaType: [{ required: true, message: "请选择媒体类型", trigger: "change" }],
  aiConfigId: [
    {
      required: true,
      message: "请选择模型提示词规范 AI 配置",
      trigger: "change",
    },
  ],
  sourcePrompt: [
    { required: true, message: "请输入正向 Demo", trigger: "blur" },
  ],
};
function reset() {
  Object.assign(form, {
    name: "",
    mediaType: "image",
    targetModel: "",
    sourcePlatform: "",
    aiConfigId: configs.value[0]?.id || "",
    sourcePrompt: "",
    sourceNegativePrompt: "",
    positiveTemplate: "",
    negativeTemplate: "",
    styleSummary: "",
    modelRules: "",
    variablesText: "",
    isEnabled: true,
  });
}
watch(visible, async (open) => {
  if (!open) return;
  loading.value = true;
  try {
    configs.value = await getVisualPromptAiConfigOptions();
    reset();
    if (!props.row) return;
    const detail = await getVisualPromptTemplate(props.row.id);
    Object.assign(form, {
      name: detail.name,
      mediaType: detail.mediaType,
      targetModel: detail.targetModel || "",
      sourcePlatform: detail.sourcePlatform || "",
      aiConfigId: detail.aiConfigId,
      sourcePrompt: detail.sourcePrompt,
      sourceNegativePrompt: detail.sourceNegativePrompt || "",
      positiveTemplate: detail.positiveTemplate || "",
      negativeTemplate: detail.negativeTemplate || "",
      styleSummary: detail.styleSummary || "",
      modelRules: detail.modelRules || "",
      variablesText: (detail.variables || []).join(","),
      isEnabled: detail.isEnabled,
    });
  } finally {
    loading.value = false;
  }
});
async function submit() {
  await formRef.value?.validate();
  const payload: VisualPromptTemplateForm = {
    ...form,
    aiConfigId: Number(form.aiConfigId),
    variables: form.variablesText
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean),
  };
  delete (payload as VisualPromptTemplateForm & { variablesText?: string })
    .variablesText;
  submitting.value = true;
  try {
    if (props.row) await updateVisualPromptTemplate(props.row.id, payload);
    else await createVisualPromptTemplate(payload);
    ElMessage.success("模型提示词规范已保存");
    visible.value = false;
    emit("success");
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Dialog
    v-model="visible"
    :title="row ? '编辑模型提示词规范' : '新增模型提示词规范'"
    width="960px"
    body-max-height="76vh"
    :confirm-loading="submitting"
    @confirm="submit"
  >
    <div v-loading="loading">
      <el-alert
        v-if="!configs.length && !loading"
        title="请先在 AI 功能配置中新增并启用“模型提示词规范”配置"
        type="warning"
        :closable="false"
        show-icon
      />
      <Form
        ref="formRef"
        v-model="form"
        :fields="fields"
        :rules="rules"
        :columns="2"
        label-width="100px"
      />
    </div>
  </Dialog>
</template>
