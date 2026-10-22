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
import { detectComfyWorkflow, type ComfyApiNode } from "./workflowDetection";
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
const detectionSummary = ref("");
const detectedSourcePrompt = ref("");
const detectedNegativePrompt = ref("");
const boundVisualTemplateId = ref<number | null>(null);
const showAdvanced = ref(false);
const form = reactive<EditorForm>({
  name: "",
  connectionId: 0,
  outputType: "image",
  targetModel: "",
  description: "",
  apiWorkflow: "",
  inputBindings: [],
  outputNodeIdsText: "",
  dependencyNotes: "",
  isEnabled: true,
});

const graph = computed<Record<string, ComfyApiNode> | null>(() => {
  try {
    const value = JSON.parse(form.apiWorkflow || "{}") as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const entries = Object.entries(value);
    if (
      !entries.length ||
      entries.some(
        ([, node]) =>
          !node ||
          typeof node !== "object" ||
          typeof (node as Partial<ComfyApiNode>).class_type !== "string" ||
          !(node as Partial<ComfyApiNode>).inputs ||
          typeof (node as Partial<ComfyApiNode>).inputs !== "object" ||
          Array.isArray((node as Partial<ComfyApiNode>).inputs),
      )
    ) {
      return null;
    }
    return value as Record<string, ComfyApiNode>;
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
const creativeBindings = computed(() =>
  form.inputBindings.filter((binding) => binding.type !== "outputPrefix"),
);
const fields = computed<FormField[]>(() => {
  const result: FormField[] = [
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
    {
      prop: "targetModel",
      label: "目标模型",
      type: "input",
      placeholder: "如 flux1-dev、sdxl_base_1.0",
      hint: "填写工作流实际加载的模型标识，用于匹配对应提示词总结和模型规则。",
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
  ];
  if (showAdvanced.value) {
    result.push(
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
    );
  }
  result.push({
    prop: "isEnabled",
    label: "是否启用",
    component: "Switch",
    componentProps: { activeText: "启用", inactiveText: "停用" },
  });
  return result;
});
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
const semanticRoleOptions = [
  { value: "normal", text: "普通参数" },
  { value: "mainPrompt", text: "主提示词" },
  { value: "positivePrompt", text: "正向提示词" },
  { value: "negativePrompt", text: "负向提示词" },
  { value: "videoMotion", text: "视频运动描述" },
  { value: "cameraMotion", text: "镜头运动描述" },
];
function optionLabel(
  options: { value: string; text: string }[],
  value?: string,
) {
  return options.find((option) => option.value === value)?.text || value || "—";
}

function reset() {
  Object.assign(form, {
    name: "",
    connectionId:
      connections.value.find((item) => item.isDefault)?.id ||
      connections.value[0]?.id ||
      0,
    outputType: "image",
    targetModel: "",
    description: "",
    apiWorkflow: "",
    inputBindings: [],
    outputNodeIdsText: "",
    dependencyNotes: "",
    isEnabled: true,
  });
  detectionSummary.value = "";
  detectedSourcePrompt.value = "";
  detectedNegativePrompt.value = "";
  boundVisualTemplateId.value = null;
  showAdvanced.value = false;
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
      targetModel: detail.targetModel || "",
      description: detail.description || "",
      apiWorkflow: detail.apiWorkflow || "",
      inputBindings: detail.inputBindings.map((binding) => ({
        ...binding,
        semanticRole: binding.semanticRole || "normal",
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
      isEnabled: detail.isEnabled,
    });
    boundVisualTemplateId.value = detail.visualPromptTemplateId;
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
    semanticRole: "normal",
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
function handleBindingTypeChange(binding: EditorBinding) {
  if (!["text", "textarea"].includes(binding.type)) {
    binding.semanticRole = "normal";
  }
}
function uniqueEditorKey(baseKey: string) {
  const used = new Set(form.inputBindings.map((binding) => binding.key));
  if (!used.has(baseKey)) return baseKey;
  let suffix = 2;
  while (used.has(`${baseKey}${suffix}`)) suffix += 1;
  return `${baseKey}${suffix}`;
}
function applyWorkflowDetection(fileName = "") {
  const nodes = graph.value;
  if (!nodes) {
    ElMessage.error("请先导入有效的 ComfyUI API 工作流 JSON");
    return;
  }
  const detected = detectComfyWorkflow(nodes, fileName);
  detectedSourcePrompt.value = detected.sourcePrompt;
  detectedNegativePrompt.value = detected.sourceNegativePrompt;
  const filled: string[] = [];
  if (!form.name.trim() && detected.suggestedName) {
    form.name = detected.suggestedName;
    filled.push("模板名称");
  }
  if (detected.outputType && form.outputType !== detected.outputType) {
    form.outputType = detected.outputType;
    filled.push("输出类型");
  }
  if (!(form.targetModel || "").trim() && detected.targetModel) {
    form.targetModel = detected.targetModel;
    filled.push("目标模型");
  }
  if (!(form.dependencyNotes || "").trim() && detected.dependencyNotes) {
    form.dependencyNotes = detected.dependencyNotes;
    filled.push("模型依赖");
  }
  if (!form.outputNodeIdsText.trim() && detected.outputNodeIds.length) {
    form.outputNodeIdsText = detected.outputNodeIds.join(",");
    filled.push("输出节点");
  }

  let addedBindings = 0;
  for (const binding of detected.bindings) {
    const alreadyMapped = form.inputBindings.some(
      (item) =>
        (item.nodeId === binding.nodeId &&
          item.inputKey === binding.inputKey) ||
        (binding.semanticRole !== "normal" &&
          item.semanticRole === binding.semanticRole),
    );
    if (alreadyMapped) continue;
    form.inputBindings.push({
      ...binding,
      key: uniqueEditorKey(binding.key),
      defaultValue:
        binding.defaultValue === null || binding.defaultValue === undefined
          ? ""
          : String(binding.defaultValue),
      optionsText: "",
    });
    addedBindings += 1;
  }
  if (addedBindings) filled.push(`${addedBindings} 个开放参数`);

  const modelText = detected.targetModel
    ? ` · ${detected.targetModel}`
    : " · 未识别主模型";
  detectionSummary.value = `自动识别：${Object.keys(nodes).length} 个节点${modelText} · 新增 ${addedBindings} 个参数`;
  if (filled.length) {
    ElMessage.success(`已自动补充：${filled.join("、")}`);
  } else {
    ElMessage.info("未发现新的可补充字段，已有配置保持不变");
  }
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) {
      ElMessage.error("工作流 JSON 不能超过 2MB");
      return;
    }
    form.apiWorkflow = await file.text();
    if (!graph.value) {
      ElMessage.error("文件不是有效的 ComfyUI API 工作流 JSON");
      return;
    }
    applyWorkflowDetection(file.name);
  } catch {
    ElMessage.error("工作流 JSON 文件读取失败，请重新选择");
  } finally {
    input.value = "";
  }
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
  const invalidNumericDefault = form.inputBindings.find(
    (binding) =>
      ["number", "seed"].includes(binding.type) &&
      binding.defaultValue.trim() &&
      !Number.isFinite(Number(binding.defaultValue)),
  );
  if (invalidNumericDefault) {
    ElMessage.error(`${invalidNumericDefault.label} 的默认值必须是数字`);
    return;
  }
  const payload: ComfyWorkflowForm = {
    name: form.name,
    connectionId: Number(form.connectionId),
    outputType: form.outputType,
    targetModel: form.targetModel,
    description: form.description,
    apiWorkflow: form.apiWorkflow,
    inputBindings: form.inputBindings.map(({ optionsText, ...binding }) => {
      const numericDefault = ["number", "seed"].includes(binding.type);
      return {
        ...binding,
        type: binding.type as ComfyBindingType,
        defaultValue:
          numericDefault && binding.defaultValue.trim()
            ? Number(binding.defaultValue)
            : binding.defaultValue,
        options:
          binding.type === "select" ? bindingOptions(optionsText) : undefined,
      };
    }),
    outputNodeIds: form.outputNodeIdsText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    dependencyNotes: form.dependencyNotes,
    isEnabled: form.isEnabled,
  };
  submitting.value = true;
  try {
    const saved = props.row
      ? await updateComfyWorkflow(props.row.id, payload)
      : await createComfyWorkflow(payload);
    if (detectedSourcePrompt.value && !saved.visualPromptTemplateId) {
      ElMessage.warning(
        "工作流已保存，但没有可用的“提示词总结”AI 配置，暂未建立总结记录",
      );
    } else {
      ElMessage.success(
        saved.visualPromptTemplateId
          ? props.row
            ? "工作流与提示词总结记录已更新"
            : "工作流已导入，并从原始提示词建立总结记录"
          : props.row
            ? "工作流已保存并生成新版本"
            : "工作流已导入",
      );
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
    class="workflow-dialog"
    :title="row ? '编辑工作流' : '导入工作流'"
    width="1040px"
    body-max-height="76vh"
    :confirm-loading="submitting"
    @confirm="submit"
  >
    <div v-loading="loading" class="workflow-editor">
      <div class="workflow-editor__heading">
        <div>
          <span class="workflow-editor__heading-title">基础信息</span>
          <span class="workflow-editor__heading-description">
            导入并保存工作流，启用后即可在创作任务中调用
          </span>
        </div>
        <Button
          class="workflow-editor__advanced-toggle"
          :confirm="false"
          :icon="showAdvanced ? 'ArrowUp' : 'Setting'"
          @click="showAdvanced = !showAdvanced"
        >
          {{ showAdvanced ? "收起高级配置" : "高级配置" }}
        </Button>
      </div>
      <Form
        ref="formRef"
        v-model="form"
        class="workflow-form"
        :fields="fields"
        :rules="rules"
        :columns="2"
        label-width="110px"
      >
        <template #field-apiWorkflow>
          <section class="workflow-section workflow-json">
            <div class="workflow-section__header">
              <div>
                <div class="workflow-section__title">
                  <span class="workflow-section__required" aria-hidden="true"
                    >*</span
                  >
                  API 工作流 JSON
                </div>
                <div class="workflow-section__description">
                  请在 ComfyUI 中开启开发者模式，并导出 API 格式工作流
                </div>
              </div>
              <div class="workflow-section__actions">
                <span
                  class="workflow-json__status"
                  :class="{ 'is-ready': graph }"
                >
                  {{
                    graph
                      ? `已识别 ${Object.keys(graph).length} 个节点`
                      : "等待导入"
                  }}
                </span>
                <Button
                  :confirm="false"
                  icon="MagicStick"
                  :disabled="!graph"
                  @click="applyWorkflowDetection()"
                  >自动识别</Button
                >
                <Button
                  :confirm="false"
                  icon="Upload"
                  @click="fileInput?.click()"
                  >选择 JSON 文件</Button
                >
              </div>
              <input
                ref="fileInput"
                hidden
                type="file"
                accept="application/json,.json"
                @change="importFile"
              />
            </div>
            <Input
              v-if="showAdvanced"
              v-model="form.apiWorkflow"
              mode="textarea"
              :rows="7"
              :trim="false"
              :clearable="false"
              placeholder="粘贴或导入 ComfyUI API 工作流 JSON"
            />
            <div
              v-else
              class="workflow-json__summary"
              :class="{ 'is-empty': !graph }"
            >
              <template v-if="graph">
                <div class="workflow-json__summary-item">
                  <strong>{{ Object.keys(graph).length }}</strong>
                  <span>节点</span>
                </div>
                <div class="workflow-json__summary-item">
                  <strong>{{
                    form.outputType === "video" ? "视频" : "图片"
                  }}</strong>
                  <span>输出类型</span>
                </div>
                <div
                  class="workflow-json__summary-item workflow-json__summary-item--model"
                >
                  <strong>{{ form.targetModel || "待确认" }}</strong>
                  <span>目标模型</span>
                </div>
                <div class="workflow-json__summary-item">
                  <strong>{{
                    form.outputNodeIdsText
                      ? form.outputNodeIdsText.split(",").filter(Boolean).length
                      : 0
                  }}</strong>
                  <span>输出节点</span>
                </div>
              </template>
              <span v-else
                >请选择 JSON 文件；如需手动粘贴，请打开高级配置。</span
              >
            </div>
            <p v-if="detectionSummary" class="workflow-json__detection">
              {{ detectionSummary }}
            </p>
            <div
              class="workflow-prompt-template"
              :class="{
                'is-ready': !!detectedSourcePrompt || !!boundVisualTemplateId,
              }"
            >
              <el-icon><MagicStick /></el-icon>
              <div>
                <strong>提示词总结</strong>
                <span v-if="detectedSourcePrompt">
                  已从工作流识别可提炼的原始提示词{{
                    detectedNegativePrompt ? "及可选负向提示词" : ""
                  }}，保存时会自动建立或更新总结记录；可随后执行 AI 提炼。
                </span>
                <span v-else-if="boundVisualTemplateId">
                  当前工作流已绑定提示词总结；重新导入包含原始提示词的 JSON
                  后会自动更新。
                </span>
                <span v-else>
                  未识别到主提示词或正向提示词，仍可保存，但创作时需要手工填写提示词。
                </span>
              </div>
            </div>
          </section>
        </template>
        <template #field-inputBindings>
          <section class="workflow-section binding-editor">
            <div class="workflow-section__header">
              <div>
                <div class="workflow-section__title">
                  创作参数
                  <span class="workflow-section__count">
                    {{ creativeBindings.length }} 项
                  </span>
                </div>
                <div class="workflow-section__description">
                  保存后，这些参数会出现在创作任务表单中
                </div>
              </div>
              <Button
                v-if="showAdvanced"
                :confirm="false"
                icon="Plus"
                @click="addBinding"
              >
                添加参数
              </Button>
              <Button
                v-else
                :confirm="false"
                icon="Setting"
                @click="showAdvanced = true"
              >
                调整参数
              </Button>
            </div>
            <el-empty
              v-if="!creativeBindings.length && !showAdvanced"
              class="binding-editor__empty"
              description="该工作流没有需要在创作时填写的参数"
              :image-size="42"
            />
            <div v-else-if="!showAdvanced" class="binding-summary">
              <div
                v-for="binding in creativeBindings"
                :key="`${binding.nodeId}:${binding.inputKey}`"
                class="binding-summary__item"
              >
                <div class="binding-summary__content">
                  <strong>{{ binding.label }}</strong>
                  <span v-if="binding.hint">{{ binding.hint }}</span>
                </div>
                <div class="binding-summary__meta">
                  <span>{{ optionLabel(bindingTypes, binding.type) }}</span>
                  <span
                    v-if="
                      binding.semanticRole && binding.semanticRole !== 'normal'
                    "
                  >
                    {{ optionLabel(semanticRoleOptions, binding.semanticRole) }}
                  </span>
                  <span>{{ binding.required ? "必填" : "可选" }}</span>
                </div>
              </div>
            </div>
            <el-empty
              v-else-if="!form.inputBindings.length"
              class="binding-editor__empty"
              description="暂无开放参数，工作流将使用节点内的默认值"
              :image-size="42"
            />
            <div
              v-for="(binding, index) in form.inputBindings"
              v-show="showAdvanced"
              :key="index"
              class="binding-row"
            >
              <Input v-model="binding.label" placeholder="显示名称" />
              <Input v-model="binding.key" placeholder="参数键，如 prompt" />
              <Select
                v-model="binding.type"
                :options="bindingTypes"
                :clearable="false"
                @change="handleBindingTypeChange(binding)"
              />
              <Select
                v-model="binding.semanticRole"
                :options="
                  ['text', 'textarea'].includes(binding.type)
                    ? semanticRoleOptions
                    : semanticRoleOptions.slice(0, 1)
                "
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
          </section>
        </template>
      </Form>
    </div>
  </Dialog>
</template>

<style scoped>
.workflow-editor {
  width: 100%;
}

.workflow-editor__heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}

.workflow-editor__heading > div {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
}

.workflow-editor__advanced-toggle {
  flex-shrink: 0;
}

.workflow-editor__heading-title {
  color: var(--color-text-primary);
  font-size: var(--font-size-base);
  font-weight: 600;
}

.workflow-editor__heading-description,
.workflow-section__description {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.workflow-form :deep(.form__item--label-top > .el-form-item__label) {
  display: none;
}

.workflow-form :deep(.form__item--label-top > .el-form-item__content) {
  margin-left: 0 !important;
}

.workflow-section {
  width: 100%;
  box-sizing: border-box;
  padding: var(--space-md);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  background: #fafcff;
}

.workflow-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  margin-bottom: 12px;
}

.workflow-section__title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-primary);
  font-size: var(--font-size-base);
  font-weight: 600;
  line-height: 22px;
}

.workflow-section__required {
  color: var(--color-danger);
}

.workflow-section__count {
  padding: 0 8px;
  border-radius: var(--radius-full);
  background: #ecf5ff;
  color: var(--color-primary);
  font-size: var(--font-size-xs);
  font-weight: 500;
}

.workflow-section__actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: var(--space-sm);
}

.workflow-json__status {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.workflow-json__status.is-ready {
  color: var(--color-success);
}

.workflow-json__detection {
  margin: var(--space-sm) 0 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.workflow-prompt-template {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: var(--space-sm);
  padding: 10px 12px;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  background: var(--color-bg-container);
  color: var(--color-text-secondary);
}

.workflow-prompt-template.is-ready {
  border-color: #b3e19d;
  background: #f0f9eb;
  color: var(--color-success);
}

.workflow-prompt-template > .el-icon {
  margin-top: 2px;
  flex: 0 0 auto;
}

.workflow-prompt-template > div {
  display: grid;
  gap: 3px;
}

.workflow-prompt-template strong {
  color: var(--color-text-primary);
  font-size: var(--font-size-xs);
}

.workflow-prompt-template span {
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.workflow-json__summary {
  display: grid;
  grid-template-columns: 90px 110px minmax(180px, 1fr) 100px;
  gap: var(--space-sm);
}

.workflow-json__summary.is-empty {
  display: block;
  padding: 18px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-container);
  color: var(--color-text-secondary);
  text-align: center;
}

.workflow-json__summary-item {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-container);
}

.workflow-json__summary-item strong {
  overflow: hidden;
  color: var(--color-text-primary);
  font-size: var(--font-size-base);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-json__summary-item span {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.binding-editor__empty {
  padding: 12px 0 4px;
}

.binding-editor__empty :deep(.el-empty__description) {
  margin-top: var(--space-xs);
}

.binding-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-sm);
}

.binding-summary__item {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-container);
}

.binding-summary__content {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.binding-summary__content strong,
.binding-summary__content span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.binding-summary__content strong {
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
}

.binding-summary__content span {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.binding-summary__meta {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
}

.binding-summary__meta span {
  padding: 2px 7px;
  border-radius: var(--radius-full);
  background: #ecf5ff;
  color: var(--color-primary);
  font-size: 11px;
  line-height: 18px;
}

.binding-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-sm);
  align-items: center;
  padding: 12px;
  margin-top: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-container);
}

.binding-row > * {
  min-width: 0;
}
.binding-row__options {
  grid-column: 1 / -1;
}
.binding-row__advanced {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 1fr 160px 160px;
  gap: var(--space-sm);
}
.system-value {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

@media (max-width: 760px) {
  .workflow-editor__heading,
  .workflow-section__header,
  .workflow-section__actions {
    align-items: flex-start;
    flex-direction: column;
  }

  .workflow-section__actions {
    width: 100%;
  }

  .workflow-section {
    padding: 12px;
  }

  .workflow-editor__heading > div {
    align-items: flex-start;
    flex-direction: column;
  }

  .workflow-editor__advanced-toggle {
    margin-left: 0;
  }

  .workflow-json__summary,
  .binding-summary {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .binding-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .binding-row__options {
    grid-column: 1 / -1;
  }
  .binding-row__advanced {
    grid-template-columns: 1fr;
  }
}

:global(.el-dialog.pro-dialog.workflow-dialog) {
  max-width: calc(100vw - 32px);
}
</style>
