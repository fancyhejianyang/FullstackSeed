<script setup lang="ts" generic="T extends Record<string, any>">
/**
 * Table — 列表页一站式组件。
 *
 * 核心能力：
 * - 托管搜索表单、数据请求、分页、loading、内置操作列和勾选列
 * - `request` 统一接收分页 + 搜索参数，返回 `{ list, total }`
 * - `permModule` 只传模块名，内部按 `Module.action` 拼权限码并控制查看/编辑/删除/批量删除
 * - 传入 deleteRequest/batchDeleteRequest 时，组件内置确认、执行、提示和刷新
 * - 数据列默认单行省略，内容溢出时悬浮显示完整 Tooltip
 * - 通过 `#toolbar` / `#column-字段名` / `#actions` 保留业务扩展入口
 * - 暴露 refresh/search/clearSelection/getSelectedRows/runBatchDelete 等方法给页面 ref 调用
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { TableInstance } from 'element-plus';
import type { FormField } from './Form.vue';
import Form from './Form.vue';
import Button from './Button.vue';
import Checkbox from './Checkbox.vue';
import { useUserStore } from '@/stores/user';

export interface TableColumn {
  prop?: string;
  label: string;
  width?: string | number;
  minWidth?: string | number;
  fixed?: boolean | 'left' | 'right';
  // 是否单行省略并在溢出时显示 Tooltip；默认继承 Table 的全局配置
  showOverflowTooltip?: boolean;
  // 是否使用具名插槽 #column-[prop] 自定义单元格
  slot?: boolean;
}

export interface TableResult<R> {
  list: R[];
  total: number;
}

type RowId = string | number;

const props = withDefaults(
  defineProps<{
    columns: TableColumn[];
    displayMode?: 'table' | 'cards';
    // 数据请求函数：接收分页与搜索参数，返回 { list, total }
    request: (params: Record<string, any>) => Promise<TableResult<T>>;
    // 搜索栏字段配置（不传则不显示搜索栏）
    searchFields?: FormField[];
    pageSizes?: number[];
    // 权限模块名（如 'demo'），内部按动作码拼 `Module.action` 校验
    permModule?: string;
    // 是否显示内置操作列（查看/编辑/删除）
    showActions?: boolean;
    // 内置三个操作的开关
    showView?: boolean;
    showEdit?: boolean;
    showDelete?: boolean;
    actionWidth?: string | number;
    // 是否开启勾选列（用于批量操作扩展）
    checkAble?: boolean;
    // 勾选模式：single 单选 / multiple 多选
    checkMode?: 'single' | 'multiple';
    // 行主键字段名（用于批量删除提取 ids）
    rowKey?: string;
    // 组件内置删除 API（传入时由组件负责执行并自动刷新）
    deleteRequest?: (row: T) => Promise<unknown>;
    // 组件内置批量删除 API（传入时由组件负责执行并自动刷新）
    batchDeleteRequest?: (payload: {
      ids: RowId[];
      rows: T[];
    }) => Promise<unknown>;
    // 内置删除成功后是否自动刷新
    autoRefreshOnDelete?: boolean;
    // 内置批量删除成功后是否自动刷新
    autoRefreshOnBatchDelete?: boolean;
    // 是否自动撑满容器；设为 false 时按列宽产生横向滚动
    fit?: boolean;
    // 数据列是否默认单行省略，并在内容溢出时显示完整 Tooltip
    showOverflowTooltip?: boolean;
  }>(),
  {
    searchFields: () => [],
    displayMode: 'table',
    pageSizes: () => [10, 20, 50],
    permModule: '',
    showActions: true,
    showView: true,
    showEdit: true,
    showDelete: true,
    actionWidth: 180,
    checkAble: false,
    checkMode: 'multiple',
    rowKey: 'id',
    autoRefreshOnDelete: true,
    autoRefreshOnBatchDelete: true,
    fit: true,
    showOverflowTooltip: true,
  },
);

const emit = defineEmits<{
  (e: 'view', row: T): void;
  (e: 'edit', row: T): void;
  // 兼容事件：删除完成（或未接管时由页面自行处理）
  (e: 'delete', row: T): void;
  // 批量删除完成（或未接管时由页面自行处理）
  (e: 'batch-delete', rows: T[]): void;
  (e: 'selection-change', rows: T[]): void;
  (
    e: 'selection-action',
    payload: {
      mode: 'single' | 'multiple';
      action: 'select' | 'clear';
      rows: T[];
    },
  ): void;
}>();

const userStore = useUserStore();

// 按权限模块拼权限码并校验（无 permModule 时不做限制）
// 格式：模块名首字母大写 + 点号 + 动作，如 demo → Demo.batchDelete
function canDo(
  action: 'read' | 'create' | 'update' | 'delete' | 'batchDelete',
) {
  if (!props.permModule) return true;
  const mod =
    props.permModule.charAt(0).toUpperCase() + props.permModule.slice(1);
  return userStore.hasPermission(`${mod}.${action}`);
}
const canView = computed(
  () => props.showActions && props.showView && canDo('read'),
);
const canEdit = computed(
  () => props.showActions && props.showEdit && canDo('update'),
);
const canDelete = computed(
  () => props.showActions && props.showDelete && canDo('delete'),
);
const canBatchDelete = computed(() => canDo('batchDelete'));
// 操作列是否有任一可见按钮（含自定义插槽）
const hasActionColumn = computed(
  () => canView.value || canEdit.value || canDelete.value,
);

const loading = ref(false);
const deleting = ref(false);
const batchDeleting = ref(false);
const list = shallowRef<T[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(props.pageSizes[0] ?? 10);
const searchModel = reactive<Record<string, any>>({});
// 搜索表单允许先编辑，只有点击查询后才成为列表实际使用的条件。
// 刷新列表时复用这份快照，避免弹窗关闭后丢失最近一次查询条件。
const appliedSearchModel = ref<Record<string, any>>({});
const tableRef = ref<TableInstance>();
const selectedRows = shallowRef<T[]>([]);

let syncingSingleSelection = false;
let requestVersion = 0;
let disposed = false;

function isCancelError(error: unknown) {
  return error === 'cancel' || error === 'close';
}

function getRowId(row: T): RowId | undefined {
  const value = row[props.rowKey];
  return typeof value === 'string' || typeof value === 'number'
    ? value
    : undefined;
}

function getSelectedRows() {
  return [...selectedRows.value];
}

function emitSelection(rows: T[]) {
  emit('selection-change', rows);
  emit('selection-action', {
    mode: props.checkMode,
    action: rows.length ? 'select' : 'clear',
    rows,
  });
}

function clearSelection() {
  tableRef.value?.clearSelection();
  selectedRows.value = [];
  emitSelection([]);
}

function handleSelectionChange(rows: T[]) {
  if (!props.checkAble) return;
  if (syncingSingleSelection) return;

  if (props.checkMode === 'single' && rows.length > 1) {
    const latest = rows[rows.length - 1];
    syncingSingleSelection = true;
    tableRef.value?.clearSelection();
    if (latest) tableRef.value?.toggleRowSelection(latest, true);
    syncingSingleSelection = false;
    selectedRows.value = latest ? [latest] : [];
    emitSelection([...selectedRows.value]);
    return;
  }

  selectedRows.value = rows;
  emitSelection([...selectedRows.value]);
}

function handleRowClick(row: T) {
  if (!props.checkAble || props.checkMode !== 'single') return;
  syncingSingleSelection = true;
  tableRef.value?.clearSelection();
  tableRef.value?.toggleRowSelection(row, true);
  syncingSingleSelection = false;
  selectedRows.value = [row];
  emitSelection([...selectedRows.value]);
}

function toggleCardSelection(row: T, checked: boolean) {
  const remaining = selectedRows.value.filter(
    (item) => getRowId(item) !== getRowId(row),
  );
  selectedRows.value = checked
    ? props.checkMode === 'single'
      ? [row]
      : [...remaining, row]
    : remaining;
  emitSelection([...selectedRows.value]);
}

async function fetchData() {
  if (disposed) return;
  const version = ++requestVersion;
  loading.value = true;
  try {
    const activeFilters = Object.fromEntries(
      Object.entries(appliedSearchModel.value).filter(
        ([, value]) => value !== '' && value !== null && value !== undefined,
      ),
    );
    const res = await props.request({
      page: page.value,
      pageSize: pageSize.value,
      ...activeFilters,
    });
    if (disposed || version !== requestVersion) return;
    list.value = res.list;
    total.value = res.total;
    if (props.displayMode === 'cards') clearSelection();
  } catch (error) {
    if (!disposed && version === requestVersion) throw error;
  } finally {
    if (!disposed && version === requestVersion) loading.value = false;
  }
}

async function handleSearch() {
  page.value = 1;
  appliedSearchModel.value = { ...searchModel };
  await fetchData();
}

async function handlePageChange(value: number) {
  if (page.value === value) return;
  page.value = value;
  await fetchData();
}

async function handlePageSizeChange(value: number) {
  if (pageSize.value === value) return;
  pageSize.value = value;
  page.value = 1;
  // 每页数量变更沿用已提交条件，不把尚未查询的输入带入请求。
  await fetchData();
}

async function refreshAfterDelete() {
  try {
    await fetchData();
  } catch {
    if (!disposed) ElMessage.warning('删除已完成，列表刷新失败，请刷新重试');
  }
}

async function handleReset() {
  Object.keys(searchModel).forEach((k) => (searchModel[k] = ''));
  appliedSearchModel.value = {};
  page.value = 1;
  await fetchData();
}

// 内置删除：组件负责确认、执行 API（可选）与刷新，并通知页面
async function handleDelete(row: T) {
  if (disposed || deleting.value || batchDeleting.value || !canDo('delete')) return;
  deleting.value = true;
  try {
    await ElMessageBox.confirm('确认删除该记录？', '提示', { type: 'warning' });
    if (disposed || !canDo('delete')) return;

    if (props.deleteRequest) {
      await props.deleteRequest(row);
      if (disposed) return;
      ElMessage.success('删除成功');
      clearSelection();
      emit('delete', row);
      if (props.autoRefreshOnDelete) {
        await refreshAfterDelete();
      }
    } else {
      emit('delete', row);
    }
  } catch (error) {
    if (!disposed && !isCancelError(error)) {
      ElMessage.error('删除失败，请稍后重试');
    }
  } finally {
    deleting.value = false;
  }
}

// 批量删除：组件负责确认、执行 API（可选）与刷新，并通知页面
async function runBatchDelete() {
  if (disposed || deleting.value || batchDeleting.value || !canBatchDelete.value) return;
  const rows = getSelectedRows();
  if (!rows.length) {
    ElMessage.warning('请先选择要删除的记录');
    return;
  }
  const ids = rows.map(getRowId).filter((id): id is RowId => id !== undefined);
  if (props.batchDeleteRequest && ids.length !== rows.length) {
    ElMessage.warning('所选记录缺少编号，请刷新后重试');
    return;
  }

  batchDeleting.value = true;
  try {
    await ElMessageBox.confirm(
      `确认删除选中的 ${rows.length} 条记录？`,
      '提示',
      {
        type: 'warning',
      },
    );
    if (disposed || !canBatchDelete.value) return;

    if (props.batchDeleteRequest) {
      await props.batchDeleteRequest({ ids, rows });
      if (disposed) return;
      ElMessage.success('批量删除成功');
      clearSelection();
      emit('batch-delete', rows);
      if (props.autoRefreshOnBatchDelete) {
        await refreshAfterDelete();
      }
    } else {
      emit('batch-delete', rows);
    }
  } catch (error) {
    if (!disposed && !isCancelError(error)) {
      ElMessage.error('批量删除失败，请稍后重试');
    }
  } finally {
    batchDeleting.value = false;
  }
}

// 暴露方法供父组件扩展（增删改后刷新、批量选择等）
defineExpose({
  refresh: fetchData,
  search: handleSearch,
  clearSelection,
  getSelectedRows,
  canBatchDelete,
  runBatchDelete,
});

onMounted(fetchData);
onBeforeUnmount(() => {
  disposed = true;
  requestVersion += 1;
});
</script>

<template>
  <div class="pro-table">
    <!-- 搜索栏 -->
    <Form
      v-if="props.searchFields.length"
      v-model="searchModel"
      :fields="props.searchFields"
      inline
      class="pro-table__search"
      @enter="handleSearch"
    >
      <template
        v-for="f in props.searchFields.filter((i) => i.slot)"
        #[`field-${f.prop}`]="scope"
        :key="f.prop"
      >
        <slot :name="`search-${f.prop}`" v-bind="scope" />
      </template>
      <template #actions>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </template>
    </Form>

    <!-- 工具栏（右上按钮区） -->
    <div v-if="$slots.toolbar" class="pro-table__toolbar">
      <slot
        name="toolbar"
        :selected-rows="selectedRows"
        :can-batch-delete="canBatchDelete"
        :run-batch-delete="runBatchDelete"
        :batch-deleting="batchDeleting"
      />
    </div>

    <!-- 表格 -->
    <div
      v-if="props.displayMode === 'cards'"
      v-loading="loading"
      class="pro-table__cards"
    >
      <el-empty
        v-if="!loading && !list.length"
        description="暂无配置"
        class="pro-table__cards-empty"
      />
      <article
        v-for="(row, index) in list"
        :key="getRowId(row) ?? index"
        class="pro-table__card"
      >
        <Checkbox
          v-if="props.checkAble"
          class="pro-table__card-check"
          :model-value="
            selectedRows.some((item) => getRowId(item) === getRowId(row))
          "
          label="选择"
          @update:model-value="toggleCardSelection(row, $event)"
        />
        <div class="pro-table__card-content">
          <slot name="card" :row="row" :index="index" />
        </div>
        <div
          v-if="hasActionColumn || $slots.actions"
          class="pro-table__card-actions"
        >
          <Button
            v-if="canView"
            link
            :perm="
              permModule
                ? `${permModule.charAt(0).toUpperCase() + permModule.slice(1)}.read`
                : ''
            "
            :auto-icon="false"
            @click="emit('view', row)"
            >查看</Button
          >
          <Button
            v-if="canEdit"
            link
            :perm="
              permModule
                ? `${permModule.charAt(0).toUpperCase() + permModule.slice(1)}.update`
                : ''
            "
            :auto-icon="false"
            @click="emit('edit', row)"
            >编辑</Button
          >
          <Button
            v-if="canDelete"
            link
            :perm="
              permModule
                ? `${permModule.charAt(0).toUpperCase() + permModule.slice(1)}.delete`
                : ''
            "
            :auto-icon="false"
            :confirm="false"
            :loading="deleting"
            :disabled="batchDeleting"
            @click="handleDelete(row)"
            >删除</Button
          >
          <slot name="actions" :row="row" :$index="index" />
        </div>
      </article>
    </div>
    <el-table
      v-else
      ref="tableRef"
      v-loading="loading"
      :data="list"
      border
      stripe
      :fit="props.fit"
      :show-overflow-tooltip="props.showOverflowTooltip"
      @selection-change="handleSelectionChange"
      @row-click="handleRowClick"
    >
      <el-table-column
        v-if="props.checkAble"
        type="selection"
        width="48"
        fixed="left"
      />

      <!-- 操作列：排在最前，固定左侧 -->
      <el-table-column
        v-if="hasActionColumn || $slots.actions"
        label="操作"
        class-name="pro-table__action-column"
        :width="props.actionWidth"
        fixed="left"
        :show-overflow-tooltip="false"
      >
        <template #default="scope">
          <el-button
            v-if="canView"
            link
            type="info"
            @click="emit('view', scope.row)"
          >
            查看
          </el-button>
          <el-button
            v-if="canEdit"
            link
            type="primary"
            @click="emit('edit', scope.row)"
          >
            编辑
          </el-button>
          <el-button
            v-if="canDelete"
            link
            type="danger"
            :loading="deleting"
            :disabled="batchDeleting"
            @click="handleDelete(scope.row)"
          >
            删除
          </el-button>
          <!-- 额外自定义操作 -->
          <slot name="actions" v-bind="scope" />
        </template>
      </el-table-column>

      <el-table-column
        v-for="col in props.columns"
        :key="col.label"
        :prop="col.prop"
        :label="col.label"
        :width="col.width"
        :min-width="col.minWidth"
        :fixed="col.fixed"
        :show-overflow-tooltip="col.showOverflowTooltip"
      >
        <template v-if="col.slot && col.prop" #default="scope">
          <slot :name="`column-${col.prop}`" v-bind="scope" />
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="pro-table__pagination">
      <el-pagination
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        :page-sizes="props.pageSizes"
        layout="total, sizes, prev, pager, next"
        @update:current-page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.pro-table__toolbar {
  margin-bottom: 12px;
}
.pro-table__pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.pro-table__cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
  gap: 16px;
  min-height: 160px;
}
.pro-table__card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 18px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-bg-color);
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}
.pro-table__card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 4px 14px rgba(48, 65, 86, 0.06);
}
.pro-table__card-check {
  align-self: flex-start;
  margin-bottom: 8px;
}
.pro-table__card-content {
  flex: 1;
  min-width: 0;
}
.pro-table__card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 18px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.pro-table__cards-empty {
  grid-column: 1 / -1;
}
@media (prefers-reduced-motion: reduce) {
  .pro-table__card {
    transition: none;
  }
}
</style>
