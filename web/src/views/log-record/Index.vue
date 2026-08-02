<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import {
  getModuleModelFields,
  getModuleModels,
  type ModuleModelFieldMeta,
  type ModuleModelSummary,
} from '@/api/moduleModel';

const loading = ref(false);
const modules = ref<ModuleModelSummary[]>([]);
const fields = ref<ModuleModelFieldMeta[]>([]);
const selectedModuleId = ref('');

const moduleOptions = computed(() =>
  modules.value.map((item) => ({
    label: `${item.moduleName} (${item.moduleId})`,
    value: item.moduleId,
  })),
);

async function fetchModules() {
  loading.value = true;
  try {
    modules.value = await getModuleModels();
    selectedModuleId.value = modules.value[0]?.moduleId ?? '';
  } finally {
    loading.value = false;
  }
}

async function fetchFields(moduleId: string) {
  fields.value = moduleId ? await getModuleModelFields(moduleId) : [];
}

watch(selectedModuleId, fetchFields);
onMounted(fetchModules);
</script>

<template>
  <PageContainer title="日志记录">
    <div class="log-record__toolbar">
      <el-select
        v-model="selectedModuleId"
        v-loading="loading"
        class="log-record__select"
        placeholder="选择日志模块"
        filterable
      >
        <el-option
          v-for="item in moduleOptions"
          :key="item.value"
          :label="item.label"
          :value="item.value"
        />
      </el-select>
      <el-button disabled>查询日志</el-button>
    </div>

    <el-table :data="fields" border>
      <el-table-column prop="label" label="字段名称" min-width="140" />
      <el-table-column prop="prop" label="字段标识" min-width="140" />
      <el-table-column prop="type" label="字段类型" width="120" />
      <el-table-column prop="description" label="说明" min-width="180">
        <template #default="{ row }">{{ row.description || '-' }}</template>
      </el-table-column>
    </el-table>
  </PageContainer>
</template>

<style scoped>
.log-record__toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.log-record__select {
  width: 280px;
}
</style>
