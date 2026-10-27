<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { ElMessage, type FormRules } from "element-plus";
import { useUserStore } from "@/stores/user";
import Dialog from "@/components/Dialog.vue";
import Form, { type FormField } from "@/components/Form.vue";
import {
  getComfyPromptSummaryDraft,
  getComfyPromptSummaryWorkflowOptions,
  type ComfyPromptSummaryWorkflowOption,
} from "@/api/comfyUi";
import {
  createVisualPromptTemplate,
  extractVisualPromptTemplate,
  getVisualPromptAiConfigOptions,
  getVisualPromptExtractTask,
  getVisualPromptTemplate,
  updateVisualPromptTemplate,
  type VisualPromptTemplateSummary,
  type VisualPromptTemplateForm,
} from "@/api/visualPromptTemplate";

const user = useUserStore();
const canRefine = computed(() =>
  user.hasPermission("VisualPromptTemplate.aiRefine"),
);
const props = defineProps<{ row?: VisualPromptTemplateSummary | null }>();
const emit = defineEmits<{ success: [] }>();
const visible = defineModel<boolean>("visible", { required: true });
const formRef = ref<InstanceType<typeof Form>>();
const loading = ref(false);
const loadingWorkflow = ref(false);
const submitting = ref(false);
const extractStage = ref("");
const activeTemplateId = ref<number | null>(null);
const configs = ref<Array<{ id: number; name: string; model: string | null }>>(
  [],
);
const workflows = ref<ComfyPromptSummaryWorkflowOption[]>([]);
let workflowLoadToken = 0;
let suspendWorkflowWatch = false;

const form = reactive<VisualPromptTemplateForm>({
  workflowId: "",
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
  variables: [],
  isEnabled: true,
});

const fields = computed<FormField[]>(() => [
  {
    prop: "workflowId",
    label: "来源工作流",
    type: "select",
    span: 2,
    placeholder: "请选择已导入的 ComfyUI 工作流",
    options: workflows.value.map((item) => ({
      label: `${item.name} · ${item.targetModel || "未识别模型"} · v${item.version}${item.isEnabled ? "" : " · 已停用"}`,
      value: item.id,
    })),
    hint: "选择后由系统读取工作流 JSON，并自动识别媒体类型、目标模型、主提示词以及可选的负向提示词。",
  },
  {
    prop: "name",
    label: "总结名称",
    type: "input",
    placeholder: "选择工作流后自动生成，可按需调整",
  },
  {
    prop: "aiConfigId",
    label: "提炼配置",
    type: "select",
    options: configs.value.map((item) => ({
      label: `${item.name}${item.model ? ` · ${item.model}` : ""}`,
      value: item.id,
    })),
    hint: "只使用“提示词总结”文本 AI 配置，不调用 Agent。",
  },
  {
    prop: "mediaType",
    label: "媒体类型",
    type: "select",
    options: [
      { label: "图片", value: "image" },
      { label: "视频", value: "video" },
    ],
    componentProps: { disabled: true },
  },
  {
    prop: "targetModel",
    label: "目标模型",
    type: "input",
    placeholder: "由工作流自动识别",
    componentProps: { disabled: true },
  },
  {
    prop: "sourcePlatform",
    label: "提示词来源",
    type: "input",
    span: 2,
    componentProps: { disabled: true },
  },
  {
    prop: "sourcePrompt",
    label: "原始主提示词",
    type: "textarea",
    rows: 7,
    span: 2,
    componentProps: { disabled: true },
  },
  {
    prop: "sourceNegativePrompt",
    label: "原始负向提示词",
    type: "textarea",
    rows: 5,
    span: 2,
    placeholder: "工作流未配置负向提示词",
    componentProps: { disabled: true },
  },
  {
    prop: "isEnabled",
    label: "是否启用",
    component: "Switch",
    componentProps: { activeText: "启用", inactiveText: "停用" },
  },
]);

const rules: FormRules = {
  workflowId: [
    { required: true, message: "请选择来源工作流", trigger: "change" },
  ],
  name: [{ required: true, message: "请输入总结名称", trigger: "blur" }],
  aiConfigId: [
    {
      required: true,
      message: "请选择提示词总结 AI 配置",
      trigger: "change",
    },
  ],
  sourcePrompt: [
    {
      required: true,
      message: "所选工作流未识别到主提示词或正向提示词",
      trigger: "change",
    },
  ],
};

function reset() {
  activeTemplateId.value = null;
  extractStage.value = "";
  Object.assign(form, {
    workflowId: "",
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
    variables: [],
    isEnabled: true,
  });
}

