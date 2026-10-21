<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { ElMessage, type FormRules } from "element-plus";
import Dialog from "@/components/Dialog.vue";
import Form, { type FormField } from "@/components/Form.vue";
import UploadImage from "@/components/UploadImage.vue";
import Button from "@/components/Button.vue";
import type { UploadResult } from "@/api/upload";
import {
  createAiMaterial,
  getAiMaterial,
  getAiMaterialConfigOptions,
  updateAiMaterial,
  type AiMaterialForm,
  type AiMaterialConfigOption,
  type AiMaterialReferenceMediaType,
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
  referenceMedia: [],
  videoResolution: "720P",
  videoRatio: "adaptive",
  videoDuration: 5,
});

const isVideoMode = computed(() =>
  ["textToVideo", "imageToVideo", "referenceToVideo"].includes(
    form.generationMode,
  ),
);
const needsReference = computed(() =>
  ["imageToImage", "imageToVideo"].includes(form.generationMode),
);
const needsReferenceMedia = computed(
  () => form.generationMode === "referenceToVideo",
);

const styleOptions = [
  { label: "原始描述", value: "original" },
  { label: "写实摄影", value: "photorealistic" },
  { label: "水彩", value: "watercolor" },
  { label: "扁平插画", value: "flatIllustration" },
  { label: "电影质感", value: "cinematic" },
  { label: "自定义风格", value: "custom" },
];
const availableConfigs = computed(() =>
  configs.value.filter((item) =>
    isVideoMode.value
      ? item.featureType === "videoGeneration"
      : item.featureType === "imageGeneration",
  ),
);
const configOptions = computed(() =>
  availableConfigs.value.map((item) => ({
    label: `${item.name} · ${item.model}`,
    value: item.id,
    disabled:
      (form.generationMode === "imageToImage" && !item.supportsImageToImage) ||
      (["imageToVideo", "referenceToVideo"].includes(form.generationMode) &&
        !item.supportsImageToVideo),
  })),
);
const fields = computed<FormField[]>(() => [
  {
    prop: "generationMode",
    label: "生成模式",
    slot: true,
    hint: needsReference.value
      ? "参考图作为图像生成依据或视频首帧，与提示词一并提交给所选模型。"
      : needsReferenceMedia.value
        ? "按顺序提交多张参考图或参考视频；提示词可用“图1、视频1”等序号引用素材。"
        : isVideoMode.value
          ? "根据提示词与风格异步生成视频，系统会在后台查询进度并保存 MP4。"
          : "仅根据提示词与风格生成新图片。",
  },
  ...(needsReference.value
    ? [
        {
          prop: "referenceImageUrl",
          label: "参考图片",
          slot: true,
        },
      ]
    : []),
  ...(needsReferenceMedia.value
    ? [
        {
          prop: "referenceMedia",
          label: "参考素材",
          slot: true,
          hint: "仅接收供应商能够访问的公开 HTTPS 地址；参考图片最多 10 个、参考视频最多 5 个且视频总时长不超过 15 秒，顺序会原样提交。",
        },
      ]
    : []),
  {
    prop: "prompt",
    label: "提示词",
    type: "textarea",
    rows: 7,
    placeholder: "描述主体、场景、构图和希望表达的画面",
    componentProps: {
      maxlength: isVideoMode.value ? 20000 : 4000,
      showWordLimit: true,
    },
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
  ...(isVideoMode.value
    ? [
        {
          prop: "videoResolution",
          label: "视频清晰度",
          type: "select" as const,
          options: ["480P", "720P", "1080P"].map((value) => ({
            label: value,
            value,
          })),
        },
        {
          prop: "videoRatio",
          label: "画面比例",
          type: "select" as const,
          options: [
            "adaptive",
            "21:9",
            "16:9",
            "9:16",
            "1:1",
            "4:3",
            "3:4",
          ].map((value) => ({
            label: value === "adaptive" ? "自适应" : value,
            value,
          })),
          hint:
            form.generationMode === "imageToVideo"
              ? "首帧生视频建议选择自适应，使输出比例跟随参考图。"
              : "支持自适应及常用横屏、竖屏比例。",
        },
        {
          prop: "videoDuration",
          label: "视频时长",
          type: "select" as const,
          options: [
            { label: "智能时长（默认约 5 秒）", value: -1 },
            ...Array.from({ length: 29 }, (_, index) => {
              const seconds = index + 2;
              return { label: `${seconds} 秒`, value: seconds };
            }),
          ],
          hint: "Wan 3.0 支持智能时长或 2～30 秒；其它模型仍以供应商实际能力为准。",
        },
      ]
    : []),
  {
    prop: "aiConfigId",
    label: isVideoMode.value ? "视频配置" : "生图配置",
    type: "select",
    options: configOptions.value,
    hint: availableConfigs.value.length
      ? needsReference.value
        ? "不支持当前参考图模式的配置已禁用；生成时不会自动降级。"
        : needsReferenceMedia.value
          ? "多参考生视频使用视频配置的参考素材能力；生成时不会自动降级。"
          : `生成时仅调用所选配置绑定的${isVideoMode.value ? "视频" : "图片"}模型。`
      : `暂无启用的${isVideoMode.value ? "视频" : "图片"}生成配置，请先到 AI 功能配置中创建。`,
  },
]);
const rules = computed<FormRules>(() => ({
  prompt: [{ required: true, message: "请输入提示词", trigger: "blur" }],
  generationMode: [
    { required: true, message: "请选择生成模式", trigger: "change" },
  ],
  ...(needsReference.value
    ? {
        referenceImageUrl: [
          { required: true, message: "请上传参考图片", trigger: "change" },
        ],
      }
    : {}),
  ...(needsReferenceMedia.value
    ? {
        referenceMedia: [
          {
            required: true,
            type: "array",
            min: 1,
            message: "请至少添加一个参考素材",
            trigger: "change",
          },
        ],
      }
    : {}),
  styleKey: [{ required: true, message: "请选择风格", trigger: "change" }],
  aiConfigId: [
    { required: true, message: "请选择生成配置", trigger: "change" },
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
      form.referenceMedia = (detail.referenceMedia ?? []).map((item) => ({
        ...item,
      }));
      form.videoResolution = detail.videoResolution;
      form.videoRatio = detail.videoRatio;
      form.videoDuration = detail.videoDuration;
    } else {
      form.prompt = "";
      form.generationMode = "textToImage";
      form.styleKey = "original";
      form.customStyle = "";
      form.aiConfigId =
        configs.value.find((item) => item.featureType === "imageGeneration")
          ?.id ?? "";
      form.referenceImageUrl = "";
      form.referenceMedia = [];
      form.videoResolution = "720P";
      form.videoRatio = "adaptive";
      form.videoDuration = 5;
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
    const supportsMode =
      selected &&
      selected.featureType ===
        (isVideoMode.value ? "videoGeneration" : "imageGeneration") &&
      (mode !== "imageToImage" || selected.supportsImageToImage) &&
      (!["imageToVideo", "referenceToVideo"].includes(mode) ||
        selected.supportsImageToVideo);
    if (!supportsMode) {
      form.aiConfigId =
        availableConfigs.value.find(
          (item) =>
            (mode !== "imageToImage" || item.supportsImageToImage) &&
            (!["imageToVideo", "referenceToVideo"].includes(mode) ||
              item.supportsImageToVideo),
        )?.id ?? "";
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

function addReferenceMedia(type: AiMaterialReferenceMediaType) {
  const media = form.referenceMedia ?? (form.referenceMedia = []);
  const typeCount = media.filter((item) => item.type === type).length;
  const limit = type === "reference_image" ? 10 : 5;
  if (typeCount >= limit) {
    ElMessage.warning(
      `参考${type === "reference_image" ? "图片" : "视频"}最多 ${limit} 个`,
    );
    return;
  }
  media.push({ type, url: "" });
}

function removeReferenceMedia(index: number) {
  form.referenceMedia?.splice(index, 1);
}

function validateReferenceMedia() {
  if (!needsReferenceMedia.value) return true;
  const media = form.referenceMedia ?? [];
  if (!media.length) {
    ElMessage.error("请至少添加一个参考素材");
    return false;
  }
  if (media.filter((item) => item.type === "reference_image").length > 10) {
    ElMessage.error("参考图片最多 10 个");
    return false;
  }
  if (media.filter((item) => item.type === "reference_video").length > 5) {
    ElMessage.error("参考视频最多 5 个");
    return false;
  }
  for (const [index, item] of media.entries()) {
    try {
      const url = new URL(item.url.trim());
      if (url.protocol !== "https:" || url.username || url.password) {
        throw new Error("invalid url");
      }
    } catch {
      ElMessage.error(`第 ${index + 1} 个参考素材必须是公开 HTTPS 地址`);
      return false;
    }
  }
  return true;
}

async function submit() {
  await formRef.value?.validate();
  if (!validateReferenceMedia()) return;
  if (
    (needsReference.value || needsReferenceMedia.value) &&
    !configs.value.find(
      (item) =>
        item.id === Number(form.aiConfigId) &&
        (form.generationMode !== "imageToImage" || item.supportsImageToImage) &&
        (!["imageToVideo", "referenceToVideo"].includes(form.generationMode) ||
          item.supportsImageToVideo),
    )
  ) {
    ElMessage.error("请选择已启用当前参考素材能力的生成配置");
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
      referenceImageFile: needsReference.value
        ? referenceImageFile.value
        : null,
      referenceMedia: needsReferenceMedia.value
        ? (form.referenceMedia ?? []).map((item) => ({
            type: item.type,
            url: item.url.trim(),
          }))
        : null,
      videoResolution: form.videoResolution,
      videoRatio: form.videoRatio,
      videoDuration: form.videoDuration,
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
            <el-radio value="textToVideo">文生视频</el-radio>
            <el-radio value="imageToVideo">首帧生视频</el-radio>
            <el-radio value="referenceToVideo">多参考生视频</el-radio>
          </el-radio-group>
        </template>
        <template #field-referenceImageUrl>
          <UploadImage
            v-model="form.referenceImageUrl"
            accept=".png,.jpg,.jpeg,.webp"
            :max-size-mb="isVideoMode ? 20 : 5"
            :upload-request="selectReferenceImage"
            @remove="clearReferenceImage"
          />
        </template>
        <template #field-referenceMedia>
          <div class="reference-media-editor">
            <div
              v-for="(item, index) in form.referenceMedia || []"
              :key="index"
              class="reference-media-editor__row"
            >
              <el-select
                v-model="item.type"
                class="reference-media-editor__type"
              >
                <el-option label="参考图片" value="reference_image" />
                <el-option label="参考视频" value="reference_video" />
              </el-select>
              <el-input
                v-model="item.url"
                placeholder="https://..."
                clearable
              />
              <Button
                icon="Delete"
                :auto-icon="false"
                title="移除参考素材"
                @click="removeReferenceMedia(index)"
              />
            </div>
            <div class="reference-media-editor__actions">
              <Button icon="Plus" @click="addReferenceMedia('reference_image')">
                添加参考图
              </Button>
              <Button icon="Plus" @click="addReferenceMedia('reference_video')">
                添加参考视频
              </Button>
            </div>
          </div>
        </template>
      </Form>
    </div>
  </Dialog>
</template>

<style scoped>
.reference-media-editor {
  display: grid;
  gap: 10px;
  width: 100%;
}

.reference-media-editor__row {
  display: grid;
  grid-template-columns: 118px minmax(0, 1fr) auto;
  gap: 8px;
}

.reference-media-editor__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 640px) {
  .reference-media-editor__row {
    grid-template-columns: 1fr auto;
  }

  .reference-media-editor__type {
    grid-column: 1 / -1;
  }
}
</style>
