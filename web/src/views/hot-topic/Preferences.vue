<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useSubmissionGuard } from "./submissionGuard";
import { ElMessage, ElMessageBox, type FormRules } from "element-plus";
import Dialog from "@/components/Dialog.vue";
import Form, { type FormField } from "@/components/Form.vue";
import Button from "@/components/Button.vue";
import { useUserStore } from "@/stores/user";
import { scheduleValidationError } from "./preferenceValidation";
import {
  getHotPreference,
  saveHotPreference,
  getHotOptions,
  type HotPreference,
  type HotOptions,
} from "@/api/hotTopic";
const visible = defineModel<boolean>("visible", { required: true });
const emit = defineEmits<{ success: [] }>();
const formRef = ref<InstanceType<typeof Form>>();
const user = useUserStore();
const form = reactive<
  Omit<HotPreference, "sourceIds"> & { sourceIds: string[] }
>({
  aiConfigId: null,
  sourceIds: [],
  interests: "",
  exclusions: "",
  audience: "",
  writingStyle: "",
  lookbackHours: 24,
  maxResults: 10,
  scheduleEnabled: false,
  scheduleTime: "09:00",
});
const options = ref<HotOptions>({ aiConfigs: [], sources: [] });
const loading = ref(false),
  failed = ref(false),
  submitting = ref(false);
