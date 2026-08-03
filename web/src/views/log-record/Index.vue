<script setup lang="ts">
import { Setting } from '@element-plus/icons-vue';
import PageContainer from '@/components/PageContainer.vue';

const handleConfig = () => undefined;
</script>

<template>
  <PageContainer title="日志记录">
    <div class="log-record__toolbar">
      <el-button type="primary" :icon="Setting" @click="handleConfig">
        配置
      </el-button>
    </div>
  </PageContainer>
</template>

<style scoped>
.log-record__toolbar {
  display: flex;
  justify-content: flex-start;
}
</style>
