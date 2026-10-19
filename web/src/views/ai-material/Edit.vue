<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { ElMessage, type FormRules } from "element-plus";
import Dialog from "@/components/Dialog.vue";
import Form, { type FormField } from "@/components/Form.vue";
import {
  createAiMaterial,
  getAiMaterial,
  getAiMaterialConfigOptions,
  updateAiMaterial,
  type AiMaterialForm,
  type AiMaterialSummary,
} from "@/api/aiMaterial";

const props = defineProps<{ row?: AiMaterialSummary | null }>();
const emit = defineEmits<{ success: [] }>();
const visible = defineModel<boolean>("visible", { required: true });
const loading = ref(false);
const submitting = ref(false);
const formRef = ref<InstanceType<typeof Form>>();
const configOptions = ref<Array<{ label: string; value: number }>>([]);
const form = reactive<AiMaterialForm>({
  prompt: "",
  styleKey: "original",
  customStyle: "",
  aiConfigId: "",
});

const styleOptions = [
  { label: "原始描述", value: "original" },
  { label: "写实摄影", value: "photorealistic" },
  { label: "水彩", value: "watercolor" },
  { label: "扁平插画", value: "flatIllustration" },
  { label: "电影质感", value: "cinematic" },
  { label: "自定义风格", value: "custom" },
];
const fields = computed<FormField[]>(() => [
  {
    prop: "prompt",
    label: "提示词",
    type: "textarea",
    rows: 7,
    placeholder: "描述主体、场景、构图和希望表达的画面",
    hint: "不会额外调用文本模型润色；实际请求由默认画面要求、提示词和风格组合。",
  },
  {
    prop: "styleKey",
    label: "风格",
    type: "select",
    options: styleOptions,
  },
  ...(form.styleKey === "custom"
    ? [
        {
          prop: "customStyle",
          label: "自定义风格",
          type: "textarea" as const,
          rows: 3,
          placeholder: "描述材质、色调、光影或艺术表现方式",
        },
      ]
    : []),
  {
    prop: "aiConfigId",
    label: "生图配置",
    type: "select",
    options: configOptions.value,
    hint: configOptions.value.length
      ? "生成时仅调用所选配置绑定的图片模型。"
      : "暂无启用的图片生成配置，请先到 AI 功能配置中创建。",
  },
]);
const rules = computed<FormRules>(() => ({
  prompt: [{ required: true, message: "请输入提示词", trigger: "blur" }],
  styleKey: [{ required: true, message: "请选择风格", trigger: "change" }],
  aiConfigId: [
    { required: true, message: "请选择图片生成配置", trigger: "change" },
  ],
  ...(form.styleKey === "custom"
    ? {
        customStyle: [
          { required: true, message: "请输入自定义风格", trigger: "blur" },
        ],
      }
    : {}),
}));

watch(visible, async (value) => {
  if (!value) return;
  loading.value = true;
  try {
    const options = await getAiMaterialConfigOptions();
    configOptions.value = options.list.map((item) => ({
      label: `${item.name} · ${item.model}`,
      value: item.id,
    }));
    if (props.row?.id) {
      const detail = await getAiMaterial(props.row.id);
      form.prompt = detail.prompt;
      form.styleKey = detail.styleKey;
      form.customStyle = detail.customStyle ?? "";
      form.aiConfigId = detail.aiConfigId;
    } else {
      form.prompt = "";
      form.styleKey = "original";
      form.customStyle = "";
      form.aiConfigId = configOptions.value[0]?.value ?? "";
    }
  } finally {
    loading.value = false;
  }
});

async function submit() {
  await formRef.value?.validate();
  submitting.value = true;
  try {
    const payload: AiMaterialForm = {
      prompt: form.prompt.trim(),
      styleKey: form.styleKey,
      customStyle: form.styleKey === "custom" ? form.customStyle?.trim() : null,
      aiConfigId: Number(form.aiConfigId),
    };
    if (props.row?.id) {
      await updateAiMaterial(props.row.id, payload);
      ElMessage.success("素材设置已保存");
    } else {
      await createAiMaterial(payload);
      ElMessage.success("素材已创建，可在列表发起生成");
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
    :title="props.row ? '编辑素材' : '新增素材'"
    width="760px"
    :confirm-loading="submitting"
    @confirm="submit"
  >
    <div v-loading="loading">
      <Form ref="formRef" v-model="form" :fields="fields" :rules="rules" />
    </div>
  </Dialog>
</template>
