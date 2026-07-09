<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import ProDialog from '@/components/ProDialog.vue';
import {
  createPermission,
  updatePermission,
  deletePermission,
  type Permission,
  type PermissionType,
} from '@/api/permission';

const props = defineProps<{
  menuId: number;
  menuName: string;
  permissions: Permission[];
}>();
const emit = defineEmits<{ success: [] }>();
const visible = defineModel<boolean>('visible', { required: true });

// 行数据：id 为空表示新增行；带上原始快照用于 diff
interface Row {
  id: number | null;
  name: string;
  code: string;
  type: PermissionType;
  // 原始快照（编辑对比用），新增行为 null
  _origin: { name: string; code: string; type: PermissionType } | null;
}

const rows = ref<Row[]>([]);
// 已删除的原始 id（保存时再调后端）
const removedIds = ref<number[]>([]);
const saving = ref(false);

watch(visible, (val) => {
  if (val) {
    rows.value = props.permissions.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      type: p.type,
      _origin: { name: p.name, code: p.code, type: p.type },
    }));
    removedIds.value = [];
  }
});

function addRow() {
  rows.value.push({
    id: null,
    name: '',
    code: '',
    type: 'button',
    _origin: null,
  });
}

function removeRow(index: number) {
  const row = rows.value[index];
  if (row.id != null) removedIds.value.push(row.id);
  rows.value.splice(index, 1);
}

function validate(): boolean {
  for (let i = 0; i < rows.value.length; i++) {
    const r = rows.value[i];
    if (!r.name.trim() || !r.code.trim()) {
      ElMessage.warning(`第 ${i + 1} 行「名称」「权限码」不能为空`);
      return false;
    }
  }
  // 权限码本地去重
  const codes = rows.value.map((r) => r.code.trim());
  const dup = codes.find((c, i) => codes.indexOf(c) !== i);
  if (dup) {
    ElMessage.warning(`权限码「${dup}」重复`);
    return false;
  }
  return true;
}

// diff 提交：新增 / 更新 / 删除
async function handleSave() {
  if (!validate()) return;
  saving.value = true;
  try {
    const tasks: Promise<unknown>[] = [];

    // 删除
    for (const id of removedIds.value) {
      tasks.push(deletePermission(id));
    }
    // 新增 / 更新
    for (const r of rows.value) {
      if (r.id == null) {
        tasks.push(
          createPermission({
            name: r.name.trim(),
            code: r.code.trim(),
            type: r.type,
            menuId: props.menuId,
          }),
        );
      } else if (
        r._origin &&
        (r.name !== r._origin.name ||
          r.code !== r._origin.code ||
          r.type !== r._origin.type)
      ) {
        tasks.push(
          updatePermission(r.id, {
            name: r.name.trim(),
            code: r.code.trim(),
            type: r.type,
          }),
        );
      }
    }

    if (tasks.length === 0) {
      ElMessage.info('没有需要保存的改动');
      visible.value = false;
      return;
    }

    await Promise.all(tasks);
    ElMessage.success('保存成功');
    visible.value = false;
    emit('success');
  } finally {
    saving.value = false;
  }
}

function handleCancel() {
  visible.value = false;
}
</script>

<template>
  <ProDialog
    v-model="visible"
    :title="`维护操作权限 - ${menuName}`"
    width="720px"
    :show-footer="false"
  >
    <el-table :data="rows" border size="small" empty-text="暂无操作权限">
      <el-table-column label="名称" min-width="140">
        <template #default="{ row }">
          <el-input v-model="row.name" placeholder="如 新增" />
        </template>
      </el-table-column>
      <el-table-column label="权限码" min-width="200">
        <template #default="{ row }">
          <el-input v-model="row.code" placeholder="如 Article.create" />
        </template>
      </el-table-column>
      <el-table-column label="类型" width="120">
        <template #default="{ row }">
          <el-select v-model="row.type">
            <el-option label="按钮" value="button" />
            <el-option label="接口" value="api" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="80" align="center">
        <template #default="{ $index }">
          <el-button link type="danger" @click="removeRow($index)">
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="maintain__add">
      <el-button type="primary" plain @click="addRow">+ 新增一行</el-button>
    </div>

    <div class="maintain__footer">
      <el-button @click="handleCancel">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">
        保存
      </el-button>
    </div>
  </ProDialog>
</template>

<style scoped lang="scss">
.maintain__add {
  margin-top: 12px;
}
.maintain__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border-light);
}
</style>
