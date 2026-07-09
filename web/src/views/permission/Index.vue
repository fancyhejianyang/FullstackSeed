<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import { getAllPermissions, type Permission } from '@/api/permission';
import { getMyMenus, type MenuNode } from '@/api/menu';
import { getPermissionActionColor, getPermissionActionLabel } from '@/utils/permission';
import Maintain from './Maintain.vue';

// 表格行：菜单 + 其下操作权限（树形用 children）
interface MenuRow {
  id: number;
  name: string;
  path: string;
  permissionCode: string;
  operations: Permission[]; // 该菜单下的操作权限（button/api）
  children?: MenuRow[];
}

const loading = ref(false);
const menus = ref<MenuNode[]>([]);
const permissions = ref<Permission[]>([]);

// 按 menuId 聚合操作权限（排除 type=menu）
const permByMenu = computed(() => {
  const map = new Map<number, Permission[]>();
  for (const p of permissions.value) {
    if (p.menuId == null || p.type === 'menu') continue;
    if (!map.has(p.menuId)) map.set(p.menuId, []);
    map.get(p.menuId)!.push(p);
  }
  console.log(map)
  return map;
});

// 菜单树 → 表格行
const tableData = computed<MenuRow[]>(() => {
  const build = (m: MenuNode): MenuRow => ({
    id: m.id,
    name: m.name,
    path: m.path,
    permissionCode: m.permissionCode,
    operations: permByMenu.value.get(m.id) ?? [],
    children: m.children?.length ? m.children.map(build) : undefined,
  });
  return menus.value.map(build);
});

async function fetchData() {
  loading.value = true;
  try {
    const [menuRes, permRes] = await Promise.all([
      getMyMenus(),
      getAllPermissions(),
    ]);
    menus.value = menuRes;
    permissions.value = permRes.list;
    console.log('permissions', permissions.value);
  } finally {
    loading.value = false;
  }
}

// 维护弹窗
const maintainVisible = ref(false);
const currentMenu = ref<MenuRow | null>(null);

function openMaintain(row: MenuRow) {
  currentMenu.value = row;
  maintainVisible.value = true;
}

onMounted(fetchData);
</script>

<template>
  <PageContainer title="权限管理">
    <el-table
      v-loading="loading"
      :data="tableData"
      row-key="id"
      border
      default-expand-all
      :tree-props="{ children: 'children' }"
    >
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-button link type="primary" @click="openMaintain(row)">
            编辑
          </el-button>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="菜单名称" min-width="180" />
      <el-table-column prop="path" label="路由路径" min-width="140">
        <template #default="{ row }">{{ row.path || '-' }}</template>
      </el-table-column>
      <el-table-column prop="permissionCode" label="菜单权限码" min-width="140">
        <template #default="{ row }">
          <el-tag v-if="row.permissionCode" size="small" type="success">
            {{ row.permissionCode }}
          </el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="操作权限" min-width="240">
        <template #default="{ row }">
          <template v-if="row.operations.length">
            <el-tag
              v-for="op in row.operations"
              :key="op.id"
              size="small"
              class="mr-xs"
              :type="getPermissionActionColor(op.code)"
            >
              {{ getPermissionActionLabel(op.code) }}
            </el-tag>
          </template>
          <span v-else class="text-secondary">-</span>
        </template>
      </el-table-column>
      
    </el-table>

    <!-- 操作权限维护弹窗 -->
    <Maintain
      v-if="currentMenu"
      v-model:visible="maintainVisible"
      :menu-id="currentMenu.id"
      :menu-name="currentMenu.name"
      :permissions="currentMenu.operations"
      @success="fetchData"
    />
  </PageContainer>
</template>
