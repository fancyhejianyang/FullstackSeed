<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { isAxiosError } from "axios";
import { ElMessage, type FormRules } from "element-plus";
import Dialog from "@/components/Dialog.vue";
import Form, { type FormField } from "@/components/Form.vue";
import Button from "@/components/Button.vue";
import {
  getModelEndpointTestOptions,
  queryModelEndpointTest,
  testModelEndpoint,
  type ModelEndpoint,
  type ModelEndpointTestOptions,
  type ModelEndpointTestResult,
} from "@/api/modelEndpoint";
import { getPermissionActionColor } from "@/utils/permission";

const props = defineProps<{ row: ModelEndpoint | null }>();
const visible = defineModel<boolean>("visible", { required: true });
const formRef = ref<InstanceType<typeof Form>>();
const loading = ref(false);
const submitting = ref(false);
const querying = ref(false);
const errorMessage = ref("");
const options = ref<ModelEndpointTestOptions | null>(null);
const result = ref<ModelEndpointTestResult | null>(null);
const requestId = ref("");
const testedAccountName = ref("");
let lastNotifiedResult = "";
const form = reactive({ providerId: "" as number | "", requestBody: "" });
let session = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const pending = computed(
  () =>
    submitting.value ||
    result.value?.status === "running" ||
    result.value?.status === "accepted",
);
const fields = computed<FormField[]>(() => [
  {
    prop: "providerId",
    label: "测试账号",
    type: "select",
    options: (options.value?.accounts ?? []).map((item) => ({
      label: item.name,
      value: item.id,
    })),
    componentProps: { disabled: pending.value },
    hint: "只显示同平台、已启用且已登记当前模型的账号；未显示时请先补充账号对应模型目录和密钥。",
  },
  {
    prop: "requestBody",
    label: "请求参数",
    type: "textarea",
    rows: 14,
    componentProps: { disabled: pending.value },
    hint: "可修改测试内容和参数。参考图片/首尾帧场景须替换 REPLACE_WITH_ 占位符；模型编码以当前卡片为准。",
  },
]);
const rules: FormRules = {
  providerId: [
    { required: true, message: "请选择测试账号", trigger: "change" },
  ],
  requestBody: [
    { required: true, message: "请输入请求参数 JSON", trigger: "blur" },
  ],
};
const statusLabels = {
  running: "调用中",
  accepted: "已受理，生成中",
  succeeded: "测试成功",
  failed: "测试失败",
  unknown: "结果待核实",
};
const statusColor = computed(() =>
  getPermissionActionColor(
    result.value?.status === "succeeded"
      ? "create"
      : result.value?.status === "failed"
        ? "delete"
        : "read",
  ),
);

function message(error: unknown) {
  const value: unknown = isAxiosError(error)
    ? error.response?.data?.message
    : error instanceof Error
      ? error.message
      : null;
  return typeof value === "string" ? value : "读取失败，请稍后重试。";
}
function stopPolling() {
  if (timer) clearTimeout(timer);
  timer = undefined;
}
function notifyResult(data: ModelEndpointTestResult, explicit = false) {
  const key = `${data.requestId}:${data.status}:${data.message}`;
  if (
    !explicit &&
    (["running", "accepted"].includes(data.status) ||
      key === lastNotifiedResult)
  )
    return;
  lastNotifiedResult = key;
  const text = `${options.value?.card.modelCode ?? props.row?.modelCode ?? "模型"}：${statusLabels[data.status]}。${data.message}`;
  if (data.status === "succeeded") ElMessage.success(text);
  else if (data.status === "failed") ElMessage.error(text);
  else if (data.status === "unknown") ElMessage.warning(text);
  else ElMessage.info(text);
}
function schedulePoll(current: number, notifyTimeout = true) {
  stopPolling();
  if (
    current !== session ||
    !visible.value ||
    !result.value ||
    !["running", "accepted"].includes(result.value.status)
  )
    return;
  if (result.value.elapsedMilliseconds > 15 * 60000) {
    result.value = {
      ...result.value,
      status: "unknown",
      message: "已停止自动查询，供应商可能仍在生成；可继续手动查询原任务。",
    };
    if (notifyTimeout) notifyResult(result.value);
    return;
  }
  timer = setTimeout(() => {
    void refreshResult();
  }, 3000);
}
watch(
  visible,
  async (value) => {
    const current = ++session;
    stopPolling();
    loading.value = false;
    submitting.value = false;
    querying.value = false;
    if (!value || !props.row) return;
    options.value = null;
    result.value = null;
    errorMessage.value = "";
    requestId.value = "";
    form.providerId = "";
    form.requestBody = "";
    loading.value = true;
    try {
      const data = await getModelEndpointTestOptions(props.row.id);
      if (current !== session) return;
      options.value = data;
      const previous = data.recentTest;
      testedAccountName.value = previous
        ? (data.accounts.find((item) => item.id === previous.providerId)
            ?.name ?? `账号 ${previous.providerId}`)
        : "";
      form.providerId =
        previous &&
        data.accounts.some((item) => item.id === previous.providerId)
          ? previous.providerId
          : data.accounts.length === 1
            ? data.accounts[0]!.id
            : "";
      form.requestBody = JSON.stringify(data.requestBody, null, 2);
      result.value = previous?.result ?? null;
      lastNotifiedResult = previous
        ? `${previous.result.requestId}:${previous.result.status}:${previous.result.message}`
        : "";
      requestId.value = previous?.result.requestId ?? "";
      schedulePoll(current, false);
    } catch (error) {
      if (current === session) errorMessage.value = message(error);
    } finally {
      if (current === session) loading.value = false;
    }
  },
  { flush: "sync" },
);
onBeforeUnmount(() => {
  session += 1;
  stopPolling();
});

