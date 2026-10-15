<script setup lang="ts">
import { useRouter } from "vue-router";
import Button from "@/components/Button.vue";
import type { ProductSkuChatContext } from "@/api/knowledgeAiChat";

const props = defineProps<{
  context?: ProductSkuChatContext | null;
  detailPath?: string;
}>();
const router = useRouter();

function showDetail() {
  if (props.detailPath) router.push(props.detailPath);
}
</script>

<template>
  <div class="query-card">
    <div class="query-card__title">业务查询结果</div>
    <el-empty
      v-if="!context"
      description="未找到匹配的产品或 SKU"
      :image-size="64"
    />
    <template v-else-if="context.matchType === 'products'">
      <div class="query-card__hint">存在多个候选产品，请确认目标：</div>
      <div
        v-for="item in context.candidateProducts"
        :key="item.product.id"
        class="query-card__candidate"
      >
        <strong>{{ item.product.name }}</strong>
        <span>{{ item.product.productCode }}</span>
        <span>{{ item.candidateSkus.length }} 个候选 SKU</span>
      </div>
    </template>
    <template v-else>
      <el-descriptions :column="1" border size="small">
        <el-descriptions-item label="产品">
          {{ context.product.name }}（{{ context.product.productCode }}）
        </el-descriptions-item>
        <el-descriptions-item v-if="context.sku" label="SKU">
          {{ context.sku.name || "-" }}（{{ context.sku.skuCode }}）
        </el-descriptions-item>
        <el-descriptions-item v-if="context.sku" label="规格">
          {{ JSON.stringify(context.sku.specifications) }}
        </el-descriptions-item>
        <el-descriptions-item v-else label="候选 SKU">
          {{
            context.candidateSkus.map((item) => item.skuCode).join("、") ||
            "暂无"
          }}
        </el-descriptions-item>
      </el-descriptions>
    </template>
    <div v-if="detailPath" class="query-card__actions">
      <Button icon="View" @click="showDetail">查看业务数据</Button>
    </div>
  </div>
</template>

<style scoped>
.query-card {
  padding: 16px;
  border: 1px solid #e7eaf0;
  border-radius: 14px;
  background: #fcfdff;
  box-shadow: 0 6px 20px rgb(31 35 41 / 6%);
}
.query-card__title {
  margin-bottom: 12px;
  color: #1f2329;
  font-weight: 600;
}
.query-card__hint {
  margin-bottom: 8px;
  color: #606266;
}
.query-card__candidate {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
  padding: 10px 12px;
  color: #606266;
  border-radius: 9px;
  background: #f4f6f8;
}
.query-card__actions {
  margin-top: 12px;
}
</style>
