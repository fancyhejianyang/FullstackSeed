<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useSubmissionGuard } from "@/views/hot-topic/submissionGuard";
import { ElMessage, type FormRules } from "element-plus";
import Dialog from "@/components/Dialog.vue";
import Form, { type FormField } from "@/components/Form.vue";
import Button from "@/components/Button.vue";
import {
  createHotSource,
  updateHotSource,
  getHotSource,
  NETEASE_NEWS_API_URL,
  safeSourceUrl,
  sourceKindLabels,
  sourceAccessLabels,
  type HotSource,
  type HotSourceForm,
} from "@/api/hotTopic";
const props = defineProps<{ row: HotSource | null }>();
const emit = defineEmits<{ success: [] }>();
const visible = defineModel<boolean>("visible", { required: true });
const loading = ref(false),
  submitting = ref(false),
  failed = ref(false);
const formRef = ref<InstanceType<typeof Form>>();
const initial = (): HotSourceForm => ({
  name: "",
  kind: "douyinHot",
  accessMode: "page",
  url: "",
  isEnabled: false,
  description: "",
});
const form = reactive(initial());
let epoch = 0;
let hydrating = false;
const fields = computed<FormField[]>(() => [
  { prop: "name", label: "来源名称", type: "input" },
  {
    prop: "kind",
    label: "来源类型",
    type: "select",
    options: Object.entries(sourceKindLabels).map(([value, label]) => ({
      value,
      label,
    })),
  },
  ...(form.kind === "neteaseNews"
    ? []
    : [
        {
          prop: "accessMode",
          label: "获取方式",
          type: "select" as const,
          options: Object.entries(sourceAccessLabels).map(([value, label]) => ({
            value,
            label,
          })),
        },
      ]),
  {
    prop: "url",
    label: form.kind === "neteaseNews" ? "新闻接口（固定）" : "来源地址",
    type: "input",
    placeholder:
      form.kind === "neteaseNews" ? NETEASE_NEWS_API_URL : "https://…",
    componentProps:
      form.kind === "neteaseNews" ? { readonly: true } : undefined,
    hint:
      form.kind === "neteaseNews"
        ? "系统固定读取网易国内新闻接口，仅解析“国内”分类的标题、原文链接与发布时间。"
        : "可填写平台官方热榜或合规聚合页面的公开 HTTPS 地址；不绕过登录、验证码或访问限制。",
  },
  { prop: "isEnabled", label: "启用状态", component: "Switch" },
  { prop: "description", label: "说明", type: "textarea", rows: 3 },
]);
const rules: FormRules = {
  name: [
    { required: true, message: "请输入来源名称", trigger: "blur" },
    { max: 120, message: "名称最多 120 字", trigger: "blur" },
  ],
  url: [
    {
      validator: (_rule, value, done) =>
        safeSourceUrl(String(value || ""))
          ? done()
          : done(new Error("请输入不含账号密码的 HTTPS 地址")),
      trigger: "blur",
    },
  ],
  kind: [{ required: true, message: "请选择来源类型" }],
  accessMode: [{ required: true, message: "请选择获取方式" }],
};
watch(
  () => form.kind,
  (kind, previousKind) => {
    if (hydrating) return;
    if (kind === "neteaseNews") {
      form.accessMode = "page";
      form.url = NETEASE_NEWS_API_URL;
      if (!form.name.trim()) form.name = "网易国内新闻";
    } else if (previousKind === "neteaseNews") {
      form.url = "";
    }
  },
  { flush: "sync" },
);
function fillForm(values: HotSourceForm) {
  hydrating = true;
  Object.assign(
    form,
    values,
    values.kind === "neteaseNews"
      ? { url: NETEASE_NEWS_API_URL, accessMode: "page" }
      : {},
  );
  hydrating = false;
}
async function load() {
  const sequence = ++epoch;
  failed.value = false;
  fillForm(initial());
  if (!props.row) {
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const row = await getHotSource(props.row.id);
    if (sequence !== epoch || !visible.value) return;
    fillForm({
      name: row.name,
      kind: row.kind,
      accessMode: row.accessMode,
      url: row.url,
      isEnabled: Boolean(row.isEnabled),
      description: row.description,
    });
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
  submitting.value = true;
  try {
    const data = {
      ...form,
      ...(form.kind === "neteaseNews"
        ? { url: NETEASE_NEWS_API_URL, accessMode: "page" as const }
        : {}),
      isEnabled: Boolean(form.isEnabled),
    };
    if (props.row) await updateHotSource(props.row.id, data);
    else await createHotSource(data);
    ElMessage.success("来源配置已保存");
    visible.value = false;
    emit("success");
  } catch {
    /* The request interceptor shows the precise server error. */
  } finally {
    submitting.value = false;
  }
}
</script>
<template>
  <Dialog
    :model-value="visible"
    @update:model-value="close"
    :title="row ? '编辑热点来源' : '新增热点来源'"
    width="760px"
    :show-footer="false"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
  >
    <el-empty v-if="failed" description="来源配置读取失败，未载入旧数据"
      ><Button @click="load">重新读取</Button></el-empty
    >
    <Form
      v-else
      ref="formRef"
      v-model="form"
      v-loading="loading"
      :disabled="loading || submitting"
      :fields="fields"
      :rules="rules"
      label-position="top"
    >
    </Form>
    <template #footer
      ><Button :disabled="submitting" @click="close">取消</Button
      ><Button
        :perm="row ? 'HotTopicSource.update' : 'HotTopicSource.create'"
        :loading="submitting"
        :disabled="loading || failed"
        @click="submit"
        >保存配置</Button
      ></template
    >
  </Dialog>
</template>