let epoch = 0;
let wasScheduled = false;
const sourceOptions = computed(() => {
  const rows = options.value.sources.map((source) => ({
    value: String(source.id),
    label: source.name,
  }));
  for (const id of form.sourceIds)
    if (!rows.some((item) => item.value === id))
      rows.push({ value: id, label: `来源 #${id}（已失效，请移除）` });
  return rows;
});
const configOptions = computed(() => {
  const rows = options.value.aiConfigs.map((item) => ({
    value: item.id,
    label: `${item.name} · ${item.model || "未设置模型"}`,
  }));
  if (form.aiConfigId && !rows.some((item) => item.value === form.aiConfigId))
    rows.push({
      value: form.aiConfigId,
      label: `AI 配置 #${form.aiConfigId}（已失效，请重选）`,
    });
  return rows;
});
const fields = computed<FormField[]>(() => [
  {
    prop: "aiConfigId",
    label: "热点发现 AI 配置",
    type: "select",
    options: configOptions,
    span: 2,
    hint: "可选，用于分析热点并按偏好推荐；未选择时仍可获取榜单。采集方式由系统按来源自动安排。",
  },
  {
    prop: "sourceIds",
    label: "热点来源",
    type: "selectMultiple",
    options: sourceOptions,
    span: 2,
    hint: "最多选择 5 个；留空时默认获取抖音热点。系统自动使用各来源适合的接口与补充策略。",
  },
  {
    prop: "interests",
    label: "我关注的主题",
    type: "textarea",
    rows: 3,
    span: 2,
    placeholder: "例如：科技行业、普通人的生活变化、具有讨论价值的社会事件",
    hint: "留空表示不限定兴趣主题；可先保存偏好，再补齐 AI 或来源配置。",
  },
  {
    prop: "exclusions",
    label: "我不想看到的内容",
    type: "textarea",
    rows: 2,
    span: 2,
    placeholder: "例如：明星私生活、重复营销、纯股价涨跌",
  },
  { prop: "audience", label: "目标读者", type: "input" },
  { prop: "writingStyle", label: "创作方向 / 口吻", type: "input" },
  {
    prop: "lookbackHours",
    label: "时间范围（小时）",
    component: "InputNumber",
    componentProps: { mode: "integer", min: 1, max: 168, required: true },
    hint: "1～168 小时；来源未提供发布时间时会保留“时间未知”，不推断为当天。",
  },
  {
    prop: "maxResults",
    label: "每次最多推荐",
    component: "InputNumber",
    componentProps: { mode: "integer", min: 1, max: 30, required: true },
    hint: "1～30 条；实际数量取决于可用结果，不为凑数补造。",
  },
  {
    prop: "scheduleEnabled",
    label: "每日自动获取",
    component: "Switch",
    componentProps: {
      disabled: !user.hasPermission("HotTopic.create") && !form.scheduleEnabled,
    },
    hint: "默认关闭。启用后按已保存的偏好自动获取和推荐，可能产生模型费用。",
  },
  {
    prop: "scheduleTime",
    label: "每日执行时间",
    type: "input",
    placeholder: "09:00",
    hint: "Asia/Shanghai（北京时间），24 小时制 HH:mm。服务运行时执行，关闭页面不影响任务。",
  },
]);
const rules: FormRules = {
  interests: [{ max: 4000, message: "关注主题最多 4000 字", trigger: "blur" }],
  exclusions: [{ max: 2000, message: "排除偏好最多 2000 字", trigger: "blur" }],
  audience: [{ max: 1000, message: "目标读者最多 1000 字", trigger: "blur" }],
  writingStyle: [
    { max: 1000, message: "创作方向最多 1000 字", trigger: "blur" },
  ],
  scheduleTime: [
    {
      pattern: /^(?:[01]\d|2[0-3]):[0-5]\d$/,
      message: "请按 HH:mm 输入时间，例如 09:00",
      trigger: "blur",
    },
  ],
  sourceIds: [
    {
      validator: (_rule, value: string[], done) =>
        value.length > 5 ? done(new Error("最多选择 5 个来源")) : done(),
      trigger: "change",
    },
  ],
};
async function load() {
  const sequence = ++epoch;
  loading.value = true;
  failed.value = false;
  try {
    const [saved, choices] = await Promise.all([
      getHotPreference(),
      getHotOptions(),
    ]);
    if (!visible.value || sequence !== epoch) return;
    Object.assign(form, {
      aiConfigId: saved.aiConfigId,
      sourceIds: saved.sourceIds.map(String),
      interests: saved.interests,
      exclusions: saved.exclusions,
      audience: saved.audience,
      writingStyle: saved.writingStyle,
      lookbackHours: saved.lookbackHours,
      maxResults: saved.maxResults,
      scheduleEnabled: Boolean(saved.scheduleEnabled),
      scheduleTime: saved.scheduleTime,
    });
    wasScheduled = Boolean(saved.scheduleEnabled);
    options.value = choices;
  } catch {
    if (sequence === epoch) failed.value = true;
  } finally {
    if (sequence === epoch) loading.value = false;
  }
}
watch(visible, (open) => {
  if (open) void load();
  else ++epoch;
});
onBeforeUnmount(() => ++epoch);
useSubmissionGuard(() => submitting.value);
function close() {
  if (!submitting.value) visible.value = false;
}
async function submit() {
  if (submitting.value || loading.value || failed.value) return;
  await formRef.value?.validate();
  const payload: HotPreference = {
    aiConfigId: form.aiConfigId,
    sourceIds: form.sourceIds.map(Number),
    interests: form.interests,
    exclusions: form.exclusions,
    audience: form.audience,
    writingStyle: form.writingStyle,
    lookbackHours: form.lookbackHours,
    maxResults: form.maxResults,
    scheduleEnabled: Boolean(form.scheduleEnabled),
    scheduleTime: form.scheduleTime,
  };
  const validationError = scheduleValidationError(
    payload,
    options.value,
    user.hasPermission("HotTopic.create"),
  );
  if (validationError) return void ElMessage.warning(validationError);
  if (form.scheduleEnabled && !wasScheduled) {
    try {
      await ElMessageBox.confirm(
        "启用后，系统将每天自动按保存配置执行获取和推荐，可能产生模型费用。是否启用？",
        "开启每日计划",
      );
    } catch {
      return;
    }
  }
  submitting.value = true;
  try {
    await saveHotPreference(payload);
    ElMessage.success("偏好与执行计划已保存");
    visible.value = false;
    emit("success");
  } catch {
    /* Retain the form; the request interceptor displays the error. */
  } finally {
    submitting.value = false;
  }
}
</script>
<template>
  <Dialog
    :model-value="visible"
    @update:model-value="close"
    title="选题偏好与每日计划"
    width="860px"
    :show-footer="false"
    :show-close="!submitting"
    :close-on-press-escape="!submitting"
  >
    <el-empty v-if="failed" description="偏好或可选配置读取失败，未允许覆盖保存"
      ><Button @click="load">重新读取</Button></el-empty
    >
    <template v-else>
      <Form
        ref="formRef"
        v-model="form"
        v-loading="loading"
        :disabled="loading || submitting"
        :fields="fields"
        :rules="rules"
        :columns="2"
        label-position="top"
      />
    </template>
    <template #footer
      ><Button :disabled="submitting" @click="close">取消</Button
      ><Button
        perm="HotTopic.update"
        :loading="submitting"
        :disabled="loading || failed"
        @click="submit"
        >保存偏好</Button
      ></template
    >
  </Dialog>
</template>
