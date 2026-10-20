<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { ElMessage, type FormRules } from "element-plus";
import Dialog from "@/components/Dialog.vue";
import Form, { type FormField } from "@/components/Form.vue";
import Button from "@/components/Button.vue";
import Input from "@/components/Input.vue";
import InputNumber from "@/components/InputNumber.vue";
import Select from "@/components/Select.vue";
import Switch from "@/components/Switch.vue";
import {
  createComfyWorkflow,
  getComfyConnectionOptions,
  getComfyWorkflow,
  updateComfyWorkflow,
  type ComfyBindingType,
  type ComfyConnection,
  type ComfyInputBinding,
  type ComfyWorkflow,
  type ComfyWorkflowForm,
} from "@/api/comfyUi";

type ApiNode = {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title?: string };
};
type EditorBinding = Omit<ComfyInputBinding, "defaultValue"> & {
  defaultValue: string;
  optionsText: string;
};
type EditorForm = Omit<ComfyWorkflowForm, "inputBindings" | "outputNodeIds"> & {
  inputBindings: EditorBinding[];
  outputNodeIdsText: string;
};

const props = defineProps<{ row?: ComfyWorkflow | null }>();
const emit = defineEmits<{ success: [] }>();
const visible = defineModel<boolean>("visible", { required: true });
const formRef = ref<InstanceType<typeof Form>>();
const loading = ref(false);
const submitting = ref(false);
const connections = ref<
  Pick<ComfyConnection, "id" | "name" | "isDefault" | "lastTestStatus">[]
>([]);
const fileInput = ref<HTMLInputElement>();
const form = reactive<EditorForm>({
  name: "",
  connectionId: 0,
  outputType: "image",
  description: "",
  apiWorkflow: "",
  inputBindings: [],
  outputNodeIdsText: "",
  dependencyNotes: "",
  isPublished: false,
  isEnabled: true,
});

const graph = computed<Record<string, ApiNode> | null>(() => {
  try {
    const value = JSON.parse(form.apiWorkflow || "{}") as Record<
      string,
      ApiNode
    >;
    return value && typeof value === "object" && Object.keys(value).length
      ? value
      : null;
  } catch {
    return null;
  }
});
const nodeOptions = computed(() =>
  Object.entries(graph.value || {}).map(([id, node]) => ({
    value: id,
    text: `${id} · ${node._meta?.title || node.class_type || "未知节点"}`,
  })),
);
function inputOptions(nodeId: string) {
  return Object.keys(graph.value?.[nodeId]?.inputs || {}).map((key) => ({
    value: key,
    text: key,
  }));
}
const connectionOptions = computed(() =>
  connections.value.map((item) => ({ label: item.name, value: item.id })),
);
const fields = computed<FormField[]>(() => [
  {
    prop: "name",
    label: "模板名称",
    type: "input",
    placeholder: "如 SDXL 商品主图",
  },
  {
    prop: "connectionId",
    label: "执行服务",
    type: "select",
    options: connectionOptions,
  },
  {
    prop: "outputType",
    label: "输出类型",
    type: "select",
    options: [
      { label: "图片", value: "image" },
      { label: "视频", value: "video" },
    ],
  },
  { prop: "description", label: "使用说明", type: "textarea", rows: 2 },
  {
    prop: "apiWorkflow",
    label: "API 工作流 JSON",
    slot: true,
    span: 2,
    labelPosition: "top",
  },
  {
    prop: "inputBindings",
    label: "开放参数与节点映射",
    slot: true,
    span: 2,
    labelPosition: "top",
  },
  {
    prop: "outputNodeIdsText",
    label: "输出节点",
    type: "input",
    placeholder: "可选；多个节点 ID 使用英文逗号分隔",
    span: 2,
    hint: "留空时归档历史结果中的全部文件；填写后仅归档指定节点。",
  },
  {
    prop: "dependencyNotes",
    label: "依赖说明",
    type: "textarea",
    rows: 3,
    span: 2,
  },
  {
    prop: "isPublished",
    label: "发布状态",
    component: "Switch",
    componentProps: { activeText: "已发布", inactiveText: "草稿" },
  },
  {
    prop: "isEnabled",
    label: "是否启用",
    component: "Switch",
    componentProps: { activeText: "启用", inactiveText: "停用" },
  },
]);
const rules: FormRules = {
  name: [{ required: true, message: "请输入模板名称", trigger: "blur" }],
  connectionId: [
    { required: true, message: "请选择执行服务", trigger: "change" },
  ],
  outputType: [
    { required: true, message: "请选择输出类型", trigger: "change" },
  ],
  apiWorkflow: [
    { required: true, message: "请导入 API 工作流 JSON", trigger: "blur" },
  ],
};
const bindingTypes = [
  { value: "textarea", text: "长文本/提示词" },
  { value: "text", text: "单行文本" },
  { value: "number", text: "数字" },
  { value: "boolean", text: "开关" },
  { value: "select", text: "下拉选项" },
  { value: "image", text: "图片素材" },
  { value: "seed", text: "随机种子" },
  { value: "outputPrefix", text: "系统输出前缀" },
];

