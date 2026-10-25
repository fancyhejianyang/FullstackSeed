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
import { removedModelMatchesSelection } from "@/utils/retiredModelOptions";

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
const form = reactive({
  providerId: "" as number | "",
  model: "",
  requestBody: "",
});
const isBuiltin = computed(() => options.value?.card.source === "builtin");
const availableModels = computed(
  () =>
    options.value?.accounts.find((item) => item.id === Number(form.providerId))
      ?.models ?? [],
);
let session = 0;
let optionsSequence = 0;
let synchronizingRemovedOptions = false;
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
    hint: isBuiltin.value
      ? "只显示同平台、已启用且对应目录有可用模型的账号；已配置专用卡片的模型请到专用卡片测试。"
      : options.value?.accountCatalogRequired === false
        ? "此类新能力仅在卡片页调试，账号尚无专用模型目录；按同平台、启用与密钥选择账号，模型是否开通由明确测试核实。"
        : "只显示同平台、已启用且已登记当前模型的账号；未显示时请先补充账号对应模型目录和密钥。",
  },
  ...(isBuiltin.value
    ? [
        {
          prop: "model",
          label: "测试模型",
          type: "select" as const,
          options: availableModels.value.map((item) => ({
            label:
              item.name === item.code
                ? item.code
                : `${item.name}（${item.code}）`,
            value: item.code,
          })),
          componentProps: { disabled: pending.value, clearable: false },
          hint: "从账号对应功能目录选择具体版本；结果仅代表本次账号和模型，不代表整个系列均可用。",
        },
      ]
    : []),
  {
    prop: "requestBody",
    label: "请求参数",
    type: "textarea",
    rows: 14,
    componentProps: { disabled: pending.value },
    hint: `可修改测试内容和原生参数。请按官方文档替换全部 REPLACE_WITH_ 占位符（图片、音视频、模型文件或音色等）；模型编码以${isBuiltin.value ? "所选具体版本" : "当前卡片"}为准。`,
  },
]);
const rules = computed<FormRules>(() => ({
  providerId: [
    { required: true, message: "请选择测试账号", trigger: "change" },
  ],
  requestBody: [
    { required: true, message: "请输入请求参数 JSON", trigger: "blur" },
  ],
  ...(isBuiltin.value
    ? {
        model: [
          { required: true, message: "请选择具体测试模型", trigger: "change" },
        ],
      }
    : {}),
}));
watch(
  () => form.providerId,
  () => {
    optionsSequence += 1;
    if (synchronizingRemovedOptions || !isBuiltin.value) return;
    if (!availableModels.value.some((item) => item.code === form.model))
      form.model = availableModels.value[0]?.code ?? "";
  },
  { flush: "sync" },
);
watch(
  () => form.model,
  (model) => {
    optionsSequence += 1;
    if (!isBuiltin.value || !form.requestBody) return;
    try {
      const body: unknown = JSON.parse(form.requestBody);
      if (body && typeof body === "object" && !Array.isArray(body))
        form.requestBody = JSON.stringify(
          { ...body, model: model || "REPLACE_WITH_MODEL_CODE" },
          null,
          2,
        );
    } catch {
      /* 保留用户正在编辑的 JSON，不自动清空或覆盖。 */
    }
  },
  { flush: "sync" },
);
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
function selectionKey() {
  return JSON.stringify([
    Number(form.providerId),
    isBuiltin.value ? form.model : options.value?.card.modelCode,
  ]);
}
function clearRemovedSelection(data: ModelEndpointTestResult) {
  if (
    !removedModelMatchesSelection(
      data,
      form.providerId,
      isBuiltin.value ? form.model : options.value?.card.modelCode,
    )
  )
    return;
  const account = options.value?.accounts.find(
    (item) => item.id === Number(form.providerId),
  );
  if (
    account &&
    (!isBuiltin.value ||
      account.models?.some((item) => item.code === data.model))
  )
    return;
  form.model = "";
  if (!account) form.providerId = "";
}
function applyLiveModelRemoval(data: ModelEndpointTestResult) {
  if (
    data.modelRemoved !== true ||
    !data.providerId ||
    !data.model ||
    !options.value ||
    (!isBuiltin.value && options.value.card.modelCode !== data.model)
  )
    return;
  optionsSequence += 1;
  synchronizingRemovedOptions = true;
  try {
    options.value = {
      ...options.value,
      accounts: options.value.accounts.flatMap((account) => {
        if (account.id !== data.providerId) return [account];
        if (!isBuiltin.value) return [];
        const models = account.models?.filter(
          (item) => item.code !== data.model,
        );
        return models?.length ? [{ ...account, models }] : [];
      }),
    };
    clearRemovedSelection(data);
  } finally {
    synchronizingRemovedOptions = false;
  }
}
async function refreshRemovedOptions(
  data: ModelEndpointTestResult,
  current: number,
) {
  if (data.modelRemoved !== true || !props.row || !visible.value) return;
  const endpointId = props.row.id;
  const sequence = ++optionsSequence;
  try {
    const fresh = await getModelEndpointTestOptions(endpointId);
    if (
      current !== session ||
      !visible.value ||
      props.row?.id !== endpointId ||
      sequence !== optionsSequence
    )
      return;
    synchronizingRemovedOptions = true;
    try {
      // 只更新当前候选；旧历史不能再次移除管理员重新加入的模型。
      options.value = fresh;
      clearRemovedSelection(data);
    } finally {
      synchronizingRemovedOptions = false;
    }
  } catch {
    // 后端已持久化移除；读取失败保留本次结果，不自动提交供应商请求。
  }
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
  const model =
    data.model ||
    (isBuiltin.value
      ? form.model
      : (options.value?.card.modelCode ?? props.row?.modelCode)) ||
    "模型";
  const text = `${model}：${statusLabels[data.status]}。${data.message}`;
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
    optionsSequence += 1;
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
    form.model = "";
    form.requestBody = "";
    loading.value = true;
    const sequence = ++optionsSequence;
    try {
      const data = await getModelEndpointTestOptions(props.row.id);
      if (current !== session || !visible.value || sequence !== optionsSequence)
        return;
      const previous = data.recentTest;
      const restoringRemovedModel = previous?.result.modelRemoved === true;
      synchronizingRemovedOptions = true;
      options.value = data;
      testedAccountName.value = previous
        ? (data.accounts.find((item) => item.id === previous.providerId)
            ?.name ?? `账号 ${previous.providerId}`)
        : "";
      form.providerId =
        previous &&
        data.accounts.some((item) => item.id === previous.providerId)
          ? previous.providerId
          : restoringRemovedModel
            ? ""
            : data.accounts.length === 1
              ? data.accounts[0]!.id
              : "";
      form.requestBody = JSON.stringify(data.requestBody, null, 2);
      form.model = previous?.result.model ?? "";
      if (
        data.card.source === "builtin" &&
        !availableModels.value.some((item) => item.code === form.model)
      )
        form.model = restoringRemovedModel
          ? ""
          : (availableModels.value[0]?.code ?? "");
      synchronizingRemovedOptions = false;
      result.value = previous?.result ?? null;
      lastNotifiedResult = previous
        ? `${previous.result.requestId}:${previous.result.status}:${previous.result.message}`
        : "";
      requestId.value = previous?.result.requestId ?? "";
      schedulePoll(current, false);
    } catch (error) {
      if (current === session && visible.value && sequence === optionsSequence)
        errorMessage.value = message(error);
    } finally {
      synchronizingRemovedOptions = false;
      if (current === session) loading.value = false;
    }
  },
  { flush: "sync" },
);
onBeforeUnmount(() => {
  session += 1;
  optionsSequence += 1;
  stopPolling();
});

