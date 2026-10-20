<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { useRouter } from "vue-router";
import PageContainer from "@/components/PageContainer.vue";
import Button from "@/components/Button.vue";
import Input from "@/components/Input.vue";
import InputNumber from "@/components/InputNumber.vue";
import Select from "@/components/Select.vue";
import Switch from "@/components/Switch.vue";
import {
  createComfyTask,
  getComfyMaterialOptions,
  getComfyWorkflowOptions,
  type ComfyMaterial,
  type ComfyWorkflowOption,
} from "@/api/comfyUi";

const router = useRouter();
const loading = ref(false);
const submitting = ref(false);
const workflows = ref<ComfyWorkflowOption[]>([]);
const materials = ref<ComfyMaterial[]>([]);
const workflowId = ref<string | null>("");
const parameters = reactive<Record<string, unknown>>({});
const createdTaskId = ref<number | null>(null);
const workflowOptions = computed(() =>
  workflows.value.map((item) => ({
    value: String(item.id),
    text: `${item.name} · ${item.outputType === "video" ? "视频" : "图片"} · v${item.version}`,
  })),
);
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

watch(workflowId, () => {
  Object.keys(parameters).forEach((key) => delete parameters[key]);
  for (const binding of current.value?.inputBindings || []) {
    parameters[binding.key] =
      binding.defaultValue ?? (binding.type === "boolean" ? false : "");
  }
  createdTaskId.value = null;
});
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
    ElMessage.warning("请选择已发布的工作流");
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
    createdTaskId.value = task.id;
    ElMessage.success(`任务 #${task.id} 已提交`);
  } finally {
    submitting.value = false;
  }
}
onMounted(load);
</script>

<template>
  <PageContainer title="ComfyUI 创作">
    <div v-loading="loading" class="create-layout">
      <section class="create-card">
        <div class="section-heading">
          <div>
            <h2>选择工作流</h2>
            <p>只显示管理员已发布、且执行服务处于启用状态的工作流模板。</p>
          </div>
          <Button @click="router.push('/comfyui/tasks')">查看生成记录</Button>
        </div>
        <el-empty
          v-if="!workflows.length"
          description="暂无可用工作流，请先配置 ComfyUI 服务并发布工作流"
        />
        <template v-else>
          <Select
            v-model="workflowId"
            :options="workflowOptions"
            :clearable="false"
            placeholder="请选择工作流"
          />
          <p v-if="current?.description" class="workflow-description">
            {{ current.description }}
          </p>
          <div class="parameter-list">
            <div
              v-for="binding in current?.inputBindings || []"
              :key="binding.key"
              class="parameter-item"
            >
              <label>{{ binding.label }}<i v-if="binding.required">*</i></label>
              <Input
                v-if="binding.type === 'text'"
                :model-value="String(parameters[binding.key] ?? '')"
                @update:model-value="parameters[binding.key] = $event"
                :placeholder="binding.hint || `请输入${binding.label}`"
              />
              <Input
                v-else-if="binding.type === 'textarea'"
                :model-value="String(parameters[binding.key] ?? '')"
                @update:model-value="parameters[binding.key] = $event"
                mode="textarea"
                :rows="6"
                :placeholder="binding.hint || `请输入${binding.label}`"
              />
              <InputNumber
                v-else-if="binding.type === 'number' || binding.type === 'seed'"
                :model-value="
                  typeof parameters[binding.key] === 'number'
                    ? (parameters[binding.key] as number)
                    : null
                "
                @update:model-value="parameters[binding.key] = $event"
                mode="integer"
                :min="binding.min"
                :max="binding.max"
                :placeholder="
                  binding.type === 'seed'
                    ? '留空则每次随机'
                    : `请输入${binding.label}`
                "
              />
              <Switch
                v-else-if="binding.type === 'boolean'"
                :model-value="parameters[binding.key] === true"
                @update:model-value="parameters[binding.key] = $event"
                active-text="是"
                inactive-text="否"
              />
              <Select
                v-else-if="binding.type === 'select'"
                :model-value="String(parameters[binding.key] ?? '')"
                @update:model-value="parameters[binding.key] = $event"
                :options="
                  (binding.options || []).map((item) => ({
                    value: String(item.value),
                    text: item.label,
                  }))
                "
                :placeholder="`请选择${binding.label}`"
              />
              <Select
                v-else-if="binding.type === 'image'"
                :model-value="String(parameters[binding.key] ?? '')"
                @update:model-value="parameters[binding.key] = $event"
                :options="materialOptions"
                :placeholder="
                  materials.length
                    ? `请选择${binding.label}`
                    : '请先到 ComfyUI 素材上传图片'
                "
              />
              <small v-if="binding.hint">{{ binding.hint }}</small>
            </div>
          </div>
          <div class="submit-bar">
            <span>提交后任务在后台继续执行，关闭页面不会中断 ComfyUI。</span>
            <Button
              perm="ComfyTask.create"
              icon="MagicStick"
              :loading="submitting"
              @click="submit"
            >
              开始生成
            </Button>
          </div>
          <div v-if="createdTaskId" class="task-created">
            <div>
              <strong>任务已进入处理队列</strong>
              <p>
                任务 #{{ createdTaskId }}，可在生成记录中查看真实状态和输出。
              </p>
            </div>
            <Button @click="router.push('/comfyui/tasks')">查看任务进度</Button>
          </div>
        </template>
      </section>
    </div>
  </PageContainer>
</template>

<style scoped>
.create-layout {
  max-width: 980px;
  margin: 0 auto;
}
.create-card {
  border: 1px solid #dce3ed;
  border-radius: 12px;
  padding: 24px;
  background: #fff;
}
.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.section-heading h2 {
  margin: 0 0 7px;
  font-size: 18px;
}
.section-heading p,
.workflow-description {
  margin: 0;
  color: #606266;
  line-height: 1.6;
}
.workflow-description {
  margin-top: 12px;
  padding: 10px 12px;
  background: #f5f7fa;
  border-radius: 7px;
}
.parameter-list {
  display: grid;
  gap: 18px;
  margin-top: 24px;
}
.parameter-item {
  display: grid;
  gap: 8px;
}
.parameter-item label {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}
.parameter-item label i {
  color: #f56c6c;
  font-style: normal;
  margin-left: 4px;
}
.parameter-item small {
  color: #909399;
}
.submit-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-top: 28px;
  padding-top: 18px;
  border-top: 1px solid #ebeef5;
}
.submit-bar span {
  color: #909399;
  font-size: 13px;
}
.task-created {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 20px;
  padding: 16px;
  border: 1px solid #b3e19d;
  border-radius: 9px;
  background: #f0f9eb;
}
.task-created strong {
  color: #529b2e;
}
.task-created p {
  margin: 6px 0 0;
  color: #606266;
}
@media (max-width: 680px) {
  .section-heading,
  .submit-bar {
    flex-direction: column;
    align-items: stretch;
  }
  .task-created {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
