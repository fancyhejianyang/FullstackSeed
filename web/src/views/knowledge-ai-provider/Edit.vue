<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import { ElMessage, type FormRules } from "element-plus";
import Dialog from "@/components/Dialog.vue";
import Form, { type FormField } from "@/components/Form.vue";
import {
  createKnowledgeAiProvider,
  getKnowledgeAiProvider,
  updateKnowledgeAiProvider,
  type KnowledgeAiProvider,
  type KnowledgeAiProviderForm,
} from "@/api/knowledgeAiProvider";

const props = defineProps<{
  row?: KnowledgeAiProvider | null;
}>();

const emit = defineEmits<{ success: [] }>();

const visible = defineModel<boolean>("visible", { required: true });
const loading = ref(false);
const submitting = ref(false);
const formRef = ref<InstanceType<typeof Form>>();
const secretKeyMasked = ref("");

const form = reactive<KnowledgeAiProviderForm>({
  name: "",
  apiUrl: "",
  workspaceId: "",
  chatApiPath: "v1/chat/completions",
  secretKey: "",
  models: "qwen-plus",
  textModels: "",
  visionModels: "",
  imageGenerationModels: "",
  imageGenerationProtocol: "openai",
  imageGenerationApiUrl: "",
  embeddingModels: "",
  isEnabled: true,
  description: "",
});

const fields: FormField[] = [
  {
    prop: "name",
    label: "名称",
    type: "input",
    placeholder: "如 OpenAI生产账号",
  },
  {
    prop: "apiUrl",
    label: "API 地址",
    type: "input",
    placeholder: "如 https://api.openai.com",
  },
  {
    prop: "workspaceId",
    label: "业务空间",
    type: "input",
    placeholder: "阿里云百炼 WorkspaceId；非阿里云可留空",
  },
  {
    prop: "chatApiPath",
    label: "Chat 路径",
    type: "input",
    placeholder: "v1/chat/completions",
  },
  {
    prop: "secretKey",
    label: "密钥",
    type: "input",
    inputMode: "text",
    placeholder: "编辑时保持星号不变表示不修改",
    componentProps: {
      autocomplete: "off",
      name: "ai-provider-secret",
      spellcheck: false,
    },
  },
  {
    prop: "models",
    label: "模型列表",
    type: "textarea",
    rows: 5,
    placeholder: "模型编码#模型名称\nqwen-plus#通义千问 Plus",
  },
  {
    prop: "textModels",
    label: "文本模型",
    type: "textarea",
    rows: 4,
    placeholder: "模型编码#模型名称\ngpt-4o-mini#GPT-4o Mini",
  },
  {
    prop: "visionModels",
    label: "视觉识别模型",
    type: "textarea",
    rows: 4,
    placeholder: "模型编码#模型名称\nqwen-vl-plus#通义千问 VL Plus",
    hint: "用于 OCR / 图片理解；需要支持 Chat Completions 的 image_url 输入，不代表能生成图片。",
  },
  {
    prop: "imageGenerationModels",
    label: "生图模型",
    type: "textarea",
    rows: 3,
    placeholder: "模型编码#模型名称（每行一个）",
    hint: "单独登记账号已开通的图片生成模型；不会自动并入文本或视觉识别目录。",
  },
  {
    prop: "imageGenerationProtocol",
    label: "生图协议",
    type: "select",
    options: [
      { label: "OpenAI Images 兼容接口", value: "openai" },
      { label: "阿里云 DashScope 同步多模态生图", value: "dashscope" },
    ],
    hint: "只支持同步文生图；不支持异步任务接口或图片编辑。请按供应商实际支持选择，不能仅按模型名称判断。",
  },
  {
    prop: "imageGenerationApiUrl",
    label: "生图接口地址",
    type: "input",
    placeholder: "完整 HTTPS 地址（不是 Chat 路径）",
    hint: "OpenAI：完整 /v1/images/generations 地址；百炼：完整 /api/v1/services/aigc/multimodal-generation/generation 地址。使用本账号密钥，需填写正确地域/业务空间。留空则不开放 Agent 生图引用。",
  },
  {
    prop: "embeddingModels",
    label: "向量模型",
    type: "textarea",
    rows: 4,
    placeholder: "模型编码#模型名称\ntext-embedding-v3#文本向量 v3",
  },
  {
    prop: "isEnabled",
    label: "是否启用",
    component: "Switch",
    componentProps: { activeText: "启用", inactiveText: "停用" },
  },
  { prop: "description", label: "描述", type: "textarea", rows: 3 },
];

const rules: FormRules = {
  name: [{ required: true, message: "请输入名称", trigger: "blur" }],
  apiUrl: [{ required: true, message: "请输入 API 地址", trigger: "blur" }],
};

function resetForm() {
  form.name = "";
  form.apiUrl = "";
  form.workspaceId = "";
  form.chatApiPath = "v1/chat/completions";
  form.secretKey = "";
  secretKeyMasked.value = "";
  form.models = "qwen-plus";
  form.textModels = "";
  form.visionModels = "";
  form.imageGenerationModels = "";
  form.imageGenerationProtocol = "openai";
  form.imageGenerationApiUrl = "";
  form.embeddingModels = "";
  form.isEnabled = true;
  form.description = "";
}

function fillForm(data: KnowledgeAiProvider) {
  form.name = data.name ?? "";
  form.apiUrl = data.apiUrl ?? "";
  form.workspaceId = data.workspaceId ?? "";
  form.chatApiPath = data.chatApiPath || "v1/chat/completions";
  secretKeyMasked.value = data.secretKeyMasked || "";
  form.secretKey = secretKeyMasked.value;
  form.models = data.models || "qwen-plus";
  form.textModels = data.textModels || "";
  form.visionModels = data.visionModels || "";
  form.imageGenerationModels = data.imageGenerationModels || "";
  form.imageGenerationProtocol = data.imageGenerationProtocol || "openai";
  form.imageGenerationApiUrl = data.imageGenerationApiUrl || "";
  form.embeddingModels = data.embeddingModels || "";
  form.isEnabled = !!data.isEnabled;
  form.description = data.description ?? "";
}

watch(visible, async (value) => {
  if (!value) return;
  if (props.row?.id) {
    loading.value = true;
    try {
      fillForm(await getKnowledgeAiProvider(props.row.id));
    } finally {
      loading.value = false;
    }
  } else {
    resetForm();
  }
});

function buildPayload() {
  const payload: KnowledgeAiProviderForm = { ...form };
  const secretKey = payload.secretKey?.trim() ?? "";
  if (props.row && (!secretKey || secretKey === secretKeyMasked.value)) {
    delete payload.secretKey;
  }
  return payload;
}

async function handleSubmit() {
  await formRef.value?.validate();
  submitting.value = true;
  try {
    if (props.row?.id) {
      await updateKnowledgeAiProvider(props.row.id, buildPayload());
      ElMessage.success("更新成功");
    } else {
      await createKnowledgeAiProvider(buildPayload());
      ElMessage.success("创建成功");
    }
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
    :title="props.row ? '编辑大模型账号' : '新增大模型账号'"
    width="760px"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <div v-loading="loading">
      <Form
        ref="formRef"
        v-model="form"
        :fields="fields"
        :rules="rules"
        label-width="100px"
      />
    </div>
  </Dialog>
</template>
