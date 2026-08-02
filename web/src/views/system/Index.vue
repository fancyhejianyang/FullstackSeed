<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageContainer from '@/components/PageContainer.vue';
import { getMenuTree, updateMenu, type MenuNode } from '@/api/menu';

const activeTab = ref('menu');

// ===== 配置菜单 Tab =====
const loading = ref(false);
const tree = ref<MenuNode[]>([]);

// 后端 tinyint 字段会序列化成 0/1，递归归一化为布尔，
// 否则 el-switch 绑定值与 active/inactive-value(布尔) 不严格相等，会在挂载时自动 emit change 触发误请求
function normalizeBool(nodes: MenuNode[]): MenuNode[] {
  for (const n of nodes) {
    n.isSystem = !!n.isSystem;
    n.isActive = !!n.isActive;
    if (n.children?.length) normalizeBool(n.children);
  }
  return nodes;
}

async function fetchMenus() {
  loading.value = true;
  try {
    tree.value = normalizeBool(await getMenuTree());
  } finally {
    loading.value = false;
  }
}

// 切换「系统固定 / 可分配」：isSystem=true 系统固定（仅超管可见、不可分配）
async function handleToggle(row: MenuNode, value: boolean) {
  // 同值短路：防止任何非用户主动触发的 change 造成多余请求
  if (value === row.isSystem) return;
  try {
    await updateMenu(row.id, { isSystem: value });
    row.isSystem = value;
    ElMessage.success(value ? '已设为系统固定' : '已设为可分配给角色');
  } catch {
    // 失败（如受保护菜单被后端拒绝）时重新拉取还原状态
    await fetchMenus();
  }
}

onMounted(fetchMenus);
</script>

<template>
  <PageContainer title="系统配置">
    <el-tabs v-model="activeTab">
      <!-- 配置菜单 -->
      <el-tab-pane label="配置菜单" name="menu">
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="系统固定菜单仅超级管理员可见、不可分配给角色；可分配菜单才能在角色授权中选择。锁定菜单的操作权限由后端按管理员身份校验。"
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
              <el-icon v-if="row.icon" class="config-menu__icon"><component :is="row.icon" /></el-icon>
              {{ row.name }}
            </template>
          </el-table-column>
          <el-table-column prop="path" label="路由路径" min-width="160">
            <template #default="{ row }">{{ row.path || '-' }}</template>
          </el-table-column>
          <el-table-column label="当前分类" width="120">
            <template #default="{ row }">
              <el-tag size="small" :type="row.isSystem ? 'warning' : 'success'">
                {{ row.isSystem ? '系统固定' : '可分配' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="配置" width="220">
            <template #default="{ row }">
              <el-switch
                :model-value="row.isSystem"
                :active-value="true"
                :inactive-value="false"
                active-text="系统固定"
                inactive-text="可分配"
                inline-prompt
                @change="(val: boolean) => handleToggle(row, val)"
              />
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 预留：后续配置 Tab -->
      <el-tab-pane label="AI 大模型账号" name="ai">
        <el-empty description="功能开发中" />
      </el-tab-pane>
      <el-tab-pane label="微信 / 小程序" name="wechat">
        <el-empty description="功能开发中" />
      </el-tab-pane>
    </el-tabs>
  </PageContainer>
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
