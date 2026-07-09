<script setup lang="ts">
import { useUserStore } from '@/stores/user';

const userStore = useUserStore();

const stats = [
  { label: '用户总数', value: 1, color: '#409eff' },
  { label: '今日访问', value: 0, color: '#67c23a' },
  { label: '待办事项', value: 0, color: '#e6a23c' },
  { label: '系统消息', value: 0, color: '#f56c6c' },
];
</script>

<template>
  <div class="home">
    <el-card class="home__welcome">
      <h2>欢迎回来，{{ userStore.userInfo?.nickname || 'admin' }}</h2>
      <p>这是 FullstackSeed 中后台首页，可在此扩展业务页面。</p>
    </el-card>

    <el-row :gutter="16" class="home__stats">
      <el-col v-for="s in stats" :key="s.label" :span="6">
        <el-card>
          <div class="home__stat-value" :style="{ color: s.color }">{{ s.value }}</div>
          <div class="home__stat-label">{{ s.label }}</div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.home__welcome {
  margin-bottom: 16px;
}
.home__stat-value {
  font-size: 28px;
  font-weight: 600;
}
.home__stat-label {
  margin-top: 8px;
  color: #909399;
}
</style>
