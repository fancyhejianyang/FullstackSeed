<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user';
import Button from '@/components/Button.vue';
import Select from '@/components/Select.vue';
import { getDashboardHome, type DashboardHome } from '@/api/dashboard';
import DashboardGrid from './home/components/DashboardGrid.vue';
const user = useUserStore(),
  router = useRouter();
const result = ref<DashboardHome>();
const loading = ref(false),
  error = ref(false),
  days = ref<string | null>('configured');
let generation = 0;
const greeting = computed(() => {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(new Date()),
  );
  return hour < 12 ? '上午好' : hour < 18 ? '下午好' : '晚上好';
});
async function load(instanceId?: string) {
  const request = ++generation;
  loading.value = true;
  error.value = false;
  try {
    const value = await getDashboardHome({
      days: days.value === 'configured' ? undefined : Number(days.value),
      instanceId,
    });
    if (request !== generation) return;
    if (instanceId && result.value) {
      if (value.layoutVersion !== result.value.layoutVersion) {
        await load();
        return;
      }
      const replacements = new Map(value.widgets.map((w) => [w.instanceId, w]));
      result.value = {
        ...result.value,
        generatedAt: value.generatedAt,
        widgets: result.value.widgets.flatMap((w) =>
          w.instanceId === instanceId
            ? replacements.has(w.instanceId)
              ? [replacements.get(w.instanceId)!]
              : []
            : [w],
        ),
      };
    } else result.value = value;
  } catch {
    if (request === generation) error.value = true;
  } finally {
    if (request === generation) loading.value = false;
  }
}
onMounted(() => load());
</script>
<template>
  <div class="home">
    <header class="home-header">
      <div>
        <h2>
          {{ greeting }}，{{
            user.userInfo?.nickname || user.userInfo?.username || '用户'
          }}
        </h2>
        <p>查看业务进展，开始今天的工作。</p>
      </div>
      <div class="home-controls">
        <Select
          v-model="days"
          :options="[
            { value: 'configured', text: '按板块配置' },
            { value: '7', text: '近 7 天' },
            { value: '30', text: '近 30 天' },
          ]"
          :clearable="false"
          :filterable="false"
          @update:model-value="load()"
        /><Button :loading="loading" icon="Refresh" @click="load()">刷新</Button
        ><Button
          perm="DashboardConfig.read"
          @click="router.push('/system-config/home')"
          >首页配置</Button
        >
      </div>
    </header>
    <p v-if="result" class="data-time">
      数据更新于
      {{
        new Date(result.generatedAt).toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          hour12: false,
        })
      }}
      <span v-if="error">· 刷新失败，当前显示上次数据</span>
    </p>
    <el-skeleton v-if="loading && !result" :rows="10" animated />
    <div v-else-if="error && !result" class="home-empty">
      首页数据加载失败 <Button @click="load()">重试</Button>
    </div>
    <DashboardGrid
      v-if="result"
      :widgets="result.widgets"
      :refreshing="loading"
      @retry="load"
    />
    <el-empty
      v-if="result && !result.widgets.length"
      description="暂无可展示的首页板块"
    />
  </div>
</template>
<style scoped>
.home {
  max-width: 1800px;
  margin: 0 auto;
  min-width: 0;
}
.home-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.home-header h2 {
  font-size: 24px;
  color: #263445;
  font-weight: 650;
  margin: 4px 0 10px;
}
.home-header p {
  font-size: 14px;
  color: #606b7b;
  margin: 0;
}
.home-controls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.home-controls :deep(.select) {
  width: 130px;
  flex: 0 0 130px;
}
.data-time {
  color: #687587;
  font-size: 12px;
  margin: 0 0 22px;
}
.data-time span {
  color: #b66b12;
}
.home-empty {
  text-align: center;
  padding: 60px;
}
</style>
