<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { ElMessage } from "element-plus";
import { useRouter } from "vue-router";
import PageContainer from "@/components/PageContainer.vue";
import Dialog from "@/components/Dialog.vue";
import Button from "@/components/Button.vue";
import Input from "@/components/Input.vue";
import InputNumber from "@/components/InputNumber.vue";
import Select from "@/components/Select.vue";
import Switch from "@/components/Switch.vue";
import UploadFile from "@/components/UploadFile.vue";
import UploadImage from "@/components/UploadImage.vue";
import TaskTable from "@/views/comfy-task/TaskTable.vue";
import type { UploadResult } from "@/api/upload";
import {
  composeComfyWorkflowPrompt,
  createComfyTask,
  getComfyMaterialOptions,
  getComfyTask,
  getComfyWorkflowPromptTask,
  getComfyWorkflowOptions,
  uploadComfyTaskInput,
  type ComfyInputBinding,
  type ComfyMaterialOption,
  type ComfyTask,
  type ComfyWorkflowOption,
} from "@/api/comfyUi";
import { buildComfyTaskParameterDraft } from "./recreateTask";

const router = useRouter();
const taskTableRef = ref<{ refresh: () => Promise<void> }>();
const createVisible = ref(false);
const loading = ref(false);
const submitting = ref(false);
const workflows = ref<ComfyWorkflowOption[]>([]);
const materials = ref<ComfyMaterialOption[]>([]);
const workflowId = ref<string | null>("");
const parameters = reactive<Record<string, unknown>>({});
const stagedMediaFiles = reactive<Record<string, File | undefined>>({});
const mediaPreviewUrls = reactive<Record<string, string | null>>({});
const mediaFileNames = reactive<Record<string, string>>({});
const creativeIdea = ref("");
const composing = ref(false);
const composeStage = ref("");
const composeNotes = ref("");
const recreateSourceTaskId = ref<number | null>(null);
let composeRunToken = 0;
const promptRoles = ["mainPrompt", "positivePrompt", "negativePrompt"];
const current = computed(
  () =>
    workflows.value.find((item) => item.id === Number(workflowId.value)) ||
    null,
);
const promptBindings = computed(() =>
  (current.value?.inputBindings || []).filter((binding) =>
    promptRoles.includes(binding.semanticRole || "normal"),
  ),
);
function isMediaBinding(binding: ComfyInputBinding) {
  return binding.type === "image" || binding.type === "video";
}
function releaseMediaPreview(key: string) {
  const previewUrl = mediaPreviewUrls[key];
  if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
}
function clearMediaState(clearParameters = false) {
  const keys = new Set([
    ...Object.keys(stagedMediaFiles),
    ...Object.keys(mediaPreviewUrls),
    ...Object.keys(mediaFileNames),
  ]);
  for (const key of keys) {
    releaseMediaPreview(key);
    delete stagedMediaFiles[key];
    delete mediaPreviewUrls[key];
    delete mediaFileNames[key];
    if (clearParameters) parameters[key] = "";
  }
}
function initializeMediaState() {
  for (const binding of current.value?.inputBindings || []) {
    if (!isMediaBinding(binding)) continue;
    const materialId = Number(parameters[binding.key]);
    const material = materials.value.find((item) => item.id === materialId);
    mediaPreviewUrls[binding.key] = material?.fileUrl || "";
    mediaFileNames[binding.key] = material?.name || "";
  }
}
async function stageMediaFile(
  binding: ComfyInputBinding,
  file: File,
): Promise<UploadResult> {
  releaseMediaPreview(binding.key);
  const previewUrl = URL.createObjectURL(file);
  stagedMediaFiles[binding.key] = file;
  parameters[binding.key] = "";
  mediaPreviewUrls[binding.key] = previewUrl;
  mediaFileNames[binding.key] = file.name;
  return {
    url: previewUrl,
    fileName: file.name,
    originalName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
  };
}
function removeMediaFile(binding: ComfyInputBinding) {
  releaseMediaPreview(binding.key);
  delete stagedMediaFiles[binding.key];
  mediaPreviewUrls[binding.key] = "";
  mediaFileNames[binding.key] = "";
  parameters[binding.key] = "";
}
function hasBindingValue(binding: ComfyInputBinding) {
  if (isMediaBinding(binding) && stagedMediaFiles[binding.key]) return true;
  const value = parameters[binding.key];
  return value !== "" && value !== null && value !== undefined;
}
async function prepareTaskParameters() {
  const prepared = { ...parameters };
  for (const binding of current.value?.inputBindings || []) {
    if (!isMediaBinding(binding)) continue;
    const file = stagedMediaFiles[binding.key];
    if (!file) continue;
    const material = await uploadComfyTaskInput(file, file.name);
    prepared[binding.key] = material.id;
    parameters[binding.key] = material.id;
    materials.value = [
      {
        id: material.id,
        name: material.name,
        sourceType: material.sourceType,
        mediaType: material.mediaType,
        fileUrl: material.fileUrl,
        mimeType: material.mimeType,
      },
      ...materials.value.filter((item) => item.id !== material.id),
    ];
    releaseMediaPreview(binding.key);
    delete stagedMediaFiles[binding.key];
    mediaPreviewUrls[binding.key] = material.fileUrl || "";
    mediaFileNames[binding.key] = material.name;
  }
  return prepared;
}
function initializeForm(parameterSnapshot?: Record<string, unknown>) {
  composeRunToken += 1;
  composing.value = false;
  composeStage.value = "";
  clearMediaState();
  Object.keys(parameters).forEach((key) => delete parameters[key]);
  const draft = buildComfyTaskParameterDraft(
    current.value?.inputBindings || [],
    parameterSnapshot,
    new Set(materials.value.map((item) => item.id)),
  );
  Object.assign(parameters, draft.parameters);
  initializeMediaState();
  creativeIdea.value = "";
  composeNotes.value = "";
  return draft;
}

