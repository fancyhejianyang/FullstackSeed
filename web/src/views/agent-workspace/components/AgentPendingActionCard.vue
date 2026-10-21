<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessage, type FormRules } from "element-plus";
import Button from "@/components/Button.vue";
import Dialog from "@/components/Dialog.vue";
import Form, { type FormField } from "@/components/Form.vue";
import type { ProductOption } from "@/api/productCatalog";
import type { AgentPendingAction, AgentBusinessForm } from "@/api/agentWorkspace";
import { getPermissionActionColor } from "@/utils/permission";

const props = defineProps<{
  pendingAction: AgentPendingAction;
  products: ProductOption[];
  busy?: boolean;
}>();

const emit = defineEmits<{
  update: [pendingAction: AgentPendingAction, data: AgentPendingAction["data"]];
  confirm: [pendingAction: AgentPendingAction];
  cancel: [pendingAction: AgentPendingAction];
}>();

const editVisible = ref(false);
const formRef = ref<InstanceType<typeof Form>>();
const form = ref<Record<string, unknown>>({});
// 旧 SKU 待确认操作无需迁移，继续从已有产品选项回显；其余模块使用后端声明。
const definition = computed<AgentBusinessForm>(
  () =>
    props.pendingAction.form ?? {
      name: "新增 SKU",
      permission: "ProductSku.create",
      detailPath: "/business-data/product-skus",
      note: "SKU 编码留空自动生成；修改后仍需确认录入。",
      fields: [
        {
          prop: "productId",
          label: "所属产品",
          type: "integer",
          required: true,
          options: props.products.map((p) => ({
            label: `${p.name}（${p.productCode}）`,
            value: p.id,
          })),
        },
        { prop: "skuCode", label: "SKU 编码", type: "string", required: false },
        { prop: "name", label: "SKU 名称", type: "string", required: false },
        {
          prop: "specifications",
          label: "规格参数",
          type: "object",
          required: true,
        },
        {
          prop: "isEnabled",
          label: "是否启用",
          type: "boolean",
          required: false,
          default: true,
        },
      ],
    },
);

const canEdit = computed(() =>
  ["collecting", "pending_confirmation", "failed"].includes(props.pendingAction.status),
);
const canConfirm = computed(
  () =>
    ["pending_confirmation", "failed"].includes(props.pendingAction.status) &&
    !props.pendingAction.missingFields.length &&
    !props.pendingAction.validationErrors.length,
);

const fields = computed<FormField[]>(() =>
  definition.value.fields.map((field) => {
    const base = { prop: field.prop, label: field.label };
    if (field.options || field.enum)
      return {
        ...base,
        type: "select",
        options:
          field.options ??
          field.enum!.map((value) => ({ label: value, value })),
      };
    if (field.type === "boolean") return { ...base, component: "Switch" };
    if (["integer", "number"].includes(field.type))
      return {
        ...base,
        component: "InputNumber",
        componentProps: {
          min: field.minimum,
          precision: field.type === "integer" ? 0 : undefined,
        },
      };
    if (["array", "object"].includes(field.type))
      return {
        ...base,
        type: "textarea",
        rows: 4,
        hint:
          field.type === "array"
            ? "每行填写一项"
            : '填写 JSON 对象，例如 {"颜色":"蓝色"}',
      };
    const multiline = /content|answer|description|semanticDefinition/i.test(
      field.prop,
    );
    return {
      ...base,
      type: multiline ? "textarea" : "input",
      rows: 5,
      componentProps: { maxlength: field.maxLength },
    };
  }),
);
const rules = computed<FormRules>(() =>
  Object.fromEntries(
    definition.value.fields
      .filter((field) => field.required)
      .map((field) => [
        field.prop,
        [{ required: true, message: `请填写${field.label}`, trigger: "blur" }],
      ]),
  ),
);

watch(editVisible, (value) => {
  if (!value) return;
  form.value = Object.fromEntries(
    definition.value.fields.map((field) => {
      const current = props.pendingAction.data[field.prop] ?? field.default;
      const value =
        field.type === "object"
          ? JSON.stringify(current ?? {}, null, 2)
          : field.type === "array"
            ? Array.isArray(current)
              ? current.join("\n")
              : ""
            : (current ??
              (["integer", "number"].includes(field.type)
                ? null
                : field.type === "boolean"
                  ? false
                  : ""));
      return [field.prop, value];
    }),
  );
});