function reset() {
  Object.assign(form, {
    name: "",
    connectionId:
      connections.value.find((item) => item.isDefault)?.id ||
      connections.value[0]?.id ||
      0,
    outputType: "image",
    description: "",
    apiWorkflow: "",
    inputBindings: [],
    outputNodeIdsText: "",
    dependencyNotes: "",
    isPublished: false,
    isEnabled: true,
  });
}
watch(visible, async (open) => {
  if (!open) return;
  loading.value = true;
  try {
    connections.value = await getComfyConnectionOptions();
    reset();
    if (!props.row) return;
    const detail = await getComfyWorkflow(props.row.id);
    Object.assign(form, {
      name: detail.name,
      connectionId: detail.connectionId,
      outputType: detail.outputType,
      description: detail.description || "",
      apiWorkflow: detail.apiWorkflow || "",
      inputBindings: detail.inputBindings.map((binding) => ({
        ...binding,
        defaultValue:
          binding.defaultValue === null || binding.defaultValue === undefined
            ? ""
            : String(binding.defaultValue),
        optionsText: (binding.options || [])
          .map((item) => `${item.value}#${item.label}`)
          .join("\n"),
      })),
      outputNodeIdsText: (detail.outputNodeIds || []).join(","),
      dependencyNotes: detail.dependencyNotes || "",
      isPublished: detail.isPublished,
      isEnabled: detail.isEnabled,
    });
  } finally {
    loading.value = false;
  }
});

