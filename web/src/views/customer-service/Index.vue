<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import type { FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import { getPermissionActionColor } from '@/utils/permission';
import {
  getCustomerServiceApps,
  getCustomerServiceSessions,
  type CustomerServiceListResult,
  type CustomerServiceSession,
  type QueryCustomerServiceParams,
} from '@/api/customerService';
import View from './View.vue';

// 沿用 demo 的 Table 请求、筛选、分页与权限模式，聊天接待放在独立详情面板。
const tableRef = ref<{ refresh: () => Promise<void> }>();
const selectedSessionId = ref<number | null>(null);
const activeTab = ref('all');
const appOptions = ref<Array<{ id: number; name: string }>>([]);
const pollingPaused = ref(false);
let disposed = false;
let pollingTimer: ReturnType<typeof setTimeout> | undefined;
let listRequests = 0;
let newestRequest: Promise<CustomerServiceListResult> | null = null;

const tabs = [
  { value: 'all', label: '全部会话' },
  { value: 'queued', label: 'AI 排队' },
  { value: 'running', label: 'AI 处理中' },
  { value: 'waiting_human', label: '待人工' },
  { value: 'mine', label: '我的接待' },
  { value: 'closed', label: '已结束' },
];

const columns: TableColumn[] = [
  { prop: 'sessionId', label: '会话 ID', width: 95 },
  { prop: 'title', label: '会话标题', minWidth: 180 },
  { prop: 'appName', label: '所属应用', minWidth: 130 },
  { prop: 'serviceStatus', label: '接待状态', width: 135, slot: true },
  { prop: 'assignedAgentName', label: '接待客服', width: 120 },
  { prop: 'updatedAt', label: '更新时间', width: 180, slot: true },
];

const searchFields = computed<FormField[]>(() => [
  {
    prop: 'externalAppId',
    label: '应用',
    type: 'select',
    placeholder: '全部应用',
    options: appOptions.value.map((app) => ({ label: app.name, value: app.id })),
  },
  { prop: 'keyword', label: '关键词', type: 'input', placeholder: '会话标题 / 最近问题 / ID' },
]);

async function fetchSessions(params: Record<string, unknown>) {
  const query: QueryCustomerServiceParams = {
    page: Number(params.page) || 1,
    pageSize: Number(params.pageSize) || 10,
    externalAppId: params.externalAppId ? Number(params.externalAppId) : undefined,
    keyword: typeof params.keyword === 'string' ? params.keyword.trim() : undefined,
  };
  if (activeTab.value === 'queued' || activeTab.value === 'running') {
    query.serviceStatus = 'ai';
    query.taskStatus = activeTab.value;
  } else if (activeTab.value === 'mine') {
    query.serviceStatus = 'human';
    query.mine = true;
  } else if (activeTab.value === 'waiting_human' || activeTab.value === 'closed') {
    query.serviceStatus = activeTab.value;
  }
  listRequests += 1;
  const currentRequest = getCustomerServiceSessions(query);
  newestRequest = currentRequest;
  try {
    let pending = currentRequest;
    let result = await pending;
    // Table 的多个刷新可能交叉完成；旧请求也返回最新查询结果，避免覆盖新筛选。
    while (newestRequest && pending !== newestRequest) {
      pending = newestRequest;
      result = await pending;
    }
    return result;
  } catch (error) {
    if (!disposed) pollingPaused.value = true;
    throw error;
  } finally {
    listRequests -= 1;
  }
}

function statusLabel(row: CustomerServiceSession) {
  if (row.serviceStatus === 'waiting_human') return '等待人工';
  if (row.serviceStatus === 'human') return '人工接待';
  if (row.serviceStatus === 'closed') return '已结束';
  if (row.activeTask?.status === 'queued') return `AI 排队${row.queuePosition ? ` · 第 ${row.queuePosition} 位` : ''}`;
  if (row.activeTask?.status === 'running') return 'AI 处理中';
  if (row.activeTask?.status === 'cancelling') return 'AI 正在停止';
  return 'AI 接待';
}

function statusColor(row: CustomerServiceSession) {
  return getPermissionActionColor(row.serviceStatus === 'human' ? 'CustomerService.update' : 'CustomerService.read');
}

function scheduleRefresh() {
  pollingTimer = setTimeout(async () => {
    if (disposed) return;
    if (!pollingPaused.value && !document.hidden && !listRequests) {
      try {
        await tableRef.value?.refresh();
      } catch {
        // 请求封装已展示错误；暂停自动刷新，避免连续错误提示。
      }
    }
    if (!disposed) scheduleRefresh();
  }, 5000);
}

async function refreshList() {
  pollingPaused.value = false;
  try {
    await tableRef.value?.refresh();
  } catch {
    pollingPaused.value = true;
  }
}

onMounted(async () => {
  scheduleRefresh();
  try {
    const apps = await getCustomerServiceApps();
    if (!disposed) appOptions.value = apps;
  } catch {
    // 会话列表仍可使用；应用选项失败由统一请求层提示。
  }
});

onBeforeUnmount(() => {
  disposed = true;
  clearTimeout(pollingTimer);
});
</script>

<template>
  <PageContainer title="客服工作台">
    <p class="customer-service__hint">排队和等待人工的会话可主动接手；人工接待不占用 AI 并发名额。</p>
    <el-tabs v-model="activeTab">
      <el-tab-pane v-for="tab in tabs" :key="tab.value" :label="tab.label" :name="tab.value" />
    </el-tabs>
    <div class="customer-service__workspace">
      <section class="customer-service__list" aria-label="会话列表">
        <Table
          :key="activeTab"
          ref="tableRef"
          :columns="columns"
          :search-fields="searchFields"
          :request="fetchSessions"
          :show-edit="false"
          :show-delete="false"
          :action-width="70"
          row-key="sessionId"
          perm-module="customerService"
          @view="selectedSessionId = $event.sessionId"
        >
          <template #toolbar>
            <Button perm="CustomerService.read" icon="Refresh" @click="(_event, done) => done(refreshList())">刷新列表</Button>
            <span v-if="pollingPaused" class="customer-service__hint">自动刷新已暂停，请点击刷新重试。</span>
          </template>
          <template #column-serviceStatus="{ row }">
            <el-tag :type="statusColor(row)">{{ statusLabel(row) }}</el-tag>
          </template>
          <template #column-updatedAt="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
        </Table>
      </section>
      <View :session-id="selectedSessionId" @changed="refreshList" />
    </div>
  </PageContainer>
</template>

<style scoped>
.customer-service__workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(360px, 1fr);
  gap: 20px;
  align-items: start;
}
.customer-service__list { min-width: 0; }
.customer-service__hint { color: var(--el-text-color-secondary); font-size: 13px; line-height: 1.6; }
@media (max-width: 1100px) {
  .customer-service__workspace { grid-template-columns: minmax(0, 1fr); }
}
</style>
