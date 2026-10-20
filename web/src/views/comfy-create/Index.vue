<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { useRouter } from "vue-router";
import { useUserStore } from "@/stores/user";
import PageContainer from "@/components/PageContainer.vue";
import Dialog from "@/components/Dialog.vue";
import Button from "@/components/Button.vue";
import Input from "@/components/Input.vue";
import InputNumber from "@/components/InputNumber.vue";
import Select from "@/components/Select.vue";
import Switch from "@/components/Switch.vue";
import TaskTable from "@/views/comfy-task/TaskTable.vue";
import {
  createComfyTask,
  getComfyMaterialOptions,
  getComfyWorkflowOptions,
  type ComfyMaterial,
  type ComfyWorkflowOption,
} from "@/api/comfyUi";
import {
  composeVisualPromptTemplate,
  getVisualPromptTemplateOptions,
  type VisualPromptTemplateOption,
} from "@/api/visualPromptTemplate";

const router = useRouter();
const user = useUserStore();
const taskTableRef = ref<{ refresh: () => Promise<void> }>();
const createVisible = ref(false);
const loading = ref(false);
const submitting = ref(false);
const workflows = ref<ComfyWorkflowOption[]>([]);
const materials = ref<ComfyMaterial[]>([]);
const workflowId = ref<string | null>("");
const parameters = reactive<Record<string, unknown>>({});
const visualTemplates = ref<VisualPromptTemplateOption[]>([]);
const visualTemplateId = ref<string>("");
const creativeIdea = ref("");
const composing = ref(false);
const composeNotes = ref("");
let templateLoadSequence = 0;
const materialOptions = computed(() =>
  materials.value.map((item) => ({
    value: String(item.id),
    text: item.name,
  })),
);
const current = computed(
  () =>
    workflows.value.find((item) => item.id === Number(workflowId.value)) ||
    null,
);
const promptBindings = computed(() =>
  (current.value?.inputBindings || []).filter((binding) =>
    ["positivePrompt", "negativePrompt"].includes(
      binding.semanticRole || "normal",
    ),
  ),
);
const visualTemplateOptions = computed(() =>
  visualTemplates.value.map((item) => ({
    value: String(item.id),
    text: `${item.name}${item.targetModel ? ` · ${item.targetModel}` : " · 通用"}`,
  })),
);

async function initializeDraft() {
  Object.keys(parameters).forEach((key) => delete parameters[key]);
  for (const binding of current.value?.inputBindings || []) {
    parameters[binding.key] = ["positivePrompt", "negativePrompt"].includes(
      binding.semanticRole || "normal",
    )
      ? ""
      : (binding.defaultValue ?? (binding.type === "boolean" ? false : ""));
  }
  visualTemplates.value = [];
  visualTemplateId.value = "";
  creativeIdea.value = "";
  composeNotes.value = "";
  const sequence = ++templateLoadSequence;
  if (
    !current.value ||
    !promptBindings.value.length ||
    !user.hasPermission("VisualPromptTemplate.read")
  )
    return;
  try {
    const options = await getVisualPromptTemplateOptions({
      mediaType: current.value.outputType,
      targetModel: current.value.targetModel || undefined,
    });
    if (sequence !== templateLoadSequence) return;
    visualTemplates.value = options;
    visualTemplateId.value = options[0] ? String(options[0].id) : "";
  } catch {
    if (sequence === templateLoadSequence) {
      visualTemplates.value = [];
      visualTemplateId.value = "";
    }
  }
}

watch(workflowId, initializeDraft);

function openCreate() {
  createVisible.value = true;
  void initializeDraft();
}