async function startTest() {
  if (!props.row || pending.value || loading.value || querying.value) return;
  await formRef.value?.validate();
  let requestBody: unknown;
  try {
    requestBody = JSON.parse(form.requestBody);
    if (
      !requestBody ||
      typeof requestBody !== "object" ||
      Array.isArray(requestBody)
    )
      throw new Error("请求参数必须是 JSON 对象");
    if (form.requestBody.includes("REPLACE_WITH_"))
      throw new Error("请先替换参考图片地址占位符");
  } catch (error) {
    ElMessage.warning(
      error instanceof SyntaxError ? "请求参数不是有效 JSON" : message(error),
    );
    return;
  }
  const current = session;
  stopPolling();
  errorMessage.value = "";
  requestId.value = crypto.randomUUID();
  testedAccountName.value =
    options.value?.accounts.find((item) => item.id === form.providerId)?.name ??
    "";
  result.value = null;
  submitting.value = true;
  try {
    const data = await testModelEndpoint(props.row.id, {
      providerId: Number(form.providerId),
      requestId: requestId.value,
      requestBody: requestBody as Record<string, unknown>,
    });
    if (current !== session) return;
    result.value = data;
    notifyResult(data, true);
    schedulePoll(current);
  } catch (error) {
    if (current === session) {
      errorMessage.value = `${message(error)} 若请求已被供应商受理，可能已计费；请先查询本次结果。`;
      if (!(isAxiosError(error) && error.response?.status === 401))
        ElMessage.warning(errorMessage.value);
    }
  } finally {
    if (current === session) submitting.value = false;
  }
}
async function refreshResult(explicit = false) {
  if (!props.row || !requestId.value || querying.value || submitting.value)
    return;
  const current = session;
  querying.value = true;
  errorMessage.value = "";
  try {
    const data = await queryModelEndpointTest(props.row.id, requestId.value);
    if (current !== session) return;
    result.value = data;
    notifyResult(data, explicit);
    schedulePoll(current);
  } catch (error) {
    if (current === session) {
      errorMessage.value = message(error);
      if (result.value)
        result.value = {
          ...result.value,
          status: "unknown",
          message: "本次查询未完成，可继续查询原任务；请先核实结果再重新测试。",
        };
      if (!(isAxiosError(error) && error.response?.status === 401))
        ElMessage.warning(errorMessage.value);
      stopPolling();
    }
  } finally {
    if (current === session) querying.value = false;
  }
}
</script>

<template>
  <Dialog
    v-model="visible"
    :title="`接口测试 · ${options?.card.modelName ?? row?.modelName ?? ''}`"
    width="920px"
    :show-footer="false"
  >
    <div v-loading="loading" class="endpoint-test">
      <el-alert
        title="点击开始测试会真实调用模型，可能产生费用。异步任务只提交一次；关闭弹窗不取消供应商任务。临时测试记录保留 30 分钟，服务重启会清空。"
        type="warning"
        :closable="false"
      />
      <div v-if="options" class="endpoint-test__path">
        POST {{ options.card.apiPath }}
      </div>
      <Form
        ref="formRef"
        v-model="form"
        :fields="fields"
        :rules="rules"
        label-width="90px"
      />
      <el-alert
        v-if="options && !options.card.isActive"
        title="当前接口已停用，请先启用后再测试。"
        type="warning"
        :closable="false"
      />
      <el-alert
        v-if="errorMessage"
        :title="errorMessage"
        type="error"
        :closable="false"
      />
      <section v-if="result" class="endpoint-test__result" aria-live="polite">
        <el-tag :type="statusColor">{{ statusLabels[result.status] }}</el-tag>
        <p>{{ result.message }}</p>
        <div>测试账号：{{ testedAccountName }}</div>
        <div>
          HTTP：{{ result.httpStatus ?? "暂无响应" }} · 耗时：{{
            (result.elapsedMilliseconds / 1000).toFixed(2)
          }}
          秒
        </div>
        <div v-if="result.taskId">任务编号：{{ result.taskId }}</div>
        <div>检查时间：{{ new Date(result.checkedAt).toLocaleString() }}</div>
        <pre v-if="result.responseBody">{{ result.responseBody }}</pre>
      </section>
    </div>
    <template #footer>
      <Button :confirm="false" @click="visible = false">关闭</Button>
      <Button
        v-if="requestId"
        perm="ModelEndpoint.update"
        :confirm="false"
        :loading="querying"
        :disabled="loading || submitting"
        @click="refreshResult(true)"
        >查询本次结果</Button
      >
      <Button
        perm="ModelEndpoint.update"
        type="primary"
        icon="Connection"
        :confirm="false"
        :loading="submitting"
        :disabled="
          loading ||
          pending ||
          querying ||
          !options?.card.isActive ||
          !form.providerId
        "
        @click="startTest"
        >{{
          requestId ? "重新测试（可能计费）" : "开始测试（可能计费）"
        }}</Button
      >
    </template>
  </Dialog>
</template>

<style scoped lang="scss">
.endpoint-test__path {
  margin: 16px 0;
  overflow-wrap: anywhere;
  color: var(--el-text-color-secondary);
}
.endpoint-test__result {
  margin-top: 20px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.endpoint-test__result pre {
  max-height: 340px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  padding: 14px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-size: 12px;
}
</style>
