<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import {
  getModuleModelFields,
  getModuleModels,
  type ModuleModelFieldMeta,
  type ModuleModelSummary,
} from '@/api/moduleModel';

const loadingModules = ref(false);
const loadingFields = ref(false);
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
  loadingModules.value = true;
  try {
    modules.value = await getModuleModels();
    selectedModuleId.value = modules.value[0]?.moduleId ?? '';
  } finally {
    loadingModules.value = false;
  }
}

async function fetchFields(moduleId: string) {
  if (!moduleId) {
    fields.value = [];
    return;
  }
  loadingFields.value = true;
  try {
    fields.value = await getModuleModelFields(moduleId);
  } finally {
    loadingFields.value = false;
  }
}

watch(selectedModuleId, fetchFields);
onMounted(fetchModules);
</script>

<template>
  <PageContainer title="数据导入">
    <div class="data-import__toolbar">
      <el-select
        v-model="selectedModuleId"
        v-loading="loadingModules"
        class="data-import__select"
        placeholder="选择导入模块"
        filterable
      >
        <el-option
          v-for="item in moduleOptions"
          :key="item.value"
          :label="item.label"
          :value="item.value"
        />
      </el-select>
      <el-button type="primary" disabled>上传导入文件</el-button>
    </div>

    <el-table v-loading="loadingFields" :data="fields" border>
      <el-table-column prop="label" label="字段名称" min-width="140" />
      <el-table-column prop="prop" label="字段标识" min-width="140" />
      <el-table-column prop="type" label="字段类型" width="120" />
      <el-table-column label="约束" min-width="180">
        <template #default="{ row }">
          <el-space wrap>
            <el-tag v-if="row.required" size="small" type="danger">必填</el-tag>
            <el-tag v-if="row.unique" size="small" type="warning">唯一</el-tag>
            <el-tag v-if="row.readonly" size="small" type="info">只读</el-tag>
            <el-tag v-if="row.nullable" size="small">可空</el-tag>
          </el-space>
        </template>
      </el-table-column>
      <el-table-column label="枚举值" min-width="180">
        <template #default="{ row }">
          {{ row.enumValues?.join(' / ') || '-' }}
        </template>
      </el-table-column>
    </el-table>
  </PageContainer>
</template>

<style scoped>
.data-import__toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.data-import__select {
  width: 280px;
}
</style>
