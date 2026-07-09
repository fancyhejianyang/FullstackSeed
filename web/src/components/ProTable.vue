<script setup lang="ts" generic="T extends Record<string, any>">
import { computed, onMounted, reactive, ref, shallowRef } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { TableInstance } from 'element-plus';
import type { ProFormField } from './ProForm.vue';
import ProForm from './ProForm.vue';
import { useUserStore } from '@/stores/user';

export interface ProTableColumn {
  prop?: string;
  label: string;
  width?: string | number;
  minWidth?: string | number;
  fixed?: boolean | 'left' | 'right';
  // 是否使用具名插槽 #column-[prop] 自定义单元格
  slot?: boolean;
}

export interface ProTableResult<R> {
  list: R[];
  total: number;
}

type RowId = string | number;

const props = withDefaults(
  defineProps<{
    columns: ProTableColumn[];
    // 数据请求函数：接收分页与搜索参数，返回 { list, total }
    request: (params: Record<string, any>) => Promise<ProTableResult<T>>;
    // 搜索栏字段配置（不传则不显示搜索栏）
    searchFields?: ProFormField[];
    pageSizes?: number[];
    // 权限模块名（如 'article'），内部按动作码拼 `Module.action` 校验
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
    batchDeleteRequest?: (payload: { ids: RowId[]; rows: T[] }) => Promise<unknown>;
    // 内置删除成功后是否自动刷新
    autoRefreshOnDelete?: boolean;
    // 内置批量删除成功后是否自动刷新
    autoRefreshOnBatchDelete?: boolean;
  }>(),
  {
    searchFields: () => [],
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
// 格式：模块名首字母大写 + 点号 + 动作，如 article → Article.batchDelete
function canDo(action: 'read' | 'create' | 'update' | 'delete' | 'batchDelete') {
  if (!props.permModule) return true;
  const mod = props.permModule.charAt(0).toUpperCase() + props.permModule.slice(1);
  return userStore.hasPermission(`${mod}.${action}`);
}
const canView = computed(() => props.showView && canDo('read'));
const canEdit = computed(() => props.showEdit && canDo('update'));
const canDelete = computed(() => props.showDelete && canDo('delete'));
const canBatchDelete = computed(() => canDo('batchDelete'));
// 操作列是否有任一可见按钮（含自定义插槽）
const hasActionColumn = computed(
  () => props.showActions && (canView.value || canEdit.value || canDelete.value),
);

const loading = ref(false);
const deleting = ref(false);
const batchDeleting = ref(false);
const list = shallowRef<T[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const searchModel = reactive<Record<string, any>>({});
const tableRef = ref<TableInstance>();
const selectedRows = shallowRef<T[]>([]);

let syncingSingleSelection = false;

function isCancelError(error: unknown) {
  return error === 'cancel' || error === 'close';
}

function getRowId(row: T): RowId | undefined {
  const value = row[props.rowKey];
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

function getSelectedRows() {
  return [...selectedRows.value];
}

function getSelectedIds() {
  return selectedRows.value.map((row) => getRowId(row)).filter((id): id is RowId => id !== undefined);
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

async function fetchData() {
  loading.value = true;
  try {
    const res = await props.request({
      page: page.value,
      pageSize: pageSize.value,
      ...searchModel,
    });
    list.value = res.list;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

async function handleSearch() {
  page.value = 1;
  await fetchData();
}

async function handleReset() {
  Object.keys(searchModel).forEach((k) => (searchModel[k] = ''));
  page.value = 1;
  await fetchData();
}

// 内置删除：组件负责确认、执行 API（可选）与刷新，并通知页面
async function handleDelete(row: T) {
  try {
    await ElMessageBox.confirm('确认删除该记录？', '提示', { type: 'warning' });

    if (props.deleteRequest) {
      deleting.value = true;
      await props.deleteRequest(row);
      ElMessage.success('删除成功');
      if (props.autoRefreshOnDelete) {
        await fetchData();
      }
      clearSelection();
    }

    emit('delete', row);
  } catch (error) {
    if (!isCancelError(error)) {
      ElMessage.error('删除失败，请稍后重试');
    }
  } finally {
    deleting.value = false;
  }
}

// 批量删除：组件负责确认、执行 API（可选）与刷新，并通知页面
async function runBatchDelete() {
  const rows = getSelectedRows();
  if (!rows.length) {
    ElMessage.warning('请先选择要删除的记录');
    return;
  }

  try {
    await ElMessageBox.confirm(`确认删除选中的 ${rows.length} 条记录？`, '提示', {
      type: 'warning',
    });

    if (props.batchDeleteRequest) {
      batchDeleting.value = true;
      await props.batchDeleteRequest({ ids: getSelectedIds(), rows });
      ElMessage.success('批量删除成功');
      if (props.autoRefreshOnBatchDelete) {
        await fetchData();
      }
      clearSelection();
    }

    emit('batch-delete', rows);
  } catch (error) {
    if (!isCancelError(error)) {
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
</script>

<template>
  <div class="pro-table">
    <!-- 搜索栏 -->
    <ProForm
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
    </ProForm>

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
    <el-table
      ref="tableRef"
      v-loading="loading"
      :data="list"
      border
      stripe
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
        :width="props.actionWidth"
        fixed="left"
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
      >
        <template v-if="col.slot && col.prop" #default="scope">
          <slot :name="`column-${col.prop}`" v-bind="scope" />
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="pro-table__pagination">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="props.pageSizes"
        layout="total, sizes, prev, pager, next"
        @current-change="fetchData"
        @size-change="handleSearch"
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
</style>
