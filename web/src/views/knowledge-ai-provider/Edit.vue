<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { ElMessage, type FormRules } from "element-plus";
import Dialog from "@/components/Dialog.vue";
import Form, { type FormField } from "@/components/Form.vue";
import {
  detectModelPlatform,
  modelPlatformLabels,
} from "@/utils/modelPlatform";
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
  secretKey: "",
  models: "qwen-plus",
  textModels: "",
  visionModels: "",
  imageGenerationModels: "",
  videoGenerationModels: "",
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
    hint: "填写平台基础地址；各模型功能的协议与调用路径统一在第三方配置 → 模型厂商调用接口中维护。",
  },
  { prop: "platformType", label: "平台类型", slot: true },
  {
    prop: "workspaceId",
    label: "业务空间",
    type: "input",
    placeholder: "阿里云百炼 WorkspaceId；非阿里云可留空",
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
    prop: "videoGenerationModels",
    label: "视频生成模型",
    type: "textarea",
    rows: 3,
    placeholder: "模型编码#模型名称（每行一个）\nwan2.6-t2v#万相文生视频",
    hint: "单独登记账号已开通的视频生成模型，用于文生、首帧及多参考素材生视频。",
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
];
const platformLabel = computed(() =>
  form.apiUrl.trim()
    ? modelPlatformLabels[detectModelPlatform(form.apiUrl)]
    : "等待填写 API 地址",
);

const rules: FormRules = {
  name: [{ required: true, message: "请输入名称", trigger: "blur" }],
  apiUrl: [{ required: true, message: "请输入 API 地址", trigger: "blur" }],
};

function resetForm() {
  form.name = "";
  form.apiUrl = "";
  form.workspaceId = "";
  form.secretKey = "";
  secretKeyMasked.value = "";
  form.models = "qwen-plus";
  form.textModels = "";
  form.visionModels = "";
  form.imageGenerationModels = "";
  form.videoGenerationModels = "";
  form.embeddingModels = "";
  form.isEnabled = true;
  form.description = "";
}

function fillForm(data: KnowledgeAiProvider) {
  form.name = data.name ?? "";
  form.apiUrl = data.apiUrl ?? "";
  form.workspaceId = data.workspaceId ?? "";
  secretKeyMasked.value = data.secretKeyMasked || "";
  form.secretKey = secretKeyMasked.value;
  form.models = data.models || "qwen-plus";
  form.textModels = data.textModels || "";
  form.visionModels = data.visionModels || "";
  form.imageGenerationModels = data.imageGenerationModels || "";
  form.videoGenerationModels = data.videoGenerationModels || "";
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
      >
        <template #field-platformType
          ><span>{{ platformLabel }}</span></template
        >
      </Form>
    </div>
  </Dialog>
</template>