watch(workflowId, () => initializeForm());

function openCreate() {
  recreateSourceTaskId.value = null;
  createVisible.value = true;
  initializeForm();
}

async function openRecreate(row: ComfyTask) {
  recreateSourceTaskId.value = row.id;
  createVisible.value = true;
  initializeForm();
  loading.value = true;
  try {
    const task = await getComfyTask(row.id);
    const workflow = workflows.value.find(
      (item) => item.id === task.workflowId,
    );
    if (!workflow) {
      ElMessage.warning("原任务工作流已停用或不可用，无法再次创作");
      createVisible.value = false;
      recreateSourceTaskId.value = null;
      return;
    }
    workflowId.value = String(workflow.id);
    await nextTick();
    const draft = initializeForm(task.parameterSnapshot || {});
    if (draft.missingMaterialLabels.length) {
      ElMessage.warning(
        `${draft.missingMaterialLabels.join("、")}引用的原素材已不可用，请重新上传`,
      );
    }
  } catch {
    createVisible.value = false;
    recreateSourceTaskId.value = null;
  } finally {
    loading.value = false;
  }
}

async function composePrompt() {
  if (!current.value?.visualPromptTemplateId) {
    ElMessage.warning("该工作流尚未建立提示词总结");
    return;
  }
  if (!creativeIdea.value.trim()) {
    ElMessage.warning("请输入本次创作想法");
    return;
  }
  const runToken = ++composeRunToken;
  composing.value = true;
  composeStage.value = "正在提交";
  try {
    let task = await composeComfyWorkflowPrompt(current.value.id, {
      idea: creativeIdea.value.trim(),
      requestId: crypto.randomUUID(),
    });
    while (["pending", "running"].includes(task.status)) {
      if (runToken !== composeRunToken) return;
      composeStage.value = task.stage;
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
      task = await getComfyWorkflowPromptTask(task.id);
    }
    if (runToken !== composeRunToken) return;
    if (task.status !== "succeeded") {
      ElMessage.error(task.errorMessage || "提示词转换失败，请检查配置后重试");
      return;
    }
    const result = task.result;
    if (
      !result ||
      !("positivePrompt" in result) ||
      typeof result.positivePrompt !== "string" ||
      !result.positivePrompt.trim()
    ) {
      ElMessage.error("提示词任务没有返回可用结果，请重新生成");
      return;
    }
    for (const binding of promptBindings.value) {
      if (
        binding.semanticRole === "mainPrompt" ||
        binding.semanticRole === "positivePrompt"
      ) {
        parameters[binding.key] = result.positivePrompt;
      }
      if (binding.semanticRole === "negativePrompt") {
        parameters[binding.key] = result.negativePrompt || "";
      }
    }
    composeNotes.value = result.notes || "";
    ElMessage.success("工作流提示词已生成，可继续手动调整");
  } finally {
    if (runToken === composeRunToken) {
      composing.value = false;
      composeStage.value = "";
    }
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
  const primaryPromptBinding = promptBindings.value.find(
    (binding) =>
      binding.semanticRole === "mainPrompt" ||
      binding.semanticRole === "positivePrompt",
  );
  if (
    current.value.visualPromptTemplateId &&
    primaryPromptBinding &&
    !String(parameters[primaryPromptBinding.key] || "").trim()
  ) {
    ElMessage.warning(
      creativeIdea.value.trim()
        ? "请先点击“转换提示词”，确认结果后再提交"
        : "请输入创作想法并转换为工作流提示词",
    );
    return;
  }
  const missing = current.value.inputBindings.find(
    (binding) => binding.required && !hasBindingValue(binding),
  );
  if (missing) {
    ElMessage.warning(`请填写${missing.label}`);
    return;
  }
  submitting.value = true;
  try {
    const taskParameters = await prepareTaskParameters();
    const task = await createComfyTask({
      workflowId: current.value.id,
      parameters: taskParameters,
      requestId: crypto.randomUUID(),
    });
    ElMessage.success(
      recreateSourceTaskId.value
        ? `已基于任务 #${recreateSourceTaskId.value} 创建新任务 #${task.id}`
        : `任务 #${task.id} 已提交`,
    );
    createVisible.value = false;
    recreateSourceTaskId.value = null;
    await taskTableRef.value?.refresh();
  } finally {
    submitting.value = false;
  }
}
watch(createVisible, (visible) => {
  if (!visible) clearMediaState();
});
onBeforeUnmount(() => clearMediaState());
onMounted(load);
</script>

<template>
  <PageContainer title="创作任务">
    <TaskTable ref="taskTableRef" @recreate="openRecreate">
      <template #toolbar>
        <Button perm="ComfyTask.create" icon="Plus" @click="openCreate">
          新建创作任务
        </Button>
      </template>
    </TaskTable>

    <Dialog
      v-model="createVisible"
      :title="
        recreateSourceTaskId
          ? `基于任务 #${recreateSourceTaskId} 再次创作`
          : '新建创作任务'
      "
      width="1040px"
      body-max-height="76vh"
      :show-footer="false"
    >
      <div v-loading="loading" class="create-page">
        <el-alert
          v-if="recreateSourceTaskId"
          type="info"
          :closable="false"
          show-icon
          title="已带入原任务参数；请调整提示词或其它参数后再提交。提交会创建新任务，原任务和结果保持不变。"
        />
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
                  <h4>AI 提示词转换</h4>
                  <p>
                    按
                    {{ current?.targetModel || "通用模型" }}
                    的规则生成工作流所需提示词，并只回填已绑定的参数；负向提示词仅在工作流支持时生成。
                  </p>
                </div>
                <Button
                  v-if="current?.visualPromptTemplateId"
                  :confirm="false"
                  icon="MagicStick"
                  :loading="composing"
                  @click="composePrompt"
                  >{{
                    composing ? composeStage || "转换中" : "转换提示词"
                  }}</Button
                >
              </div>
              <div
                v-if="current?.visualPromptTemplateId"
                class="prompt-composer__form"
              >
                <div class="prompt-composer__idea">
                  <label>创作想法</label>
                  <Input
                    v-model="creativeIdea"
                    mode="textarea"
                    :rows="3"
                    placeholder="直接描述你想生成的主体、场景、风格、情绪或镜头运动"
                  />
                  <small>
                    系统会使用该工作流绑定的提示词总结和 AI
                    配置进行转换；尚未完成 AI
                    提炼时，以工作流中的原始提示词作为参考格式。
                  </small>
                </div>
              </div>
              <div v-else class="prompt-composer__empty">
                该工作流没有绑定提示词总结，仍可手工填写下方提示词。也可以前往“提示词总结”选择该工作流并完成
                AI 提炼。
              </div>
              <p v-if="composeNotes" class="prompt-composer__notes">
                {{ composeNotes }}
              </p>
            </section>

            <div v-if="current?.inputBindings.length" class="parameter-list">
              <div
                v-for="binding in current.inputBindings"
                :key="`${current.id}:${binding.key}`"
                class="parameter-item"
                :class="{
                  'parameter-item--full': binding.type === 'textarea',
                  'parameter-item--media':
                    binding.type === 'image' || binding.type === 'video',
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
                <UploadImage
                  v-else-if="binding.type === 'image'"
                  v-model="mediaPreviewUrls[binding.key]"
                  accept="image/*"
                  :max-size-mb="20"
                  :upload-request="(file) => stageMediaFile(binding, file)"
                  @remove="removeMediaFile(binding)"
                />
                <UploadFile
                  v-else-if="binding.type === 'video'"
                  v-model="mediaPreviewUrls[binding.key]"
                  v-model:name="mediaFileNames[binding.key]"
                  accept="video/*"
                  :max-size-mb="100"
                  drag-text="将视频拖到此处，或点击选择本地视频"
                  :upload-request="(file) => stageMediaFile(binding, file)"
                  @remove="removeMediaFile(binding)"
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

.prompt-composer__form small {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.5;
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

.parameter-item--media {
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

  .parameter-item--full,
  .parameter-item--media {
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