async function loadWorkflowDraft(workflowId: number) {
  const token = ++workflowLoadToken;
  loadingWorkflow.value = true;
  try {
    const draft = await getComfyPromptSummaryDraft(workflowId);
    if (token !== workflowLoadToken) return;
    activeTemplateId.value = draft.visualPromptTemplateId;
    Object.assign(form, {
      workflowId: draft.workflowId,
      name: draft.name,
      mediaType: draft.mediaType,
      targetModel: draft.targetModel || "",
      sourcePlatform: draft.sourcePlatform,
      sourcePrompt: draft.sourcePrompt,
      sourceNegativePrompt: draft.sourceNegativePrompt || "",
      positiveTemplate: "",
      negativeTemplate: "",
      styleSummary: "",
      modelRules: "",
      variables: [],
    });
  } finally {
    if (token === workflowLoadToken) loadingWorkflow.value = false;
  }
}

watch(
  () => form.workflowId,
  (value) => {
    if (!visible.value || suspendWorkflowWatch || !value) return;
    void loadWorkflowDraft(Number(value));
  },
);

watch(visible, async (open) => {
  workflowLoadToken += 1;
  if (!open) return;
  loading.value = true;
  suspendWorkflowWatch = true;
  try {
    [configs.value, workflows.value] = await Promise.all([
      getVisualPromptAiConfigOptions(),
      getComfyPromptSummaryWorkflowOptions(),
    ]);
    reset();
    if (!props.row) return;
    const detail = await getVisualPromptTemplate(props.row.id);
    const workflow = workflows.value.find(
      (item) => item.visualPromptTemplateId === detail.id,
    );
    activeTemplateId.value = detail.id;
    Object.assign(form, {
      workflowId: workflow?.id || "",
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
      variables: detail.variables || [],
      isEnabled: detail.isEnabled,
    });
  } finally {
    suspendWorkflowWatch = false;
    loading.value = false;
  }
});

async function submit() {
  await formRef.value?.validate();
  const payload: VisualPromptTemplateForm = {
    ...form,
    workflowId: Number(form.workflowId),
    aiConfigId: Number(form.aiConfigId),
    positiveTemplate: "",
    negativeTemplate: "",
    styleSummary: "",
    modelRules: "",
    variables: [],
  };
  submitting.value = true;
  extractStage.value = "正在保存工作流提示词";
  try {
    const templateId = activeTemplateId.value || props.row?.id;
    const saved = templateId
      ? await updateVisualPromptTemplate(templateId, payload)
      : await createVisualPromptTemplate(payload);
    activeTemplateId.value = saved.id;
    emit("success");
    if (!canRefine.value) {
      ElMessage.success("保存成功；未发起 AI 提炼");
      visible.value = false;
      return;
    }
    extractStage.value = "正在提交 AI 提炼";
    let task = await extractVisualPromptTemplate(saved.id, crypto.randomUUID());
    while (["pending", "running"].includes(task.status)) {
      extractStage.value = task.stage;
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
      task = await getVisualPromptExtractTask(task.id);
    }
    if (task.status !== "succeeded") {
      ElMessage.error(
        task.errorMessage ||
          "原始提示词已保存，但 AI 提炼失败，请检查配置后重新提炼",
      );
      return;
    }
    ElMessage.success("提示词风格与格式已完成提炼");
    visible.value = false;
    emit("success");
  } finally {
    submitting.value = false;
    extractStage.value = "";
  }
}
</script>

<template>
  <Dialog
    v-model="visible"
    :title="
      canRefine
        ? row
          ? '重新提炼提示词'
          : '提炼提示词'
        : row
          ? '编辑提示词'
          : '新增提示词'
    "
    width="960px"
    body-max-height="76vh"
    :confirm-text="canRefine ? '保存并提炼' : '保存'"
    :confirm-loading="submitting"
    @confirm="submit"
  >
    <div v-loading="loading || loadingWorkflow">
      <el-alert
        title="选择已导入工作流后，系统会读取其中的原始提示词；工作流 JSON 会完整保留，创建生成任务时才会清空原提示词并注入本次结果。"
        type="info"
        :closable="false"
        show-icon
      />
      <el-alert
        v-if="!configs.length && !loading"
        title="请先在 AI 功能配置中新增并启用“提示词总结”配置"
        type="warning"
        :closable="false"
        show-icon
      />
      <el-alert
        v-if="extractStage"
        :title="extractStage"
        type="success"
        :closable="false"
        show-icon
      />
      <Form
        ref="formRef"
        v-model="form"
        :fields="fields"
        :rules="rules"
        :columns="2"
        label-width="120px"
      />
    </div>
  </Dialog>
</template>
