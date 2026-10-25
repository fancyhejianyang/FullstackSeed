<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Dialog from "@/components/Dialog.vue";
import Button from "@/components/Button.vue";
import {
  getModelEndpoint,
  type ModelEndpoint,
  type ModelEndpointOptions,
} from "@/api/modelEndpoint";
import { modelPlatformLabels } from "@/utils/modelPlatform";
import { formatDateTime } from "@/utils/format";
const props = defineProps<{
  row?: ModelEndpoint | null;
  options: ModelEndpointOptions;
}>();
const visible = defineModel<boolean>("visible", { required: true });
const detail = ref<ModelEndpoint | null>(null);
const loading = ref(false);
const items = computed(() =>
  detail.value
    ? [
        ["平台", modelPlatformLabels[detail.value.platformType]],
        ["模型编码", detail.value.modelCode],
        ["模型名称", detail.value.modelName],
        [
          "功能场景",
          props.options.functions.find(
            (item) => item.value === detail.value?.functionType,
          )?.label ?? detail.value.functionType,
        ],
        [
          "调用协议",
          props.options.protocols.find(
            (item) => item.value === detail.value?.protocol,
          )?.label ?? detail.value.protocol,
        ],
        [
          "执行方式",
          detail.value.executionMode === "async" ? "异步任务" : "同步返回",
        ],
        ["调用路径", "POST " + detail.value.apiPath],
        ...(detail.value.executionMode === "async"
          ? [["查询路径", "GET " + detail.value.taskApiPath]]
          : []),
        ["状态", detail.value.isActive ? "启用" : "停用"],
        ["更新时间", formatDateTime(detail.value.updatedAt)],
      ]
    : [],
);
let version = 0;
watch(visible, async (value) => {
  const current = ++version;
  detail.value = null;
  if (!value || !props.row) return;
  loading.value = true;
  try {
    const result = await getModelEndpoint(props.row.id);
    if (version === current) detail.value = result;
  } finally {
    if (version === current) loading.value = false;
  }
});
</script>
<template>
  <Dialog
    v-model="visible"
    title="模型调用接口"
    width="760px"
    :show-footer="false"
  >
    <div v-loading="loading">
      <el-descriptions :column="1" border>
        <el-descriptions-item
          v-for="item in items"
          :key="item[0]"
          :label="item[0]"
          ><span class="endpoint-view__value">{{
            item[1]
          }}</span></el-descriptions-item
        >
      </el-descriptions>
    </div>
    <template #footer><Button @click="visible = false">关闭</Button></template>
  </Dialog>
</template>
<style scoped>
.endpoint-view__value {
  overflow-wrap: anywhere;
}
</style>
