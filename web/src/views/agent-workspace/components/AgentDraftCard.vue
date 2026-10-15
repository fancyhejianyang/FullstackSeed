<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { ElMessage, type FormRules } from "element-plus";
import Button from "@/components/Button.vue";
import Dialog from "@/components/Dialog.vue";
import Form, { type FormField } from "@/components/Form.vue";
import type { ProductOption } from "@/api/productCatalog";
import type { AgentDraft, AgentSkuDraftData } from "@/api/agentWorkspace";

const props = defineProps<{
  draft: AgentDraft;
  products: ProductOption[];
  busy?: boolean;
}>();

const emit = defineEmits<{
  update: [draft: AgentDraft, data: AgentSkuDraftData];
  confirm: [draft: AgentDraft];
  cancel: [draft: AgentDraft];
}>();

const editVisible = ref(false);
const formRef = ref<InstanceType<typeof Form>>();
const form = reactive({
  productId: "" as string | number,
  skuCode: "",
  name: "",
  specificationsText: "{}",
  isEnabled: true,
});

const canEdit = computed(() =>
  ["collecting", "pending_confirmation", "failed"].includes(props.draft.status),
);
const canConfirm = computed(
  () =>
    ["pending_confirmation", "failed"].includes(props.draft.status) &&
    !props.draft.missingFields.length &&
    !props.draft.validationErrors.length,
);

const fields = computed<FormField[]>(() => [
  {
    prop: "productId",
    label: "所属产品",
    type: "select",
    options: props.products.map((item) => ({
      label: `${item.name}（${item.productCode}）`,
      value: item.id,
    })),
  },
  {
    prop: "skuCode",
    label: "SKU 编码",
    type: "input",
    placeholder: "留空则自动生成",
  },
  {
    prop: "name",
    label: "SKU 名称",
    type: "input",
    placeholder: "可选展示名称",
  },
  {
    prop: "specificationsText",
    label: "规格参数",
    type: "textarea",
    rows: 7,
    placeholder: '{"颜色":"蓝色","容量":"256G"}',
    hint: "使用 JSON 对象录入规格；保存后仍只是草稿。",
  },
  {
    prop: "isEnabled",
    label: "启用状态",
    component: "Switch",
    componentProps: { activeText: "启用", inactiveText: "停用" },
  },
]);

const rules: FormRules = {
  productId: [{ required: true, message: "请选择所属产品", trigger: "change" }],
  specificationsText: [
    { required: true, message: "请输入规格参数", trigger: "blur" },
  ],
};

watch(editVisible, (value) => {
  if (!value) return;
  form.productId = props.draft.data.productId ?? "";
  form.skuCode = props.draft.data.skuCode;
  form.name = props.draft.data.name;
  form.specificationsText = JSON.stringify(
    props.draft.data.specifications,
    null,
    2,
  );
  form.isEnabled = props.draft.data.isEnabled;
});

async function saveEdit() {
  await formRef.value?.validate();
  let specifications: Record<string, unknown>;
  try {
    const parsed = JSON.parse(form.specificationsText) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    specifications = parsed as Record<string, unknown>;
  } catch {
    ElMessage.warning("规格参数必须是合法的 JSON 对象");
    return;
  }
  emit("update", props.draft, {
    productId: Number(form.productId),
    productName: "",
    skuCode: form.skuCode.trim(),
    name: form.name.trim(),
    specifications,
    isEnabled: form.isEnabled,
  });
  editVisible.value = false;
}

function statusText(status: AgentDraft["status"]) {
  const map: Record<AgentDraft["status"], string> = {
    collecting: "待补充",
    pending_confirmation: "待确认",
    submitting: "提交中",
    submitted: "已录入",
    cancelled: "已取消",
    expired: "已失效",
    failed: "提交失败",
  };
  return map[status];
}
</script>

<template>
  <div class="draft-card" :class="`is-${draft.status}`">
    <div class="draft-card__header">
      <strong>{{
        draft.status === "submitted"
          ? "新增 SKU 回执"
          : "待确认：新增 SKU — 尚未保存"
      }}</strong>
      <el-tag
        :type="
          draft.status === 'submitted'
            ? 'success'
            : draft.status === 'failed'
              ? 'danger'
              : 'warning'
        "
      >
        {{ statusText(draft.status) }}
      </el-tag>
    </div>
    <el-descriptions :column="1" border size="small">
      <el-descriptions-item label="所属产品">{{
        draft.data.productName || "待选择"
      }}</el-descriptions-item>
      <el-descriptions-item label="SKU 编码">{{
        draft.data.skuCode || "保存时自动生成"
      }}</el-descriptions-item>
      <el-descriptions-item label="SKU 名称">{{
        draft.data.name || "-"
      }}</el-descriptions-item>
      <el-descriptions-item label="规格">{{
        JSON.stringify(draft.data.specifications)
      }}</el-descriptions-item>
      <el-descriptions-item v-if="draft.submittedRecordId" label="记录 ID">{{
        draft.submittedRecordId
      }}</el-descriptions-item>
    </el-descriptions>
    <el-alert
      v-if="draft.missingFields.length || draft.validationErrors.length"
      class="draft-card__alert"
      type="warning"
      :closable="false"
      :title="[...draft.missingFields, ...draft.validationErrors].join('；')"
    />
    <div v-if="canEdit" class="draft-card__actions">
      <Button
        perm="ProductSku.create"
        :auto-type="false"
        type="primary"
        icon="Edit"
        :disabled="busy"
        @click="editVisible = true"
        >修改信息</Button
      >
      <Button
        perm="ProductSku.create"
        confirm
        confirm-text="确认录入当前版本的 SKU 草稿？"
        :disabled="!canConfirm || busy"
        @click="emit('confirm', draft)"
        >确认录入</Button
      >
      <Button
        perm="ProductSku.create"
        :auto-type="false"
        type="info"
        icon="Close"
        :confirm="false"
        :disabled="busy"
        @click="emit('cancel', draft)"
        >取消</Button
      >
    </div>

    <Dialog
      v-model="editVisible"
      title="修改 SKU 草稿"
      width="720px"
      @confirm="saveEdit"
    >
      <Form
        ref="formRef"
        v-model="form"
        :fields="fields"
        :rules="rules"
        label-width="110px"
      />
    </Dialog>
  </div>
</template>

<style scoped>
.draft-card {
  padding: 16px;
  border: 1px solid #f3d19e;
  border-radius: 14px;
  background: #fffcf5;
  box-shadow: 0 6px 20px rgb(31 35 41 / 6%);
}
.draft-card.is-submitted {
  border-color: #b3e19d;
  background: #f6fff2;
}
.draft-card.is-cancelled,
.draft-card.is-expired {
  border-color: #dcdfe6;
  background: #f5f7fa;
}
.draft-card__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  color: #303133;
}
.draft-card__alert {
  margin-top: 10px;
}
.draft-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
</style>