async function composePrompt() {
  if (!visualTemplateId.value) {
    ElMessage.warning("请选择视觉提示词模板");
    return;
  }
  if (!creativeIdea.value.trim()) {
    ElMessage.warning("请输入本次创作想法");
    return;
  }
  composing.value = true;
  try {
    const result = await composeVisualPromptTemplate(
      Number(visualTemplateId.value),
      {
        idea: creativeIdea.value.trim(),
        targetModel: current.value?.targetModel || undefined,
      },
    );
    for (const binding of promptBindings.value) {
      if (binding.semanticRole === "positivePrompt") {
        parameters[binding.key] = result.positivePrompt;
      }
      if (binding.semanticRole === "negativePrompt") {
        parameters[binding.key] = result.negativePrompt;
      }
    }
    composeNotes.value = result.notes;
    ElMessage.success("正向与负向提示词已生成，可继续手动调整");
  } finally {
    composing.value = false;
  }
}
async function load() {
  loading.value = true;
  try {
    [workflows.value, materials.value] = await Promise.all([
      getComfyWorkflowOptions(),
      getComfyMaterialOptions(),
    ]);
    workflowId.value = workflows.value[0] ? String(workflows.value[0].id) : "";
  } finally {
    loading.value = false;
  }
}
async function submit() {
  if (!current.value) {
    ElMessage.warning("请选择可用的工作流");
    return;
  }
  const missing = current.value.inputBindings.find(
    (binding) =>
      binding.required &&
      (parameters[binding.key] === "" || parameters[binding.key] == null),
  );
  if (missing) {
    ElMessage.warning(`请填写${missing.label}`);
    return;
  }
  submitting.value = true;
  try {
    const task = await createComfyTask({
      workflowId: current.value.id,
      parameters: { ...parameters },
      requestId: crypto.randomUUID(),
    });
    ElMessage.success(`任务 #${task.id} 已提交`);
    createVisible.value = false;
    await taskTableRef.value?.refresh();
  } finally {
    submitting.value = false;
  }
}
onMounted(load);
</script>

