<script setup lang="ts">
import type { AgentBusinessQueryResult } from "@/api/agentWorkspace";
defineProps<{ result: AgentBusinessQueryResult }>();
function display(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "是" : "否";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
</script>
<template>
  <section class="business-result">
    <strong>{{ result.name }}</strong>
    <p>
      共 {{ result.total }} 条 · 第 {{ result.page }} 页 · 本次展示
      {{ result.list.length }} 条
    </p>
    <el-empty
      v-if="!result.list.length"
      description="已查询，未找到匹配记录"
      :image-size="60"
    />
    <el-descriptions
      v-for="(row, index) in result.list"
      :key="String(row.id ?? index)"
      :column="1"
      border
      size="small"
      class="business-result__record"
    >
      <el-descriptions-item
        v-for="field in result.fields.filter((f) => row[f.prop] !== undefined)"
        :key="field.prop"
        :label="field.label"
      >
        <span class="business-result__value">{{
          display(row[field.prop])
        }}</span>
      </el-descriptions-item>
    </el-descriptions>
    <router-link :to="result.detailPath">打开业务管理页面</router-link>
    <p class="business-result__hint">
      可继续输入“查看 ID 详情”或“查询下一页”；新增数据需要生成待确认操作并确认。
    </p>
  </section>
</template>
<style scoped>
.business-result {
  padding: 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 14px;
  background: var(--el-bg-color);
}
.business-result p {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.business-result__record {
  margin-bottom: 12px;
}
.business-result__value {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.business-result__hint {
  margin-bottom: 0;
}
</style>
