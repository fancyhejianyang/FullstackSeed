<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

function goHome() {
  router.push('/');
}
function goBack() {
  router.back();
}
</script>

<template>
  <div class="not-found">
    <div class="not-found__code">404</div>
    <div class="not-found__desc">抱歉，您访问的页面不存在</div>
    <div class="not-found__actions">
      <el-button @click="goBack">返回上一页</el-button>
      <el-button type="primary" @click="goHome">回到首页</el-button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  color: var(--color-text-regular);
}
.not-found__code {
  font-size: 96px;
  font-weight: 700;
  color: var(--color-primary);
  line-height: 1;
}
.not-found__desc {
  margin: 16px 0 24px;
  font-size: 16px;
}
.not-found__actions {
  display: flex;
  gap: 12px;
}
</style>
