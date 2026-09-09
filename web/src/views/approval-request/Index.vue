<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import Dialog from '@/components/Dialog.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import type { FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import { useUserStore } from '@/stores/user';
import {
  approvalRequestStatusOptions,
  approveApprovalRequest,
  getApprovalRequest,
  getApprovalRequests,
  rejectApprovalRequest,
  type ApprovalRequest,
  type ApprovalRequestStatus,
  type QueryApprovalRequestParams,
} from '@/api/approvalRequest';

const userStore = useUserStore();
const tableRef = ref<{ refresh: () => Promise<void> }>();
const detailVisible = ref(false);
const detailLoading = ref(false);
const currentDetail = ref<ApprovalRequest | null>(null);
const canReview = computed(() => !!userStore.userInfo?.isAdmin);

const columns: TableColumn[] = [
  { prop: 'businessType', label: '审批类型', width: 110, slot: true },
  { prop: 'businessTitle', label: '审批内容', minWidth: 260 },
  { prop: 'applicantName', label: '申请人', width: 120 },
  { prop: 'status', label: '状态', width: 100, slot: true },
  { prop: 'submittedAt', label: '提交时间', width: 180, slot: true },
  { prop: 'reviewerName', label: '审批人', width: 120, slot: true },
  { prop: 'reviewedAt', label: '审批时间', width: 180, slot: true },
];

const searchFields = computed<FormField[]>(() => [
  {
    prop: 'businessType',
    label: '审批类型',
    type: 'select',
    options: [
      { label: '全部', value: '' },
      { label: '标准问答', value: 'standardQa' },
    ],
  },
  {
    prop: 'status',
    label: '审批状态',
    type: 'select',
    options: [{ label: '全部', value: '' }, ...approvalRequestStatusOptions],
  },
  { prop: 'keyword', label: '关键词', type: 'input', placeholder: '审批内容、申请人或审批人' },
]);

function fetchApprovals(params: Record<string, unknown>) {
  return getApprovalRequests(params as QueryApprovalRequestParams);
}

async function openDetail(row: ApprovalRequest) {
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    currentDetail.value = await getApprovalRequest(row.id);
  } finally {
    detailLoading.value = false;
  }
}

async function handleApprove(row: ApprovalRequest) {
  await approveApprovalRequest(row.id);
  ElMessage.success('审批已通过，标准问答已发布');
  await refreshAfterReview();
}

async function handleReject(row: ApprovalRequest) {
  try {
    const { value } = await ElMessageBox.prompt('请填写驳回原因，申请人可修改后重新提交。', '驳回审批', {
      inputPlaceholder: '请输入驳回原因',
      inputValidator: (input) => (input?.trim() ? true : '请填写驳回原因'),
      confirmButtonText: '确认驳回',
      cancelButtonText: '取消',
      type: 'warning',
    });
    await rejectApprovalRequest(row.id, value.trim());
    ElMessage.success('审批已驳回，标准问答已退回草稿');
    await refreshAfterReview();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error('驳回失败，请稍后重试');
    }
  }
}

async function refreshAfterReview() {
  await tableRef.value?.refresh();
  if (currentDetail.value?.id) {
    currentDetail.value = await getApprovalRequest(currentDetail.value.id);
  }
}

function getStatusLabel(status: ApprovalRequestStatus) {
  return approvalRequestStatusOptions.find((item) => item.value === status)?.label || status;
}

function getStatusType(status: ApprovalRequestStatus) {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  return 'warning';
}

function getSnapshotText(key: string) {
  const value = currentDetail.value?.contentSnapshot?.[key];
  if (Array.isArray(value)) return value.join('、') || '-';
  return value === null || value === undefined || value === '' ? '-' : String(value);
}
</script>

<template>
  <PageContainer title="审批管理">
    <Table
      ref="tableRef"
      perm-module="approvalRequest"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchApprovals"
      :show-edit="false"
      :show-delete="false"
      action-width="210"
      @view="openDetail"
    >
      <template #column-businessType>
        标准问答
      </template>
      <template #column-status="{ row }">
        <el-tag :type="getStatusType(row.status)">{{ getStatusLabel(row.status) }}</el-tag>
      </template>
      <template #column-submittedAt="{ row }">
        {{ formatDateTime(row.submittedAt) }}
      </template>
      <template #column-reviewerName="{ row }">
        {{ row.reviewerName || '-' }}
      </template>
      <template #column-reviewedAt="{ row }">
        {{ row.reviewedAt ? formatDateTime(row.reviewedAt) : '-' }}
      </template>
      <template #actions="{ row }">
        <template v-if="canReview && row.status === 'pending'">
          <Button perm="ApprovalRequest.update" link :confirm="true" @click="handleApprove(row)">
            通过
          </Button>
          <Button perm="ApprovalRequest.update" link @click="handleReject(row)">
            驳回
          </Button>
        </template>
      </template>
    </Table>

    <Dialog v-model="detailVisible" title="审批详情" width="820px" :show-footer="false">
      <div v-loading="detailLoading" class="approval-request__detail">
        <template v-if="currentDetail">
          <div class="approval-request__meta">
            <span>申请人：{{ currentDetail.applicantName }}</span>
            <span>提交时间：{{ formatDateTime(currentDetail.submittedAt) }}</span>
            <span>状态：{{ getStatusLabel(currentDetail.status) }}</span>
            <span>审批人：{{ currentDetail.reviewerName || '-' }}</span>
            <span>审批时间：{{ currentDetail.reviewedAt ? formatDateTime(currentDetail.reviewedAt) : '-' }}</span>
          </div>
          <div class="approval-request__section">
            <label>标准问题</label>
            <p>{{ getSnapshotText('question') }}</p>
          </div>
          <div class="approval-request__section">
            <label>标准答案</label>
            <p class="approval-request__answer">{{ getSnapshotText('answer') }}</p>
          </div>
          <div class="approval-request__section">
            <label>相似问法</label>
            <p>{{ getSnapshotText('aliases') }}</p>
          </div>
          <div class="approval-request__section">
            <label>关键词</label>
            <p>{{ getSnapshotText('keywords') }}</p>
          </div>
          <div v-if="currentDetail.remark" class="approval-request__section">
            <label>审批备注</label>
            <p>{{ currentDetail.remark }}</p>
          </div>
        </template>
      </div>
    </Dialog>
  </PageContainer>
</template>

<style scoped>
.approval-request__detail {
  min-height: 120px;
}

.approval-request__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  margin-bottom: 16px;
  padding: 12px;
  border-radius: 4px;
  background: #f5f7fa;
  color: #606266;
  font-size: 13px;
}

.approval-request__section {
  margin-top: 14px;
}

.approval-request__section label {
  color: #909399;
  font-size: 13px;
}

.approval-request__section p {
  margin: 6px 0 0;
  color: #303133;
  line-height: 1.7;
  white-space: pre-wrap;
}

.approval-request__answer {
  max-height: 260px;
  overflow: auto;
}
</style>