<template>
  <PageContainer title="ComfyUI 创作">
    <TaskTable ref="taskTableRef">
      <template #toolbar>
        <Button perm="ComfyTask.create" icon="Plus" @click="openCreate">
          新建创作任务
        </Button>
      </template>
    </TaskTable>

    <Dialog
      v-model="createVisible"
      title="新建 ComfyUI 创作任务"
      width="1040px"
      body-max-height="76vh"
      :show-footer="false"
    >
      <div v-loading="loading" class="create-page">
        <section v-if="!workflows.length" class="setup-empty">
          <div class="setup-empty__header">
            <div class="setup-empty__mark" aria-hidden="true">
              <el-icon><Connection /></el-icon>
            </div>
            <div>
              <h3>还没有可用于创作的工作流</h3>
              <p>
                完成服务连接并保存一个 API 工作流后，就可以在这里提交生成任务。
              </p>
            </div>
          </div>
          <div class="setup-steps">
            <div class="setup-step">
              <span>1</span>
              <div>
                <strong>连接本机服务</strong>
                <p>配置 ComfyUI 地址并确认连接可用</p>
              </div>
            </div>
            <div class="setup-step">
              <span>2</span>
              <div>
                <strong>导入并保存工作流</strong>
                <p>从 ComfyUI 导出 API JSON，配置开放参数</p>
              </div>
            </div>
            <div class="setup-step">
              <span>3</span>
              <div>
                <strong>填写参数开始创作</strong>
                <p>任务在后台执行，结果自动进入素材库</p>
              </div>
            </div>
          </div>
          <div class="setup-empty__actions">
            <Button
              perm="ComfyConnection.read"
              icon="Connection"
              @click="router.push('/third-party-config/comfyui')"
            >
              配置服务
            </Button>
            <Button
              perm="ComfyWorkflow.read"
              icon="Upload"
              @click="router.push('/comfyui/workflows')"
            >
              导入工作流
            </Button>
            <span>没有配置权限时，请联系管理员完成前两步。</span>
          </div>
        </section>

        <section v-else class="creation-workspace">
          <aside class="workflow-panel">
            <div class="panel-heading">
              <div>
                <h3>工作流模板</h3>
                <p>选择一个可用模板</p>
              </div>
              <span>{{ workflows.length }}</span>
            </div>
            <div
              class="workflow-list"
              role="radiogroup"
              aria-label="工作流模板"
            >
              <button
                v-for="workflow in workflows"
                :key="workflow.id"
                type="button"
                role="radio"
                class="workflow-card"
                :class="{ 'is-active': workflow.id === current?.id }"
                :aria-checked="workflow.id === current?.id"
                @click="workflowId = String(workflow.id)"
              >
                <span
                  class="workflow-card__icon"
                  :class="`is-${workflow.outputType}`"
                >
                  <el-icon>
                    <VideoPlay v-if="workflow.outputType === 'video'" />
                    <Picture v-else />
                  </el-icon>
                </span>
                <span class="workflow-card__content">
                  <strong>{{ workflow.name }}</strong>
                  <small>
                    {{ workflow.outputType === "video" ? "视频" : "图片" }} ·
                    {{ workflow.inputBindings.length }} 个参数 · v{{
                      workflow.version
                    }}
                  </small>
                </span>
                <el-icon
                  v-if="workflow.id === current?.id"
                  class="workflow-card__check"
                >
                  <CircleCheckFilled />
                </el-icon>
              </button>
            </div>
          </aside>

          <main class="parameter-panel">
            <div class="selected-workflow">
              <div>
                <div class="selected-workflow__meta">
                  <span
                    class="output-badge"
                    :class="`is-${current?.outputType || 'image'}`"
                  >
                    {{
                      current?.outputType === "video" ? "视频生成" : "图片生成"
                    }}
                  </span>
                  <span>版本 v{{ current?.version }}</span>
                </div>
                <h3>{{ current?.name }}</h3>
                <p>
                  {{
                    current?.description ||
                    "按照模板填写参数后即可提交生成任务。"
                  }}
                </p>
              </div>
              <div class="selected-workflow__parameter-count">
                <strong>{{ current?.inputBindings.length || 0 }}</strong>
                <span>开放参数</span>
              </div>
            </div>

            <section v-if="promptBindings.length" class="prompt-composer">
              <div class="prompt-composer__heading">
                <div>
                  <h4>AI 视觉提示词</h4>
                  <p>
                    按
                    {{ current?.targetModel || "通用模型" }}
                    的规则生成正向、负向提示词，并只回填已绑定的工作流参数。
                  </p>
                </div>
                <Button
                  v-if="user.hasPermission('VisualPromptTemplate.read')"
                  :confirm="false"
                  icon="MagicStick"
                  :loading="composing"
                  @click="composePrompt"
                  >生成提示词</Button
                >
              </div>
              <template v-if="user.hasPermission('VisualPromptTemplate.read')">
                <div
                  v-if="visualTemplates.length"
                  class="prompt-composer__form"
                >
                  <div>
                    <label>视觉模板</label>
                    <Select
                      v-model="visualTemplateId"
                      :options="visualTemplateOptions"
                      :clearable="false"
                    />
                  </div>
                  <div class="prompt-composer__idea">
                    <label>创作想法</label>
                    <Input
                      v-model="creativeIdea"
                      mode="textarea"
                      :rows="3"
                      placeholder="描述主体、场景、风格、情绪或镜头运动；AI 会按目标模型规则整理"
                    />
                  </div>
                </div>
                <div v-else class="prompt-composer__empty">
                  当前媒体类型和模型没有匹配的模板。
                  <Button
                    link
                    :confirm="false"
                    @click="router.push('/visual-prompt-templates')"
                    >去配置视觉提示词</Button
                  >
                </div>
                <p v-if="composeNotes" class="prompt-composer__notes">
                  {{ composeNotes }}
                </p>
              </template>
              <div v-else class="prompt-composer__empty">
                当前账号没有视觉提示词模板查看权限，仍可手动填写下方参数。
              </div>
            </section>

            <div v-if="current?.inputBindings.length" class="parameter-list">
              <div
                v-for="binding in current.inputBindings"
                :key="binding.key"
                class="parameter-item"
                :class="{
                  'parameter-item--full': binding.type === 'textarea',
                }"
              >
                <label
                  >{{ binding.label }}<i v-if="binding.required">*</i></label
                >
                <Input
                  v-if="binding.type === 'text'"
                  :model-value="String(parameters[binding.key] ?? '')"
                  :placeholder="binding.hint || `请输入${binding.label}`"
                  @update:model-value="parameters[binding.key] = $event"
                />
                <Input
                  v-else-if="binding.type === 'textarea'"
                  :model-value="String(parameters[binding.key] ?? '')"
                  mode="textarea"
                  :rows="6"
                  :placeholder="binding.hint || `请输入${binding.label}`"
                  @update:model-value="parameters[binding.key] = $event"
                />
                <InputNumber
                  v-else-if="
                    binding.type === 'number' || binding.type === 'seed'
                  "
                  :model-value="
                    typeof parameters[binding.key] === 'number'
                      ? (parameters[binding.key] as number)
                      : null
                  "
                  mode="integer"
                  :min="binding.min"
                  :max="binding.max"
                  :placeholder="
                    binding.type === 'seed'
                      ? '留空则每次随机'
                      : `请输入${binding.label}`
                  "
                  @update:model-value="parameters[binding.key] = $event"
                />
                <Switch
                  v-else-if="binding.type === 'boolean'"
                  :model-value="parameters[binding.key] === true"
                  active-text="是"
                  inactive-text="否"
                  @update:model-value="parameters[binding.key] = $event"
                />
                <Select
                  v-else-if="binding.type === 'select'"
                  :model-value="String(parameters[binding.key] ?? '')"
                  :options="
                    (binding.options || []).map((item) => ({
                      value: String(item.value),
                      text: item.label,
                    }))
                  "
                  :placeholder="`请选择${binding.label}`"
                  @update:model-value="parameters[binding.key] = $event"
                />
                <Select
                  v-else-if="binding.type === 'image'"
                  :model-value="String(parameters[binding.key] ?? '')"
                  :options="materialOptions"
                  :placeholder="
                    materials.length
                      ? `请选择${binding.label}`
                      : '请先到 ComfyUI 素材上传图片'
                  "
                  @update:model-value="parameters[binding.key] = $event"
                />
                <small v-if="binding.hint">{{ binding.hint }}</small>
              </div>
            </div>
            <div v-else class="parameter-empty">
              <el-icon><Setting /></el-icon>
              <div>
                <strong>此工作流无需填写参数</strong>
                <p>将直接使用工作流节点中保存的默认值执行。</p>
              </div>
            </div>

            <div class="submit-bar">
              <span
                >关闭页面不会中断任务，生成结果会自动保存到 ComfyUI
                素材库。</span
              >
              <div class="submit-bar__actions">
                <Button :confirm="false" @click="createVisible = false">
                  取消
                </Button>
                <Button
                  perm="ComfyTask.create"
                  icon="MagicStick"
                  :loading="submitting"
                  @click="submit"
                >
                  开始生成
                </Button>
              </div>
            </div>
          </main>
        </section>
      </div>
    </Dialog>
  </PageContainer>
