<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { ElMessage, type FormRules } from "element-plus";
import Form, { type FormField } from "@/components/Form.vue";
import Dialog from "@/components/Dialog.vue";
import type { MenuNode } from "@/api/menu";
import { getPermissionCatalog, type PermissionModule } from "@/api/permission";
import {
  buildPermissionTree,
  permissionTreeCodes,
  mergePermissionSelection,
} from "./permissionTree";
import {
  createRole,
  getRole,
  updateRole,
  type Role,
  type RoleForm,
} from "@/api/role";

const props = defineProps<{ row?: Role | null }>();
const emit = defineEmits<{ success: [] }>();
const visible = defineModel<boolean>("visible", { required: true });

const submitting = ref(false);
const loading = ref(false);
const isEdit = ref(false);
const formRef = ref<InstanceType<typeof Form>>();
const permissionTreeRef = ref();

const menuTree = ref<MenuNode[]>([]);
const modules = ref<PermissionModule[]>([]);
const loadFailed = ref(false);
let loadSequence = 0;
const permissionsLoading = ref(false);

const form = reactive({
  code: "",
  name: "",
  isActive: 1 as number,
  permissionCodes: [] as string[],
});

const fields: FormField[] = [
  {
    prop: "code",
    label: "角色编码",
    type: "input",
    placeholder: "如 editor",
    componentProps: { disabled: isEdit },
  },
  { prop: "name", label: "角色名称", type: "input" },
  {
    prop: "isActive",
    label: "状态",
    type: "select",
    options: [
      { label: "启用", value: 1 },
      { label: "禁用", value: 0 },
    ],
  },
  { prop: "permissionIds", label: "菜单权限", slot: true },
];

const rules: FormRules = {
  code: [{ required: true, message: "请输入角色编码", trigger: "blur" }],
  name: [{ required: true, message: "请输入角色名称", trigger: "blur" }],
  isActive: [{ required: true, message: "请选择状态", trigger: "change" }],
};

const permissionTreeData = computed(() =>
  buildPermissionTree(menuTree.value, modules.value),
);
const displayedCodes = computed(() =>
  permissionTreeCodes(permissionTreeData.value),
);
const preservedCount = computed(
  () =>
    form.permissionCodes.filter((code) => !displayedCodes.value.includes(code))
      .length,
);
function isTruthyValue(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function syncPermissionTreeChecked() {
  const codes = new Set(form.permissionCodes);
  const keys: string[] = [];
  const collectCheckedKeys = (
    nodes: ReturnType<typeof buildPermissionTree>,
  ) => {
    nodes.forEach((node) => {
      if (node.permissionCode && codes.has(node.permissionCode)) {
        keys.push(node.id);
      }
      if (node.children?.length) collectCheckedKeys(node.children);
    });
  };
  collectCheckedKeys(permissionTreeData.value);
  permissionTreeRef.value?.setCheckedKeys(keys);
}

function resetForm() {
  form.code = "";
  form.name = "";
  form.isActive = 1;
  form.permissionCodes = [];
}

function fillForm(data: Role) {
  form.code = data.code ?? "";
  form.name = data.name ?? "";
  form.isActive = isTruthyValue(data.isActive) ? 1 : 0;
  const legacyRelationCodes = data.permissions
    ?.map((permission) => permission.code)
    .filter((code) => code.includes("."));
  form.permissionCodes = data.permissionCodes?.length
    ? data.permissionCodes
    : (legacyRelationCodes ?? []);
}

// 每次打开重新读取，失败时禁止保存，避免空树覆盖已有授权。
watch(visible, async (open) => {
  const sequence = ++loadSequence;
  if (!open) return;
  isEdit.value = !!props.row;
  loading.value = true;
  permissionsLoading.value = true;
  loadFailed.value = false;
  resetForm();
  menuTree.value = [];
  modules.value = [];
  try {
    const [catalog, detail] = await Promise.all([
      getPermissionCatalog(),
      props.row?.id ? getRole(props.row.id) : Promise.resolve(null),
    ]);
    if (sequence !== loadSequence || !visible.value) return;
    menuTree.value = catalog.menus;
    modules.value = catalog.modules;
    if (detail) fillForm(detail);
    await nextTick();
    if (sequence === loadSequence && visible.value) syncPermissionTreeChecked();
  } catch {
    if (sequence === loadSequence) loadFailed.value = true;
  } finally {
    if (sequence === loadSequence) {
      loading.value = false;
      permissionsLoading.value = false;
    }
  }
});

async function handleSubmit() {
  if (
    !visible.value ||
    loading.value ||
    permissionsLoading.value ||
    loadFailed.value ||
    submitting.value
  ) {
    if (loadFailed.value)
      ElMessage.warning("权限目录读取失败，请重新打开后再保存");
    return;
  }
  const sequence = loadSequence;
  const roleId = props.row?.id;
  await formRef.value?.validate();
  if (
    sequence !== loadSequence ||
    !visible.value ||
    loading.value ||
    loadFailed.value
  )
    return;
  const checkedKeys = permissionTreeRef.value?.getCheckedKeys(true) ?? [];
  const permissionCodes = checkedKeys
    .filter((key: string) => key.startsWith("permission-"))
    .map((key: string) => key.replace("permission-", ""));
  submitting.value = true;
  try {
    const payload: RoleForm = {
      code: form.code,
      name: form.name,
      isActive: !!form.isActive,
      permissionCodes: mergePermissionSelection(
        form.permissionCodes,
        displayedCodes.value,
        permissionCodes,
      ),
    };
    if (roleId) {
      await updateRole(roleId, payload);
      ElMessage.success("更新成功");
    } else {
      await createRole(payload);
      ElMessage.success("创建成功");
    }
    if (sequence === loadSequence) visible.value = false;
    emit("success");
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Dialog
    v-model="visible"
    :title="props.row ? '编辑角色' : '新增角色'"
    :confirm-loading="submitting"
    @confirm="handleSubmit"
  >
    <div v-loading="loading">
      <p v-if="loadFailed" role="alert">
        权限读取失败，请关闭后重新打开；未修改任何授权。
      </p>
      <Form
        ref="formRef"
        v-model="form"
        :fields="fields"
        :rules="rules"
        :disabled="loading || loadFailed || submitting"
      >
        <!-- 菜单权限树 -->
        <template #field-permissionIds>
          <div>
            <p>权限变更后，相关账号需重新登录生效。</p>
            <p>
              同一模块的多个入口合并授权，仅列出实际支持的动作。超管专用或停用菜单不参与分配。
            </p>
            <p v-if="preservedCount">
              另有
              {{ preservedCount }} 项历史或当前未展示的权限，本次保存将保留。
            </p>
            <el-tree
              ref="permissionTreeRef"
              v-loading="permissionsLoading"
              :data="permissionTreeData"
              node-key="id"
              show-checkbox
              check-on-click-node
              default-expand-all
              class="perm-tree"
            />
          </div>
        </template>
      </Form>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.perm-tree {
  max-height: 360px;
  overflow-y: auto;
  width: 100%;
  padding: 4px 0;
}
.perm-tree :deep(.el-tree-node__content) {
  height: 30px;
}
.perm-tree :deep(.el-tree-node__content:hover) {
  background: #f5f7fa;
}
.perm-tree :deep(.el-checkbox) {
  margin-right: 6px;
}
</style>
