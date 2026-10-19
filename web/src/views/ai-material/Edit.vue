<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { ElMessage, type FormRules } from "element-plus";
import Dialog from "@/components/Dialog.vue";
import Form, { type FormField } from "@/components/Form.vue";
import UploadImage from "@/components/UploadImage.vue";
import type { UploadResult } from "@/api/upload";
import {
  createAiMaterial,
  getAiMaterial,
  getAiMaterialConfigOptions,
  updateAiMaterial,
  type AiMaterialForm,
  type AiMaterialConfigOption,
  type AiMaterialSummary,
} from "@/api/aiMaterial";

const props = defineProps<{ row?: AiMaterialSummary | null }>();
const emit = defineEmits<{ success: [] }>();
const visible = defineModel<boolean>("visible", { required: true });
const loading = ref(false);
const submitting = ref(false);
const formRef = ref<InstanceType<typeof Form>>();
const configs = ref<AiMaterialConfigOption[]>([]);
const referenceImageFile = ref<File | null>(null);
let referenceObjectUrl = "";
const form = reactive<AiMaterialForm>({
  prompt: "",
  generationMode: "textToImage",
  styleKey: "original",
  customStyle: "",
  aiConfigId: "",
  referenceImageUrl: "",
  referenceImageFile: null,
});

const styleOptions = [
  { label: "原始描述", value: "original" },
  { label: "写实摄影", value: "photorealistic" },
  { label: "水彩", value: "watercolor" },
  { label: "扁平插画", value: "flatIllustration" },
  { label: "电影质感", value: "cinematic" },
  { label: "自定义风格", value: "custom" },
];
const configOptions = computed(() =>
  configs.value.map((item) => ({
    label: `${item.name} · ${item.model}`,
    value: item.id,
    disabled:
      form.generationMode === "imageToImage" && !item.supportsImageToImage,
  })),
);
const fields = computed<FormField[]>(() => [
  {
    prop: "generationMode",
    label: "生成模式",
    slot: true,
    hint:
      form.generationMode === "imageToImage"
        ? "参考图与提示词会同时交给所选模型；当前仅支持已启用该能力的 DashScope 生图配置。"
        : "仅根据提示词与风格生成新图片。",
  },
  ...(form.generationMode === "imageToImage"
    ? [
        {
          prop: "referenceImageUrl",
          label: "参考图片",
          slot: true,
        },
      ]
    : []),
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
    hint: configs.value.length
      ? form.generationMode === "imageToImage"
        ? "不支持图生图的配置已禁用；生成时不会自动降级为文生图。"
        : "生成时仅调用所选配置绑定的图片模型。"
      : "暂无启用的图片生成配置，请先到 AI 功能配置中创建。",
  },
]);
const rules = computed<FormRules>(() => ({
  prompt: [{ required: true, message: "请输入提示词", trigger: "blur" }],
  generationMode: [
    { required: true, message: "请选择生成模式", trigger: "change" },
  ],
  ...(form.generationMode === "imageToImage"
    ? {
        referenceImageUrl: [
          { required: true, message: "请上传参考图片", trigger: "change" },
        ],
      }
    : {}),
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
  if (!value) {
    releaseReferenceObjectUrl();
    referenceImageFile.value = null;
    return;
  }
  loading.value = true;
  try {
    const options = await getAiMaterialConfigOptions();
    configs.value = options.list;
    if (props.row?.id) {
      const detail = await getAiMaterial(props.row.id);
      form.prompt = detail.prompt;
      form.generationMode = detail.generationMode;
      form.styleKey = detail.styleKey;
      form.customStyle = detail.customStyle ?? "";
      form.aiConfigId = detail.aiConfigId;
      form.referenceImageUrl = detail.referenceImageUrl ?? "";
    } else {
      form.prompt = "";
      form.generationMode = "textToImage";
      form.styleKey = "original";
      form.customStyle = "";
      form.aiConfigId = configs.value[0]?.id ?? "";
      form.referenceImageUrl = "";
    }
    referenceImageFile.value = null;
  } finally {
    loading.value = false;
  }
});

watch(
  () => form.generationMode,
  (mode) => {
    const selected = configs.value.find(
      (item) => item.id === Number(form.aiConfigId),
    );
    if (mode === "imageToImage" && !selected?.supportsImageToImage) {
      form.aiConfigId =
        configs.value.find((item) => item.supportsImageToImage)?.id ?? "";
    } else if (!form.aiConfigId) {
      form.aiConfigId = configs.value[0]?.id ?? "";
    }
  },
);

async function selectReferenceImage(file: File): Promise<UploadResult> {
  releaseReferenceObjectUrl();
  referenceImageFile.value = file;
  referenceObjectUrl = URL.createObjectURL(file);
  return {
    url: referenceObjectUrl,
    fileName: file.name,
    originalName: file.name,
    mimeType: file.type,
    size: file.size,
  };
}

function clearReferenceImage() {
  referenceImageFile.value = null;
  releaseReferenceObjectUrl();
  form.referenceImageUrl = "";
}

function releaseReferenceObjectUrl() {
  if (!referenceObjectUrl) return;
  URL.revokeObjectURL(referenceObjectUrl);
  referenceObjectUrl = "";
}

onBeforeUnmount(releaseReferenceObjectUrl);

async function submit() {
  await formRef.value?.validate();
  if (
    form.generationMode === "imageToImage" &&
    !configs.value.find(
      (item) =>
        item.id === Number(form.aiConfigId) && item.supportsImageToImage,
    )
  ) {
    ElMessage.error("请选择已启用图生图能力的生图配置");
    return;
  }
  submitting.value = true;
  try {
    const payload: AiMaterialForm = {
      prompt: form.prompt.trim(),
      generationMode: form.generationMode,
      styleKey: form.styleKey,
      customStyle: form.styleKey === "custom" ? form.customStyle?.trim() : null,
      aiConfigId: Number(form.aiConfigId),
      referenceImageFile:
        form.generationMode === "imageToImage"
          ? referenceImageFile.value
          : null,
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
      <Form ref="formRef" v-model="form" :fields="fields" :rules="rules">
        <template #field-generationMode>
          <el-radio-group v-model="form.generationMode">
            <el-radio value="textToImage">文生图</el-radio>
            <el-radio value="imageToImage">图生图</el-radio>
          </el-radio-group>
        </template>
        <template #field-referenceImageUrl>
          <UploadImage
            v-model="form.referenceImageUrl"
            accept=".png,.jpg,.jpeg,.webp"
            :max-size-mb="5"
            :upload-request="selectReferenceImage"
            @remove="clearReferenceImage"
          />
        </template>
      </Form>
    </div>
  </Dialog>
</template>
