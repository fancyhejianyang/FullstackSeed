<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { ElMessage, type FormRules } from "element-plus";
import Form, { type FormField } from "@/components/Form.vue";
import Dialog from "@/components/Dialog.vue";
import {
  createModelEndpoint,
  getModelEndpoint,
  getModelEndpointOptions,
  updateModelEndpoint,
  type ModelEndpoint,
  type ModelEndpointForm,
  type ModelEndpointOptions,
} from "@/api/modelEndpoint";

const props = defineProps<{ row?: ModelEndpoint | null }>();
const emit = defineEmits<{ success: [] }>();
const visible = defineModel<boolean>("visible", { required: true });
const loading = ref(false);
const submitting = ref(false);
const ready = ref(false);
const formRef = ref<InstanceType<typeof Form>>();
const initial = (): ModelEndpointForm => ({
  platformType: "tencentTokenhub",
  modelCode: "",
  modelName: "",
  functionType: "textToImage",
  protocol: "tokenhubSeedreamImage",
  apiPath: "",
  taskApiPath: "",
  executionMode: "sync",
  isActive: true,
});
const form = reactive(initial());
const options = ref<ModelEndpointOptions>({
  platforms: [],
  functions: [],
  protocols: [],
});
const availableProtocols = computed(() =>
  options.value.protocols.filter(
    (item) =>
      item.functions.includes(form.functionType) &&
      !(
        form.platformType === "aliyunBailian" &&
        item.value.startsWith("tokenhub")
      ) &&
      !(
        form.platformType === "tencentTokenhub" &&
        item.value.startsWith("dashscope")
      ),
  ),
);
const fields = computed<FormField[]>(() => [
  {
    prop: "platformType",
    label: "平台类型",
    type: "select",
    options: options.value.platforms,
    componentProps: { clearable: false },
  },
  {
    prop: "modelCode",
    label: "模型编码",
    type: "input",
    placeholder: "seedream-image-v5.0-pro",
  },
  {
    prop: "modelName",
    label: "模型名称",
    type: "input",
    placeholder: "Seedream Image 5.0 Pro",
  },
  {
    prop: "functionType",
    label: "功能场景",
    type: "select",
    options: options.value.functions,
    componentProps: { clearable: false },
  },
  {
    prop: "protocol",
    label: "调用协议",
    type: "select",
    options: availableProtocols.value,
    componentProps: { clearable: false },
  },
  { prop: "executionMode", label: "执行方式", type: "input", slot: true },
  {
    prop: "apiPath",
    label: "调用路径",
    type: "input",
    placeholder: "/v1/wand/si-image/generation",
  },
  ...(form.executionMode === "async"
    ? [
        {
          prop: "taskApiPath",
          label: "任务查询路径",
          type: "input" as const,
          placeholder: "/v1/wand/vidu-image/tasks/{taskId}",
          hint:
            options.value.protocols.find((item) => item.value === form.protocol)
              ?.taskMethod === "POST"
              ? "当前协议用 POST 查询，填写固定查询路径；任务编号由系统放入请求体。"
              : "当前协议用 GET 查询，路径中须包含一个 {taskId}。",
        },
      ]
    : []),
  { prop: "isActive", label: "启用", component: "Switch" },
]);
const rules: FormRules = Object.fromEntries(
  [
    "platformType",
    "modelCode",
    "modelName",
    "functionType",
    "protocol",
    "apiPath",
    "taskApiPath",
  ].map((key) => [
    key,
    [
      {
        required: true,
        message: "请填写或选择此项",
        trigger: ["blur", "change"],
      },
    ],
  ]),
);
let loadVersion = 0;
watch(visible, async (value) => {
  const version = ++loadVersion;
  ready.value = false;
  if (!value) return;
  loading.value = true;
  try {
    const [catalog, row] = await Promise.all([
      getModelEndpointOptions(),
      props.row?.id ? getModelEndpoint(props.row.id) : Promise.resolve(null),
    ]);
    if (version !== loadVersion) return;
    options.value = catalog;
    const data = row ?? initial();
    Object.assign(
      form,
      Object.fromEntries(
        Object.keys(initial()).map((key) => [
          key,
          data[key as keyof ModelEndpointForm],
        ]),
      ),
    );
    ready.value = true;
  } finally {
    if (version === loadVersion) loading.value = false;
  }
});
watch(
  [() => form.platformType, () => form.functionType],
  () => {
    if (!ready.value) return;
    if (
      !availableProtocols.value.some((item) => item.value === form.protocol)
    ) {
      const first = availableProtocols.value[0];
      if (first) form.protocol = first.value;
    }
  },
  { flush: "sync" },
);
watch(
  () => form.protocol,
  () => {
    if (!ready.value) return;
    const protocol = options.value.protocols.find(
      (item) => item.value === form.protocol,
    );
    if (protocol) form.executionMode = protocol.executionMode;
    if (form.executionMode === "sync") form.taskApiPath = "";
  },
  { flush: "sync" },
);
async function handleSubmit() {
  if (!ready.value || loading.value || submitting.value) return;
  await formRef.value?.validate();
  submitting.value = true;
  try {
    const data = {
      ...form,
      taskApiPath: form.executionMode === "async" ? form.taskApiPath : "",
    };
    if (props.row) await updateModelEndpoint(props.row.id, data);
    else await createModelEndpoint(data);
    ElMessage.success("保存成功");
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
    :title="props.row ? '编辑模型调用接口' : '新增模型调用接口'"
    width="760px"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <div v-loading="loading">
      <Form
        v-if="ready"
        ref="formRef"
        v-model="form"
        :fields="fields"
        :rules="rules"
        label-width="110px"
      >
        <template #field-executionMode>{{
          form.executionMode === "async" ? "异步提交后查询任务" : "同步返回结果"
        }}</template>
      </Form>
    </div>
  </Dialog>
</template>
