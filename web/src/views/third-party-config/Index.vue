<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import PageContainer from '@/components/PageContainer.vue';
import Button from '@/components/Button.vue';
import {
  getThirdPartyOverview,
  type ThirdPartySummary,
} from '@/api/thirdPartyConfig';
const router = useRouter();
const items = ref<ThirdPartySummary[]>([]),
  loading = ref(false),
  error = ref(false);
const labels = {
  configured: '已配置',
  empty: '未配置',
  unsupported: '待接入',
  unavailable: '读取失败',
};
async function load() {
  loading.value = true;
  error.value = false;
  try {
    items.value = await getThirdPartyOverview();
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
}
onMounted(load);
</script>
<template>
  <PageContainer title="第三方配置">
    <div class="overview-header">
      <div>
        <h2>服务概览</h2>
        <p>统一管理外部服务。配置状态不代表连通性检测结果。</p>
      </div>
      <Button icon="Refresh" :loading="loading" @click="load">刷新</Button>
    </div>
    <el-skeleton v-if="loading" :rows="5" animated />
    <el-empty v-else-if="error" description="概览加载失败"
      ><Button @click="load">重试</Button></el-empty
    >
    <el-empty v-else-if="!items.length" description="暂无可访问的第三方配置" />
    <div v-else class="service-grid">
      <article v-for="item in items" :key="item.key" class="service-card">
        <div class="service-heading">
          <h3>{{ item.name }}</h3>
          <el-tag
            :type="
              item.status === 'configured'
                ? 'success'
                : item.status === 'unavailable'
                  ? 'danger'
                  : 'info'
            "
            >{{ labels[item.status] }}</el-tag
          >
        </div>
        <p v-if="item.status === 'unsupported'">
          接口尚未接入，暂不提供有效配置。
        </p>
        <p v-else-if="item.status === 'unavailable'">
          暂时无法读取配置状态，请稍后重试。
        </p>
        <p v-else>配置 {{ item.total }} 项 · 启用 {{ item.enabled }} 项</p>
        <div class="service-footer">
          <span>{{
            item.updatedAt
              ? '更新于 ' +
                new Date(item.updatedAt).toLocaleString('zh-CN', {
                  timeZone: 'Asia/Shanghai',
                  hour12: false,
                })
              : '暂无更新时间'
          }}</span
          ><Button
            :disabled="item.status === 'unsupported'"
            @click="router.push(item.path)"
            >管理配置</Button
          >
        </div>
      </article>
    </div>
  </PageContainer>
</template>
<style scoped>
.overview-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  margin-bottom: 24px;
}
.overview-header h2 {
  font-size: 20px;
  margin: 0 0 8px;
  color: #263445;
}
.overview-header p {
  color: #606b7b;
  margin: 0;
  font-size: 13px;
}
.service-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 350px), 1fr));
  gap: 20px;
}
.service-card {
  border: 1px solid #dce3ed;
  border-radius: 12px;
  padding: 22px;
  min-width: 0;
}
.service-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.service-heading h3 {
  margin: 0;
  font-size: 16px;
  color: #263445;
}
.service-card p {
  color: #606b7b;
  font-size: 14px;
  margin: 24px 0;
}
.service-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.service-footer span {
  font-size: 12px;
  color: #687587;
}
</style>