function addBinding() {
  const first = nodeOptions.value[0]?.value || "";
  form.inputBindings.push({
    key: `parameter${form.inputBindings.length + 1}`,
    label: `参数 ${form.inputBindings.length + 1}`,
    type: "text",
    nodeId: first,
    inputKey: inputOptions(first)[0]?.value || "",
    required: false,
    defaultValue: "",
    optionsText: "",
  });
}
function removeBinding(index: number) {
  form.inputBindings.splice(index, 1);
}
function handleNodeChange(binding: EditorBinding) {
  if (
    !inputOptions(binding.nodeId).some(
      (item) => item.value === binding.inputKey,
    )
  ) {
    binding.inputKey = inputOptions(binding.nodeId)[0]?.value || "";
  }
}
async function importFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    ElMessage.error("工作流 JSON 不能超过 2MB");
    return;
  }
  form.apiWorkflow = await file.text();
  const nodes = graph.value;
  if (!nodes) {
    ElMessage.error("文件不是有效的 ComfyUI API 工作流 JSON");
    return;
  }
  const outputIds = Object.entries(nodes)
    .filter(([, node]) =>
      /save(image|video|animated|webm|gif)/i.test(node.class_type),
    )
    .map(([id]) => id);
  if (!form.outputNodeIdsText) form.outputNodeIdsText = outputIds.join(",");
  ElMessage.success(`已识别 ${Object.keys(nodes).length} 个节点`);
  (event.target as HTMLInputElement).value = "";
}
function bindingOptions(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [value, label] = line.split("#");
      return { value: value.trim(), label: (label || value).trim() };
    });
}
async function submit() {
  await formRef.value?.validate();
  if (!graph.value) {
    ElMessage.error("工作流 JSON 格式无效");
    return;
  }
  const incomplete = form.inputBindings.find(
    (binding) =>
      !binding.key || !binding.label || !binding.nodeId || !binding.inputKey,
  );
  if (incomplete) {
    ElMessage.error("请完整填写参数名称、节点和输入字段");
    return;
  }
  const payload: ComfyWorkflowForm = {
    name: form.name,
    connectionId: Number(form.connectionId),
    outputType: form.outputType,
    description: form.description,
    apiWorkflow: form.apiWorkflow,
    inputBindings: form.inputBindings.map(({ optionsText, ...binding }) => ({
      ...binding,
      type: binding.type as ComfyBindingType,
      options:
        binding.type === "select" ? bindingOptions(optionsText) : undefined,
    })),
    outputNodeIds: form.outputNodeIdsText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    dependencyNotes: form.dependencyNotes,
    isPublished: form.isPublished,
    isEnabled: form.isEnabled,
  };
  submitting.value = true;
  try {
    if (props.row) await updateComfyWorkflow(props.row.id, payload);
    else await createComfyWorkflow(payload);
    ElMessage.success(props.row ? "工作流已保存并生成新版本" : "工作流已导入");
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
    :title="row ? '编辑 ComfyUI 工作流' : '导入 ComfyUI 工作流'"
    width="1120px"
    body-max-height="72vh"
    :confirm-loading="submitting"
    @confirm="submit"
  >
    <div v-loading="loading">
      <Form
        ref="formRef"
        v-model="form"
        :fields="fields"
        :rules="rules"
        :columns="2"
        label-width="110px"
      >
        <template #field-apiWorkflow>
          <div class="workflow-json">
            <div class="workflow-json__actions">
              <Button :confirm="false" icon="Upload" @click="fileInput?.click()"
                >选择 API JSON</Button
              >
              <span>{{
                graph
                  ? `已识别 ${Object.keys(graph).length} 个节点`
                  : "请从 ComfyUI 导出 API 格式工作流"
              }}</span>
              <input
                ref="fileInput"
                hidden
                type="file"
                accept="application/json,.json"
                @change="importFile"
              />
            </div>
            <Input
              v-model="form.apiWorkflow"
              mode="textarea"
              :rows="8"
              :trim="false"
              :clearable="false"
              placeholder="粘贴或导入 ComfyUI API 工作流 JSON"
            />
          </div>
        </template>
        <template #field-inputBindings>
          <div class="binding-editor">
            <div class="binding-editor__header">
              <span>只开放这里配置的参数，运行时不会接受任意节点修改。</span>
              <Button :confirm="false" icon="Plus" @click="addBinding"
                >添加参数</Button
              >
            </div>
            <el-empty
              v-if="!form.inputBindings.length"
              description="尚未配置开放参数"
              :image-size="54"
            />
            <div
              v-for="(binding, index) in form.inputBindings"
              :key="index"
              class="binding-row"
            >
              <Input v-model="binding.label" placeholder="显示名称" />
              <Input v-model="binding.key" placeholder="参数键，如 prompt" />
              <Select
                v-model="binding.type"
                :options="bindingTypes"
                :clearable="false"
              />
              <Select
                v-model="binding.nodeId"
                :options="nodeOptions"
                placeholder="目标节点"
                @change="handleNodeChange(binding)"
              />
              <Select
                v-model="binding.inputKey"
                :options="inputOptions(binding.nodeId)"
                placeholder="输入字段"
              />
              <Input
                v-if="binding.type !== 'outputPrefix'"
                v-model="binding.defaultValue"
                placeholder="默认值（可选）"
              />
              <span v-else class="system-value">任务专用前缀</span>
              <Switch
                :model-value="!!binding.required"
                active-text="必填"
                inactive-text="可选"
                @update:model-value="binding.required = $event"
              />
              <Button
                :confirm="false"
                :auto-type="false"
                icon="Delete"
                @click="removeBinding(index)"
                >移除</Button
              >
              <Input
                v-if="binding.type === 'select'"
                v-model="binding.optionsText"
                class="binding-row__options"
                mode="textarea"
                :rows="2"
                placeholder="每行一个选项：值#显示名称"
              />
              <div class="binding-row__advanced">
                <Input
                  :model-value="binding.hint || ''"
                  placeholder="参数说明（可选）"
                  @update:model-value="binding.hint = String($event || '')"
                />
                <template
                  v-if="binding.type === 'number' || binding.type === 'seed'"
                >
                  <InputNumber
                    :model-value="binding.min ?? null"
                    placeholder="最小值"
                    @update:model-value="binding.min = $event ?? undefined"
                  />
                  <InputNumber
                    :model-value="binding.max ?? null"
                    placeholder="最大值"
                    @update:model-value="binding.max = $event ?? undefined"
                  />
                </template>
              </div>
            </div>
          </div>
        </template>
      </Form>
    </div>
  </Dialog>
</template>

<style scoped>
.workflow-json,
.binding-editor {
  width: 100%;
}
.workflow-json__actions,
.binding-editor__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  color: #606266;
  font-size: 13px;
}
.binding-row {
  display: grid;
  grid-template-columns: 1fr 1fr 140px 1.3fr 1fr 1fr 90px auto;
  gap: 8px;
  align-items: center;
  padding: 12px;
  margin-bottom: 10px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  background: #fafcff;
}
.binding-row__options {
  grid-column: 1 / -1;
}
.binding-row__advanced {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 1fr 160px 160px;
  gap: 8px;
}
.system-value {
  color: #909399;
  font-size: 12px;
}
@media (max-width: 900px) {
  .binding-row {
    grid-template-columns: 1fr 1fr;
  }
  .binding-row__options {
    grid-column: 1 / -1;
  }
  .binding-row__advanced {
    grid-template-columns: 1fr;
  }
}
</style>
