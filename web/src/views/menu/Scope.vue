<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import Switch from '@/components/Switch.vue';
import { updateMenu, type MenuNode } from '@/api/menu';
import { useUserStore } from '@/stores/user';

defineProps<{ tree: MenuNode[]; loading: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const user = useUserStore();
const savingId = ref<number | null>(null);

// 切换「系统固定 / 可分配」：isSystem=true 系统固定（仅超管可见、不可分配）
async function handleToggle(row: MenuNode, value: boolean) {
  // 同值短路：防止任何非用户主动触发的 change 造成多余请求
  if (!user.isAdmin || savingId.value !== null || value === !!row.isSystem)
    return;
  savingId.value = row.id;
  try {
    await updateMenu(row.id, { isSystem: value });
    row.isSystem = value;
    ElMessage.success(value ? '已设为仅超管使用' : '已允许角色分配');
    emit('changed');
  } finally {
    savingId.value = null;
  }
}
</script>

<template>
  <div v-if="user.isAdmin">
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="仅超管使用的菜单不能分配给普通角色；允许角色分配后，仍需在角色管理中授权。此设置不代表启用或禁用菜单。"
      class="config-menu__tip"
    />
    <el-table
      v-loading="loading"
      :data="tree"
      row-key="id"
      border
      default-expand-all
      :tree-props="{ children: 'children' }"
    >
      <el-table-column prop="name" label="菜单名称" min-width="180">
        <template #default="{ row }">
          <el-icon v-if="row.icon" class="config-menu__icon"
            ><component :is="row.icon"
          /></el-icon>
          {{ row.name }}
        </template>
      </el-table-column>
      <el-table-column prop="path" label="路由路径" min-width="160">
        <template #default="{ row }">{{ row.path || '-' }}</template>
      </el-table-column>
      <el-table-column label="当前分类" width="120">
        <template #default="{ row }">
          <el-tag size="small" :type="row.isSystem ? 'warning' : 'success'">
            {{ row.isSystem ? '仅超管使用' : '允许角色分配' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="配置" width="220">
        <template #default="{ row }">
          <Switch
            :model-value="!!row.isSystem"
            :disabled="savingId !== null"
            :active-value="true"
            :inactive-value="false"
            active-text="仅超管使用"
            inactive-text="允许角色分配"
            inline-prompt
            @update:model-value="(val: boolean) => handleToggle(row, val)"
          />
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.config-menu__tip {
  margin-bottom: 12px;
}
.config-menu__icon {
  margin-right: 4px;
  vertical-align: middle;
}
</style>