async function saveEdit() {
  await formRef.value?.validate();
  const data: Record<string, unknown> = {};
  try {
    for (const field of definition.value.fields) {
      const raw = form.value[field.prop];
      if (raw === "" || raw === undefined || raw === null) continue;
      if (field.type === "object") {
        const value: unknown = JSON.parse(String(raw));
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw new Error(`${field.label}必须是 JSON 对象`);
        data[field.prop] = value;
      } else if (field.type === "array")
        data[field.prop] = String(raw)
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
      else data[field.prop] = raw;
    }
  } catch (error) {
    ElMessage.warning(
      error instanceof Error ? error.message : "字段格式不正确",
    );
    return;
  }
  emit("update", props.pendingAction, data);
  editVisible.value = false;
}

function displayValue(prop: string) {
  const value = props.pendingAction.data[prop];
  const label = definition.value.fields
    .find((f) => f.prop === prop)
    ?.options?.find((o) => o.value === value)?.label;
  if (label) return label;
  if (value === undefined || value === null || value === "") return "未填写";
  if (typeof value === "boolean") return value ? "是" : "否";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function statusText(status: AgentPendingAction["status"]) {
  const map: Record<AgentPendingAction["status"], string> = {
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
  <div class="pendingAction-card" :class="`is-${pendingAction.status}`">
    <div class="pendingAction-card__header">
      <strong>{{
        pendingAction.status === "submitted"
          ? `${definition.name}回执`
          : `${definition.name}待确认操作 — 尚未保存`
      }}</strong>
      <el-tag
        :type="
          pendingAction.status === 'submitted'
            ? getPermissionActionColor('create')
            : pendingAction.status === 'failed'
              ? getPermissionActionColor('reject')
              : getPermissionActionColor('audit')
        "
      >
        {{ statusText(pendingAction.status) }}
      </el-tag>
    </div>
    <el-descriptions :column="1" border size="small">
      <el-descriptions-item
        v-for="field in definition.fields"
        :key="field.prop"
        :label="field.label"
        ><span class="pendingAction-card__value">{{
          displayValue(field.prop)
        }}</span></el-descriptions-item
      >
      <el-descriptions-item v-if="pendingAction.submittedRecordId" label="记录 ID">{{
        pendingAction.submittedRecordId
      }}</el-descriptions-item>
    </el-descriptions>
    <p v-if="definition.note" class="pendingAction-card__note">{{ definition.note }}</p>
    <el-alert
      v-if="pendingAction.missingFields.length || pendingAction.validationErrors.length"
      class="pendingAction-card__alert"
      type="warning"
      :closable="false"
      :title="[...pendingAction.missingFields, ...pendingAction.validationErrors].join('；')"
    />
    <div v-if="canEdit" class="pendingAction-card__actions">
      <Button
        :perm="definition.permission"
        :auto-type="false"
        :type="getPermissionActionColor('update')"
        icon="Edit"
        :disabled="busy"
        @click="editVisible = true"
        >修改信息</Button
      >
      <Button
        :perm="definition.permission"
        confirm
        :confirm-text="`确认提交当前版本的${definition.name}待确认操作？${definition.note}`"
        :disabled="!canConfirm || busy"
        @click="emit('confirm', pendingAction)"
        >确认录入</Button
      >
      <Button
        :perm="definition.permission"
        :auto-type="false"
        :type="getPermissionActionColor('read')"
        icon="Close"
        :confirm="false"
        :disabled="busy"
        @click="emit('cancel', pendingAction)"
        >取消</Button
      >
    </div>

    <Dialog
      v-model="editVisible"
      :title="`修改${definition.name}待确认操作`"
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
.pendingAction-card {
  padding: 16px;
  border: 1px solid #f3d19e;
  border-radius: 14px;
  background: #fffcf5;
  box-shadow: 0 6px 20px rgb(31 35 41 / 6%);
}
.pendingAction-card.is-submitted {
  border-color: #b3e19d;
  background: #f6fff2;
}
.pendingAction-card.is-cancelled,
.pendingAction-card.is-expired {
  border-color: #dcdfe6;
  background: #f5f7fa;
}
.pendingAction-card__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  color: #303133;
}
.pendingAction-card__alert {
  margin-top: 10px;
}
.pendingAction-card__value {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.pendingAction-card__note {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.pendingAction-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
</style>
