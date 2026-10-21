<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import Dialog from '@/components/Dialog.vue';
import Button from '@/components/Button.vue';
import {
  getHotTopic,
  safeSourceUrl,
  levelLabels,
  decisionLabels,
  type HotTopic,
} from '@/api/hotTopic';
import { formatDateTime } from '@/utils/format';
const props = defineProps<{ row: Pick<HotTopic, 'id'> | null }>();
const visible = defineModel<boolean>('visible', { required: true });
const detail = ref<HotTopic | null>(null);
const loading = ref(false),
  failed = ref(false);
let epoch = 0;
async function load() {
  const sequence = ++epoch;
  detail.value = null;
  failed.value = false;
  if (!props.row) return;
  loading.value = true;
  try {
    const result = await getHotTopic(props.row.id);
    if (sequence === epoch && visible.value) detail.value = result;
  } catch {
    if (sequence === epoch) failed.value = true;
  } finally {
    if (sequence === epoch) loading.value = false;
  }
}
watch(
  () => [visible.value, props.row?.id] as const,
  ([open]) => {
    if (open) void load();
    else {
      ++epoch;
      detail.value = null;
    }
  },
);
onBeforeUnmount(() => ++epoch);
</script>
<template>
  <Dialog v-model="visible" title="热点详情" width="880px" :show-footer="false">
    <div v-loading="loading" class="topic-detail">
      <el-empty v-if="failed" description="详情读取失败"
        ><Button @click="load">重新读取</Button></el-empty
      >
      <template v-else-if="detail">
        <h2>{{ detail.title }}</h2>
        <p class="meta">
          {{ levelLabels[detail.recommendationLevel] }} ·
          {{ decisionLabels[detail.decision] }} ·
          {{
            detail.materialCompleteness === 'summary'
              ? '已取得摘要'
              : '仅标题线索'
          }}
        </p>
        <h3>事件摘要</h3>
        <p class="text">{{ detail.summary || '暂无摘要，请阅读原始来源。' }}</p>
        <h3>推荐理由</h3>
        <p class="text">{{ detail.reason || '尚未生成 AI 推荐。' }}</p>
        <template v-if="detail.suggestedAngles?.length"
          ><h3>可考虑的创作角度</h3>
          <ul>
            <li v-for="angle in detail.suggestedAngles" :key="angle">
              {{ angle }}
            </li>
          </ul></template
        >
        <h3>参考来源</h3>
        <p class="meta">
          以下为获取到的来源线索，不代表已完成事实核验。搜索线索未匹配稳定账号标识时，不能视为该账号已发布。
        </p>
        <article
          v-for="(source, index) in detail.candidates || []"
          :key="`${source.url}-${index}`"
          class="source-card"
        >
          <strong>{{ source.sourceName }} · {{ source.title }}</strong>
          <p class="meta">
            {{ source.platform || '公开来源'
            }}<template v-if="source.rank != null">
              · 排名 {{ source.rank }}</template
            ><template v-if="source.heat != null">
              · 平台热度 {{ source.heat }}</template
            >
          </p>
          <p v-if="source.accountName">
            指定账号：{{ source.accountName }} ·
            {{
              source.accountMatched
                ? '稳定标识已匹配'
                : '搜索线索 / 未确认账号归属'
            }}
          </p>
          <p class="text">
            {{ source.summary || '仅取得标题，未取得正文摘要。' }}
          </p>
          <p class="meta">
            发布时间：{{
              source.publishedAt
                ? formatDateTime(source.publishedAt)
                : '来源未提供'
            }}
            · 获取时间：{{ formatDateTime(source.fetchedAt) }}
          </p>
          <a
            v-if="safeSourceUrl(source.url)"
            :href="safeSourceUrl(source.url)"
            target="_blank"
            rel="noopener noreferrer"
            >查看原始来源</a
          ><span v-else>来源链接缺失或不符合 HTTPS 要求</span>
        </article>
      </template>
    </div>
    <template #footer><Button @click="visible = false">关闭</Button></template>
  </Dialog>
</template>
<style scoped>
.topic-detail {
  min-height: 120px;
  overflow-wrap: anywhere;
  color: var(--el-text-color-regular);
  line-height: 1.7;
}
h2 {
  color: var(--el-text-color-primary);
  font-size: 20px;
  margin: 0 0 12px;
}
h3 {
  font-size: 15px;
  margin: 24px 0 8px;
}
.meta {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.text {
  white-space: pre-wrap;
}
.source-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 16px;
  margin: 12px 0;
}
a {
  color: var(--el-color-primary);
}
</style>
