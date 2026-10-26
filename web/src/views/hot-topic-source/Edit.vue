<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  reactive,
  ref,
  shallowRef,
  watch,
} from "vue";
import { useSubmissionGuard } from "@/views/hot-topic/submissionGuard";
import { ElMessage, type FormRules } from "element-plus";
import Dialog from "@/components/Dialog.vue";
import Form, { type FormField } from "@/components/Form.vue";
import Button from "@/components/Button.vue";
import {
  createHotSource,
  updateHotSource,
  getHotSource,
  safeSourceUrl,
  sourceKindLabels,
  type HotSource,
  type HotSourceForm,
} from "@/api/hotTopic";
import { DOUYIN_HOT_API_URL, fixedHotSourceUrl } from "@/api/hotTopicSources";
import { formatDateTime } from "@/utils/format";
import { readCookieFile, validateCookieFile } from "./cookieFile";
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
  url: DOUYIN_HOT_API_URL,
  isEnabled: false,
  description: "",
});
const form = reactive(initial());
const fixedSourceUrl = computed(() => fixedHotSourceUrl(form.kind));
const cookieInput = ref<HTMLInputElement>();
const cookieFile = shallowRef<File | null>(null);
const cookieError = ref("");
const savedHasCookie = ref(false);
const savedCookieUpdatedAt = ref<string | null>(null);
const clearCookie = ref(false);
const cookieStatus = computed(() => {
  if (cookieFile.value) return `待保存文件：${cookieFile.value.name}`;
  if (clearCookie.value) return "已标记清除，保存配置后生效";
  if (!savedHasCookie.value) return "尚未配置 Cookie 文件";
  const time = savedCookieUpdatedAt.value
    ? formatDateTime(savedCookieUpdatedAt.value)
    : "";
  return time ? `已配置 · 更新于 ${time}` : "已配置";
});
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
  {
    prop: "url",
    label: fixedSourceUrl.value ? "来源接口（固定）" : "来源地址",
    type: "input",
    placeholder: fixedSourceUrl.value || "https://…",
    componentProps: fixedSourceUrl.value ? { readonly: true } : undefined,
    hint:
      form.kind === "douyinHot"
        ? "系统从固定抖音热搜接口读取 data.word_list 榜单，无需选择获取方式。"
        : form.kind === "neteaseNews"
          ? "系统固定读取网易国内新闻接口，仅解析“国内”分类的标题、原文链接与发布时间。"
          : "可填写微博官方热榜或合规聚合页面的公开 HTTPS 地址；系统自动采集，并按需要使用备用接口或联网补充。",
  },
  ...(form.kind === "douyinHot"
    ? [
        {
          prop: "cookieFile",
          label: "抖音 Cookie 文件",
          slot: true,
          hint: "登录抖音后导出 Netscape 格式 cookies.txt（UTF-8，最大 64 KB）。选择文件不会上传，保存配置后加密保存，仅用于抖音固定热搜接口；不回显内容或提供下载。Cookie 失效时请重新导出并替换，不要上传他人的登录凭据。",
        },
      ]
    : []),
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
};
watch(
  () => form.kind,
  (kind, previousKind) => {
    if (hydrating) return;
    resetCookieSelection();
    const url = fixedHotSourceUrl(kind);
    if (url) {
      form.url = url;
      if (!form.name.trim())
        form.name = kind === "douyinHot" ? "抖音热点" : "网易国内新闻";
    } else if (fixedHotSourceUrl(previousKind)) {
      form.url = "";
    }
  },
  { flush: "sync" },
);
function fillForm(values: HotSourceForm) {
  const url = fixedHotSourceUrl(values.kind);
  hydrating = true;
  Object.assign(form, values, url ? { url } : {});
  hydrating = false;
}
async function load() {
  const sequence = ++epoch;
  resetCookieSelection();
  savedHasCookie.value = false;
  savedCookieUpdatedAt.value = null;
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
    savedHasCookie.value = row.kind === "douyinHot" && Boolean(row.hasCookie);
    savedCookieUpdatedAt.value = row.cookieUpdatedAt ?? null;
    fillForm({
      name: row.name,
      kind: row.kind,
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
  else {
    ++epoch;
    resetCookieSelection();
    savedHasCookie.value = false;
    savedCookieUpdatedAt.value = null;
  }
});
watch(
  () => props.row?.id,
  () => {
    if (visible.value) void load();
  },
);
onBeforeUnmount(() => {
  ++epoch;
  resetCookieSelection();
});
useSubmissionGuard(() => submitting.value);
function resetCookieSelection() {
  cookieFile.value = null;
  cookieError.value = "";
  clearCookie.value = false;
  if (cookieInput.value) cookieInput.value.value = "";
}
function chooseCookieFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || submitting.value || loading.value || form.kind !== "douyinHot")
    return;
  const error = validateCookieFile(file);
  if (error) {
    resetCookieSelection();
    cookieError.value = error;
    return;
  }
  cookieFile.value = file;
  cookieError.value = "";
  clearCookie.value = false;
}
function markCookieCleared() {
  if (
    !visible.value ||
    submitting.value ||
    loading.value ||
    form.kind !== "douyinHot" ||
    !savedHasCookie.value
  )
    return;
  resetCookieSelection();
  clearCookie.value = true;
}
function close() {
  if (!submitting.value) visible.value = false;
}
async function submit() {
  if (submitting.value || loading.value || failed.value) return;
  if (cookieError.value && form.kind === "douyinHot") {
    ElMessage.error(cookieError.value);
    return;
  }
  submitting.value = true;
  const sequence = epoch;
  try {
    await formRef.value?.validate();
    if (sequence !== epoch || !visible.value) return;
    const url = fixedHotSourceUrl(form.kind);
    const data: HotSourceForm = {
      name: form.name,
      kind: form.kind,
      url: url || form.url,
      isEnabled: Boolean(form.isEnabled),
      description: form.description,
    };
    if (form.kind === "douyinHot") {
      if (cookieFile.value) {
        const file = cookieFile.value;
        try {
          data.cookieFileContent = await readCookieFile(file);
        } catch (error) {
          if (sequence === epoch && visible.value) {
            cookieError.value =
              error instanceof Error ? error.message : "Cookie 文件读取失败";
            ElMessage.error(cookieError.value);
          }
          return;
        }
        data.cookieFileName = file.name;
      } else if (clearCookie.value) data.clearCookie = true;
    }
    if (sequence !== epoch || !visible.value) return;
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
      <template #field-cookieFile>
        <div class="cookie-file">
          <div class="cookie-file__actions">
            <input
              ref="cookieInput"
              type="file"
              accept=".txt,text/plain"
              hidden
              :disabled="loading || submitting"
              aria-label="选择抖音 Cookie txt 文件"
              @change="chooseCookieFile"
            />
            <Button
              :perm="row ? 'HotTopicSource.update' : 'HotTopicSource.create'"
              :disabled="loading || submitting"
              @click="cookieInput?.click()"
              >{{ savedHasCookie ? "选择替换文件" : "选择 .txt 文件" }}</Button
            >
            <Button
              v-if="cookieFile || clearCookie || cookieError"
              :disabled="loading || submitting"
              @click="resetCookieSelection"
              >撤销本次变更</Button
            >
            <Button
              v-if="savedHasCookie && !clearCookie"
              :perm="row ? 'HotTopicSource.update' : 'HotTopicSource.create'"
              :disabled="loading || submitting"
              confirm
              confirm-text="清除已保存的抖音 Cookie？点击保存配置后生效，之后可能无法获取热搜。"
              @click="markCookieCleared"
              >清除已保存 Cookie</Button
            >
          </div>
          <div class="cookie-file__status" role="status">
            {{ cookieStatus }}
          </div>
          <div v-if="cookieError" class="cookie-file__error" role="alert">
            {{ cookieError }}
          </div>
        </div>
      </template>
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

<style scoped>
.cookie-file {
  width: 100%;
}
.cookie-file__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cookie-file__actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.cookie-file__status {
  margin-top: 8px;
  color: var(--el-text-color-regular);
  overflow-wrap: anywhere;
}
.cookie-file__error {
  margin-top: 4px;
  color: var(--el-color-danger);
}
</style>