</template>

<style scoped>
.create-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
}

.setup-empty h3,
.setup-empty p,
.panel-heading h3,
.panel-heading p,
.selected-workflow h3,
.selected-workflow p,
.parameter-empty p,
.setup-step p {
  margin: 0;
}

.setup-empty {
  padding: 28px;
  border: 1px solid var(--color-border-light);
  border-radius: 14px;
  background: var(--color-bg-container);
}

.setup-empty__header {
  display: flex;
  align-items: center;
  gap: 14px;
}

.setup-empty__mark {
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  place-items: center;
  border-radius: 12px;
  background: #ecf5ff;
  color: var(--color-primary);
  font-size: 22px;
}

.setup-empty h3,
.panel-heading h3,
.selected-workflow h3 {
  color: var(--color-text-primary);
  font-size: var(--font-size-lg);
}

.setup-empty__header p,
.panel-heading p,
.selected-workflow p,
.parameter-empty p,
.setup-step p {
  margin-top: 5px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.6;
}

.setup-steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 24px;
}

.setup-step {
  display: flex;
  min-width: 0;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  background: #fafcff;
}

.setup-step > span {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  place-items: center;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  color: #fff;
  font-size: var(--font-size-xs);
  font-weight: 600;
}

.setup-step strong {
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
}

.setup-empty__actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px solid var(--color-border-light);
}

.setup-empty__actions > span {
  margin-left: 4px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.creation-workspace {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  min-height: 460px;
  overflow: hidden;
  border: 1px solid var(--color-border-light);
  border-radius: 14px;
  background: var(--color-bg-container);
}

.workflow-panel {
  min-width: 0;
  padding: 20px;
  border-right: 1px solid var(--color-border-light);
  background: #f7f9fc;
}

.panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.panel-heading > span {
  min-width: 24px;
  padding: 2px 7px;
  border-radius: var(--radius-full);
  background: #e9eef6;
  color: var(--color-text-regular);
  font-size: var(--font-size-xs);
  text-align: center;
}

.workflow-list {
  display: grid;
  gap: var(--space-sm);
  max-height: 560px;
  overflow-y: auto;
}

.workflow-card {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 18px;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
}

.workflow-card:hover {
  border-color: #c6e2ff;
  background: var(--color-bg-container);
}

.workflow-card.is-active {
  border-color: #a0cfff;
  background: var(--color-bg-container);
  box-shadow: var(--shadow-sm);
}

.workflow-card__icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 10px;
  background: #ecf5ff;
  color: var(--color-primary);
  font-size: 18px;
}

