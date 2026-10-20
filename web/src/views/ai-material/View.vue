<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Dialog from "@/components/Dialog.vue";
import Button from "@/components/Button.vue";
import { formatDateTime } from "@/utils/format";
import {
  getAiMaterial,
  type AiMaterial,
  type AiMaterialSummary,
} from "@/api/aiMaterial";

const props = defineProps<{ row?: AiMaterialSummary | null }>();
const visible = defineModel<boolean>("visible", { required: true });
const loading = ref(false);
const detail = ref<AiMaterial | null>(null);
const styleLabels: Record<string, string> = {
  original: "原始描述",
  photorealistic: "写实摄影",
  watercolor: "水彩",
  flatIllustration: "扁平插画",
  cinematic: "电影质感",
  custom: "自定义风格",
};
const statusLabels: Record<string, string> = {
  idle: "待生成",
  pending: "排队中",
  running: "生成中",
  storing: "保存中",
  succeeded: "生成完成",
  failed: "失败",
  interrupted: "已中断",
};
const modeLabels: Record<string, string> = {
  textToImage: "文生图",
  imageToImage: "图生图",
  textToVideo: "文生视频",
  imageToVideo: "图生视频",
};
const statusType = computed(() =>
  detail.value?.generationStatus === "succeeded"
    ? "success"
    : ["failed", "interrupted"].includes(detail.value?.generationStatus ?? "")
      ? "danger"
      : "info",
);

watch(visible, async (value) => {
  if (!value) {
    detail.value = null;
    return;
  }
  if (!props.row?.id) return;
  loading.value = true;
  try {
    detail.value = await getAiMaterial(props.row.id);
  } finally {
    loading.value = false;
  }
});

function download() {
  if (!detail.value?.currentMediaUrl) return;
  const link = document.createElement("a");
  link.href = detail.value.currentMediaUrl;
  link.download = `ai-material-${detail.value.id}.${detail.value.currentMediaType === "video" ? "mp4" : "png"}`;
  link.target = "_blank";
  link.rel = "noopener";
  link.click();
}
</script>

<template>
  <Dialog v-model="visible" title="查看素材" width="820px" :show-footer="false">
    <div v-loading="loading">
      <div v-if="detail" class="material-view">
        <el-image
          v-if="detail.currentMediaUrl && detail.currentMediaType !== 'video'"
          class="material-view__image"
          :src="detail.currentMediaUrl"
          :preview-src-list="[detail.currentMediaUrl]"
          fit="contain"
        />
        <video
          v-else-if="detail.currentMediaUrl"
          class="material-view__video"
          :src="detail.currentMediaUrl"
          controls
          preload="metadata"
        />
        <el-empty v-else description="尚未生成素材" :image-size="90" />
        <el-descriptions :column="1" border>
          <el-descriptions-item label="状态">
            <el-tag :type="statusType">{{
              statusLabels[detail.generationStatus]
            }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="生成模式">
            {{ modeLabels[detail.generationMode] || detail.generationMode }}
          </el-descriptions-item>
          <el-descriptions-item
            v-if="
              ['imageToImage', 'imageToVideo'].includes(detail.generationMode)
            "
            label="参考图片"
          >
            <el-image
              v-if="detail.referenceImageUrl"
              class="material-view__reference"
              :src="detail.referenceImageUrl"
              :preview-src-list="[detail.referenceImageUrl]"
              fit="cover"
              preview-teleported
            />
            <span v-else>参考图片不可用</span>
          </el-descriptions-item>
          <el-descriptions-item
            v-if="detail.mediaType === 'video'"
            label="视频参数"
          >
            {{ detail.videoResolution }} · {{ detail.videoRatio }} ·
            {{ detail.videoDuration }} 秒
          </el-descriptions-item>
          <el-descriptions-item label="提示词">
            <div class="material-view__text">{{ detail.prompt }}</div>
          </el-descriptions-item>
          <el-descriptions-item label="风格">
            {{ styleLabels[detail.styleKey] || detail.styleKey }}
            <span v-if="detail.customStyle">：{{ detail.customStyle }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="生成配置">
            {{ detail.aiConfigName }} · {{ detail.aiModel }}
          </el-descriptions-item>
          <el-descriptions-item v-if="detail.generationError" label="失败原因">
            {{ detail.generationError }}
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">
            {{ formatDateTime(detail.updatedAt) }}
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </div>
    <template #footer>
      <Button v-if="detail?.currentMediaUrl" icon="Download" @click="download"
        >下载</Button
      >
      <Button @click="visible = false">关闭</Button>
    </template>
  </Dialog>
</template>

<style scoped>
.material-view {
  display: grid;
  gap: 16px;
}
.material-view__image {
  width: 100%;
  height: min(52vh, 440px);
  border-radius: 8px;
  background: #f5f7fa;
}
.material-view__video {
  width: 100%;
  max-height: min(58vh, 520px);
  border-radius: 8px;
  background: #111827;
}
.material-view__text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.65;
}
.material-view__reference {
  width: 80px;
  height: 80px;
  border-radius: 6px;
  background: #f5f7fa;
}
</style>