async function startTest() {
  if (!props.row || pending.value || loading.value || querying.value) return;
  const current = session;
  const selection = selectionKey();
  await formRef.value?.validate();
  if (current !== session || !visible.value || selection !== selectionKey())
    return;
  let requestBody: unknown;
  try {
    requestBody = JSON.parse(form.requestBody);
    if (
      !requestBody ||
      typeof requestBody !== "object" ||
      Array.isArray(requestBody)
    )
      throw new Error("请求参数必须是 JSON 对象");
    if (isBuiltin.value) requestBody = { ...requestBody, model: form.model };
    if (JSON.stringify(requestBody).includes("REPLACE_WITH_"))
      throw new Error("请按官方文档替换全部 REPLACE_WITH_ 占位符后再测试");
  } catch (error) {
    ElMessage.warning(
      error instanceof SyntaxError ? "请求参数不是有效 JSON" : message(error),
    );
    return;
  }
  stopPolling();
  errorMessage.value = "";
  requestId.value = crypto.randomUUID();
  testedAccountName.value =
    options.value?.accounts.find((item) => item.id === Number(form.providerId))
      ?.name ?? "";
  result.value = null;
  submitting.value = true;
  try {
    const data = await testModelEndpoint(props.row.id, {
      providerId: Number(form.providerId),
      ...(isBuiltin.value ? { model: form.model } : {}),
      requestId: requestId.value,
      requestBody: requestBody as Record<string, unknown>,
    });
    if (current !== session || !visible.value) return;
    result.value = data;
    applyLiveModelRemoval(data);
    notifyResult(data, true);
    await refreshRemovedOptions(data, current);
    if (current !== session || !visible.value) return;
    schedulePoll(current);
  } catch (error) {
    if (current === session && visible.value) {
      errorMessage.value = `${message(error)} 若请求已被供应商受理，可能已计费；请先查询本次结果。`;
      if (!(isAxiosError(error) && error.response?.status === 401))
        ElMessage.warning(errorMessage.value);
    }
  } finally {
    if (current === session) submitting.value = false;
  }
}
async function refreshResult(explicit = false) {
  if (
    !visible.value ||
    !props.row ||
    !requestId.value ||
    querying.value ||
    submitting.value
  )
    return;
  const current = session;
  const selection = selectionKey();
  querying.value = true;
  errorMessage.value = "";
  try {
    const data = await queryModelEndpointTest(props.row.id, requestId.value);
    if (current !== session || !visible.value || selection !== selectionKey())
      return;
    result.value = data;
    notifyResult(data, explicit);
    await refreshRemovedOptions(data, current);
    if (current !== session || !visible.value) return;
    schedulePoll(current);
  } catch (error) {
    if (current === session && visible.value && selection === selectionKey()) {
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
        POST
        {{
          options.accounts.find((item) => item.id === Number(form.providerId))
            ?.apiPath ?? options.card.apiPath
        }}
        <div v-if="options.card.executionMode === 'async'">
          {{ options.card.taskMethod ?? "GET" }} {{ options.card.taskApiPath }}
        </div>
        <el-link
          v-if="options.card.documentationUrl"
          :href="options.card.documentationUrl"
          target="_blank"
          rel="noopener noreferrer"
          >查看官方参数说明</el-link
        >
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
          测试模型：{{
            result.model || (isBuiltin ? "未记录" : row?.modelCode)
          }}
        </div>
        <div v-if="result.apiPath">调用路径：POST {{ result.apiPath }}</div>
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
          !form.providerId ||
          (isBuiltin && !form.model)
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