.workflow-card__icon.is-video {
  background: #fdf6ec;
  color: var(--color-warning);
}

.workflow-card__content {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.workflow-card__content strong {
  overflow: hidden;
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-card__content small {
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-card__check {
  color: var(--color-primary);
}

.parameter-panel {
  min-width: 0;
  padding: 24px;
}

.selected-workflow {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-lg);
  padding-bottom: 18px;
  border-bottom: 1px solid var(--color-border-light);
}

.selected-workflow h3 {
  margin-top: var(--space-sm);
}

.selected-workflow__meta {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.output-badge {
  padding: 3px 9px;
  border-radius: var(--radius-full);
  background: #ecf5ff;
  color: var(--color-primary);
}

.output-badge.is-video {
  background: #fdf6ec;
  color: var(--color-warning);
}

.selected-workflow__parameter-count {
  display: flex;
  min-width: 68px;
  flex-direction: column;
  align-items: flex-end;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.selected-workflow__parameter-count strong {
  color: var(--color-primary);
  font-size: 24px;
  line-height: 1.2;
}

.prompt-composer {
  margin-top: 20px;
  padding: 16px;
  border: 1px solid #c6e2ff;
  border-radius: var(--radius-lg);
  background: #f5f9ff;
}

.prompt-composer__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-md);
}

.prompt-composer h4,
.prompt-composer p {
  margin: 0;
}

.prompt-composer h4 {
  color: var(--color-text-primary);
  font-size: var(--font-size-base);
}

.prompt-composer__heading p,
.prompt-composer__notes,
.prompt-composer__empty {
  margin-top: 5px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.6;
}

.prompt-composer__form {
  display: grid;
  grid-template-columns: minmax(220px, 0.7fr) minmax(0, 1.3fr);
  gap: 14px;
  margin-top: 14px;
}

.prompt-composer__form > div {
  display: grid;
  align-content: start;
  gap: var(--space-sm);
}

.prompt-composer__form label {
  color: var(--color-text-primary);
  font-size: var(--font-size-xs);
  font-weight: 600;
}

.prompt-composer__notes {
  padding-top: 10px;
  border-top: 1px dashed #c6e2ff;
}

.parameter-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px 20px;
  margin-top: 22px;
}

.parameter-item {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: var(--space-sm);
}

.parameter-item--full {
  grid-column: 1 / -1;
}

.parameter-item label {
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.parameter-item label i {
  margin-left: 4px;
  color: var(--color-danger);
  font-style: normal;
}

.parameter-item small {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.parameter-empty {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 22px;
  padding: 16px;
  border-radius: var(--radius-lg);
  background: #f7f9fc;
}

.parameter-empty > .el-icon {
  color: var(--color-primary);
  font-size: 22px;
}

.parameter-empty strong {
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
}

.submit-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-md);
  margin-top: 24px;
  padding-top: 18px;
  border-top: 1px solid var(--color-border-light);
}

.submit-bar span {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.6;
}

.submit-bar__actions {
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-sm);
}

@media (max-width: 960px) {
  .creation-workspace {
    grid-template-columns: 240px minmax(0, 1fr);
  }

  .parameter-list {
    grid-template-columns: minmax(0, 1fr);
  }

  .prompt-composer__form {
    grid-template-columns: minmax(0, 1fr);
  }

  .parameter-item--full {
    grid-column: auto;
  }
}

@media (max-width: 720px) {
  .setup-empty,
  .parameter-panel,
  .workflow-panel {
    padding: var(--space-md);
  }

  .setup-empty__actions,
  .submit-bar,
  .selected-workflow {
    align-items: stretch;
    flex-direction: column;
  }

  .submit-bar__actions {
    justify-content: flex-end;
  }

  .prompt-composer__heading {
    align-items: stretch;
    flex-direction: column;
  }

  .setup-steps,
  .creation-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .workflow-panel {
    border-right: 0;
    border-bottom: 1px solid var(--color-border-light);
  }

  .workflow-list {
    max-height: 260px;
  }

  .selected-workflow__parameter-count {
    align-items: flex-start;
  }
}
</style>
