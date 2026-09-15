<script setup lang="ts">
import { ref } from 'vue';
import PageContainer from '@/components/PageContainer.vue';
import Table, { type TableColumn } from '@/components/Table.vue';
import Dialog from '@/components/Dialog.vue';
import Button from '@/components/Button.vue';
import type { FormField } from '@/components/Form.vue';
import { formatDateTime } from '@/utils/format';
import {
  batchDeleteKnowledgeAiChatSessions,
  deleteKnowledgeAiChatSession,
  getKnowledgeAiChatSession,
  getKnowledgeAiChatSessions,
  type KnowledgeAiChatSession,
  type KnowledgeAiChatSessionDetail,
  type KnowledgeAiProcessingTrace,
  type QueryKnowledgeAiChatSessionParams,
} from '@/api/knowledgeAiChat';
import Edit, { type KnowledgeStandardQaPrefill } from '@/views/knowledge-standard-qa/Edit.vue';

const tableRef = ref<{
  refresh: () => Promise<void>;
  runBatchDelete: () => Promise<void>;
}>();
const detailVisible = ref(false);
const detailLoading = ref(false);
const currentDetail = ref<KnowledgeAiChatSessionDetail | null>(null);
const collectVisible = ref(false);
const collectingPrefill = ref<KnowledgeStandardQaPrefill | null>(null);

const columns: TableColumn[] = [
  { prop: 'title', label: '会话标题', minWidth: 220 },
  { prop: 'providerName', label: '大模型账号', minWidth: 160 },
  { prop: 'model', label: '模型', minWidth: 140 },
  { prop: 'hitKnowledgeBaseNames', label: '命中知识库', minWidth: 180, slot: true },
  { prop: 'messageCount', label: '轮次', width: 90 },
  { prop: 'isSuccess', label: '状态', width: 90, slot: true },
  { prop: 'errorMessage', label: '当前阶段 / 错误', minWidth: 220 },
  { prop: 'lastQuestion', label: '最近问题', minWidth: 220 },
  { prop: 'elapsedMilliseconds', label: '耗时', width: 110, slot: true },
  { prop: 'createdAt', label: '创建时间', width: 180, slot: true },
];

const searchFields: FormField[] = [
  {
    prop: 'isSuccess',
    label: '问答状态',
    type: 'select',
    options: [
      { label: '全部', value: '' },
      { label: '成功', value: true },
      { label: '失败', value: false },
    ],
  },
  {
    prop: 'keyword',
    label: '关键词',
    type: 'input',
    placeholder: '标题/账号/模型/知识库/问题/回答',
  },
];

function fetchSessions(params: Record<string, unknown>) {
  return getKnowledgeAiChatSessions(params as QueryKnowledgeAiChatSessionParams);
}

function deleteRequest(row: KnowledgeAiChatSession) {
  return deleteKnowledgeAiChatSession(row.id);
}

function getHitKnowledgeBaseNames(row: KnowledgeAiChatSession) {
  return (row.hitKnowledgeBaseNames || '')
    .split('、')
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatScore(score: number) {
  return Number(score || 0).toFixed(3);
}

function formatChunkSequence(chunkIndex: number | null) {
  return chunkIndex == null ? '分片序号未知' : `分片 #${chunkIndex + 1}`;
}

function formatTokenUsage(message: KnowledgeAiChatSessionDetail['messages'][number]) {
  if (message.totalTokens == null) return 'Token：上游未返回';
  const promptTokens = message.promptTokens ?? '-';
  const completionTokens = message.completionTokens ?? '-';
  return `Token：${message.totalTokens}（输入 ${promptTokens} / 输出 ${completionTokens}）`;
}

function getRetrievalModeText(
  mode: NonNullable<KnowledgeAiProcessingTrace['retrievalConfig']>['retrievalMode'],
) {
  const map: Record<string, string> = {
    fullText: '全文检索',
    vector: '向量检索',
    hybrid: '混合检索',
  };
  return map[mode] || mode;
}

function getQaStageStatus(stage: KnowledgeAiProcessingTrace['originalQa']) {
  if (!stage.executed) return { text: '未执行', type: 'info' as const };
  return stage.matched
    ? { text: '已命中', type: 'success' as const }
    : { text: '未命中', type: 'warning' as const };
}

function getRoutingRuleTypeText(type: string) {
  const map: Record<string, string> = {
    generic: '公共降权',
    alias: '别名升权',
    exclusive: '专属路由',
  };
  return map[type] || type;
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function openCollect(message: KnowledgeAiChatSessionDetail['messages'][number]) {
  collectingPrefill.value = {
    question: message.question,
    answer: message.answer || '',
    sourceChatMessageId: message.id,
    sourceChunkIds: message.hitChunkIds ?? [],
  };
  collectVisible.value = true;
}

async function batchDeleteRequest(payload: { ids: Array<string | number> }) {
  await batchDeleteKnowledgeAiChatSessions(payload.ids);
}

async function handleView(row: KnowledgeAiChatSession) {
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    currentDetail.value = await getKnowledgeAiChatSession(row.id);
  } finally {
    detailLoading.value = false;
  }
}
</script>

<template>
  <PageContainer title="问题记录">
    <Table
      ref="tableRef"
      :columns="columns"
      :search-fields="searchFields"
      :request="fetchSessions"
      :checkAble="true"
      :show-edit="false"
      :delete-request="deleteRequest"
      :batch-delete-request="batchDeleteRequest"
      @view="handleView"
    >
      <template #toolbar>
        <Button
          icon="Delete"
          type="danger"
          :confirm="false"
          @click="tableRef?.runBatchDelete()"
        >
          批量删除
        </Button>
      </template>

      <template #column-isSuccess="{ row }">
        <el-tag :type="row.errorMessage?.startsWith('处理中') ? 'info' : row.isSuccess ? 'success' : 'danger'">
          {{ row.errorMessage?.startsWith('处理中') ? '处理中' : row.isSuccess ? '成功' : '失败' }}
        </el-tag>
      </template>

      <template #column-hitKnowledgeBaseNames="{ row }">
        <div v-if="getHitKnowledgeBaseNames(row).length" class="ai-record__hit-bases">
          <el-tag
            v-for="name in getHitKnowledgeBaseNames(row)"
            :key="name"
            type="success"
            effect="light"
          >
            {{ name }}
          </el-tag>
        </div>
        <span v-else>-</span>
      </template>

      <template #column-elapsedMilliseconds="{ row }">
        {{ row.elapsedMilliseconds }} ms
      </template>

      <template #column-createdAt="{ row }">
        {{ formatDateTime(row.createdAt) }}
      </template>
    </Table>

    <Dialog v-model="detailVisible" title="问答详情" width="900px" :show-footer="false">
      <div v-loading="detailLoading">
        <Button v-if="currentDetail" icon="Refresh" :disabled="detailLoading" @click="handleView(currentDetail)">
          刷新执行记录
        </Button>
        <el-empty v-if="!currentDetail?.messages.length" description="暂无问答内容" />
        <div
          v-for="message in currentDetail?.messages || []"
          :key="message.id"
          class="ai-record__message"
          :class="{ 'is-error': !message.isSuccess && message.processingTrace?.execution?.status !== 'running' }"
        >
          <div class="ai-record__question">{{ message.question }}</div>
          <div class="ai-record__answer">
            {{ message.answer || message.errorMessage || (message.processingTrace?.execution?.status === 'running' ? '正在处理，可刷新查看最新阶段。前端请求超时不代表后端已停止。' : '-') }}
          </div>
          <div v-if="message.processingTrace" class="ai-record__trace">
            <div class="ai-record__trace-title">本轮处理轨迹</div>
            <div v-if="message.processingTrace.execution">
              <p>
                执行状态：{{ { running: '处理中', success: '已完成', failed: '失败' }[message.processingTrace.execution.status] }}
                · 开始于 {{ formatDateTime(message.processingTrace.execution.startedAt) }}
              </p>
              <ol>
                <li v-for="(stage, index) in message.processingTrace.execution.stages" :key="index">
                  {{ stage.name }}：{{ { running: '执行中', success: '完成', failed: '失败' }[stage.status] }}
                  · {{ formatDateTime(stage.startedAt) }}
                  · {{ stage.status === 'running' ? '尚未结束' : `${stage.elapsedMilliseconds} ms` }}
                  <p v-if="stage.errorMessage">{{ stage.errorMessage }}</p>
                </li>
              </ol>
            </div>
            <el-collapse accordion>
              <el-collapse-item name="config">
                <template #title>
                  <span>1. AI 工作流与可用范围</span>
                  <el-tag
                    class="ai-record__trace-title-tag"
                    :type="message.processingTrace.retrievalConfig ? 'primary' : 'info'"
                    effect="light"
                    size="small"
                  >
                    {{ message.processingTrace.retrievalConfig ? '已确定' : '未选择' }}
                  </el-tag>
                </template>
                <template v-if="message.processingTrace.retrievalConfig">
                  <el-descriptions :column="2" border size="small">
                    <el-descriptions-item label="检索配置">
                      {{ message.processingTrace.retrievalConfig.name }} #{{ message.processingTrace.retrievalConfig.id }}
                    </el-descriptions-item>
                    <el-descriptions-item label="关联工作流">
                      {{ message.processingTrace.retrievalConfig.workflowName || '内置流程' }}
                    </el-descriptions-item>
                    <el-descriptions-item label="检索方式">
                      {{ getRetrievalModeText(message.processingTrace.retrievalConfig.retrievalMode) }}
                    </el-descriptions-item>
                    <el-descriptions-item label="召回数量 / 阈值">
                      Top {{ message.processingTrace.retrievalConfig.topK }} / {{ message.processingTrace.retrievalConfig.minScore }}
                    </el-descriptions-item>
                    <el-descriptions-item label="文本 / 向量权重">
                      {{ message.processingTrace.retrievalConfig.textWeight }} / {{ message.processingTrace.retrievalConfig.vectorWeight }}
                    </el-descriptions-item>
                    <el-descriptions-item label="RRF K">
                      {{ message.processingTrace.retrievalConfig.rrfK }}
                    </el-descriptions-item>
                    <el-descriptions-item label="重排配置">
                      {{ message.processingTrace.retrievalConfig.enableRerank
                        ? (message.processingTrace.retrievalConfig.rerankAiFeatureConfigName || '已启用，未指定名称')
                        : '未启用' }}
                    </el-descriptions-item>
                    <el-descriptions-item label="标准问答">
                      {{ message.processingTrace.retrievalConfig.enableStandardQa ? '启用' : '关闭' }}
                    </el-descriptions-item>
                    <el-descriptions-item label="口语校准">
                      {{ message.processingTrace.retrievalConfig.enableColloquial ? '启用' : '关闭' }}
                    </el-descriptions-item>
                    <el-descriptions-item label="知识库检索">
                      {{ message.processingTrace.retrievalConfig.enableKnowledgeRetrieval ? '启用' : '关闭' }}
                    </el-descriptions-item>
                    <el-descriptions-item label="业务数据指令">
                      {{ message.processingTrace.retrievalConfig.enableBusinessCommands ? '启用' : '关闭' }}
                    </el-descriptions-item>
                  </el-descriptions>
                </template>
                <span v-else class="ai-record__trace-muted">{{ message.processingTrace.execution ? '尚未取得工作流配置快照，请查看上方执行阶段及错误。' : '本轮未关联 AI 工作流。' }}</span>
              </el-collapse-item>

              <el-collapse-item name="original-qa">
                <template #title>
                  <span>2. 原问题标准问答精确匹配</span>
                  <el-tag class="ai-record__trace-title-tag" :type="getQaStageStatus(message.processingTrace.originalQa).type" effect="light" size="small">
                    {{ getQaStageStatus(message.processingTrace.originalQa).text }}
                  </el-tag>
                </template>
                <div class="ai-record__trace-text">查询问题：{{ message.processingTrace.originalQa.question }}</div>
                <div v-if="message.processingTrace.originalQa.matchedEntries.length" class="ai-record__trace-tags">
                  <el-tag
                    v-for="entry in message.processingTrace.originalQa.matchedEntries"
                    :key="entry.id"
                    :type="entry.id === message.processingTrace.originalQa.selectedEntryId ? 'success' : 'info'"
                    effect="light"
                    size="small"
                  >
                    #{{ entry.id }} {{ entry.question }}
                  </el-tag>
                </div>
                <span v-if="message.processingTrace.originalQa.skippedReason" class="ai-record__trace-muted">{{ message.processingTrace.originalQa.skippedReason }}</span>
              </el-collapse-item>

              <el-collapse-item name="colloquial">
                <template #title>
                  <span>3. 口语化词库校准</span>
                  <el-tag class="ai-record__trace-title-tag" :type="message.processingTrace.colloquial.matched ? 'primary' : 'info'" effect="light" size="small">
                    {{ message.processingTrace.colloquial.evaluated ? (message.processingTrace.colloquial.matched ? '已处理' : '未命中词条') : '未执行' }}
                  </el-tag>
                </template>
                <div class="ai-record__trace-text">原问题：{{ message.processingTrace.colloquial.inputQuestion }}</div>
                <div class="ai-record__trace-text">校准结果：{{ message.processingTrace.colloquial.rewrittenQuestion }}</div>
                <div v-if="message.processingTrace.colloquial.matches.length" class="ai-record__trace-tags">
                  <el-tag v-for="term in message.processingTrace.colloquial.matches" :key="term.id" type="primary" effect="light" size="small">
                    {{ term.term }} → {{ term.replacement }}（{{ term.semanticType }}）
                  </el-tag>
                </div>
                <span v-if="message.processingTrace.colloquial.semanticConstraintApplied" class="ai-record__trace-muted">已将人工维护的语义约束一并传给后续检索与回答阶段。</span>
                <span v-if="message.processingTrace.colloquial.skippedReason" class="ai-record__trace-muted">{{ message.processingTrace.colloquial.skippedReason }}</span>
              </el-collapse-item>

              <el-collapse-item name="calibrated-qa">
                <template #title>
                  <span>4. 校准后标准问答精确匹配</span>
                  <el-tag class="ai-record__trace-title-tag" :type="getQaStageStatus(message.processingTrace.calibratedQa).type" effect="light" size="small">
                    {{ getQaStageStatus(message.processingTrace.calibratedQa).text }}
                  </el-tag>
                </template>
                <div class="ai-record__trace-text">查询问题：{{ message.processingTrace.calibratedQa.question }}</div>
                <div v-if="message.processingTrace.calibratedQa.matchedEntries.length" class="ai-record__trace-tags">
                  <el-tag
                    v-for="entry in message.processingTrace.calibratedQa.matchedEntries"
                    :key="entry.id"
                    :type="entry.id === message.processingTrace.calibratedQa.selectedEntryId ? 'success' : 'info'"
                    effect="light"
                    size="small"
                  >
                    #{{ entry.id }} {{ entry.question }}
                  </el-tag>
                </div>
                <span v-if="message.processingTrace.calibratedQa.skippedReason" class="ai-record__trace-muted">{{ message.processingTrace.calibratedQa.skippedReason }}</span>
              </el-collapse-item>

              <el-collapse-item name="routing">
                <template #title>
                  <span>5. 路由规则与知识库范围</span>
                  <el-tag class="ai-record__trace-title-tag" :type="message.processingTrace.routing.executed ? 'primary' : 'info'" effect="light" size="small">
                    {{ message.processingTrace.routing.executed ? '已执行' : '未执行' }}
                  </el-tag>
                </template>
                <div v-if="message.processingTrace.routing.routedKnowledgeBases.length" class="ai-record__trace-tags">
                  <el-tag v-for="base in message.processingTrace.routing.routedKnowledgeBases" :key="base.id" type="info" effect="light" size="small">
                    {{ base.name }} #{{ base.id }}
                  </el-tag>
                </div>
                <div v-if="message.processingTrace.routing.matchedRules.length" class="ai-record__trace-tags">
                  <el-tag v-for="rule in message.processingTrace.routing.matchedRules" :key="rule.id" type="primary" effect="light" size="small">
                    #{{ rule.id }} {{ rule.term }} / {{ getRoutingRuleTypeText(rule.ruleType) }} / 权重 {{ rule.weight }}
                  </el-tag>
                </div>
                <div v-if="message.processingTrace.routing.executed" class="ai-record__trace-text">
                  {{ message.processingTrace.routing.inventoryQuery ? '本轮为知识库清单查询。' : '本轮为资料检索。' }}
                  {{ message.processingTrace.routing.sessionContextReused ? '复用了会话上下文范围。' : '' }}
                  {{ message.processingTrace.routing.activeKnowledgeBaseId ? `已锁定知识库 #${message.processingTrace.routing.activeKnowledgeBaseId}。` : '' }}
                </div>
                <span v-if="message.processingTrace.routing.skippedReason" class="ai-record__trace-muted">{{ message.processingTrace.routing.skippedReason }}</span>
              </el-collapse-item>

              <el-collapse-item name="retrieval">
                <template #title>
                  <span>6. 混合检索与片段筛选</span>
                  <el-tag class="ai-record__trace-title-tag" :type="message.processingTrace.retrieval.hasReference ? 'success' : 'info'" effect="light" size="small">
                    {{ message.processingTrace.retrieval.hasReference ? `命中 ${message.processingTrace.retrieval.selectedHitCount} 个片段` : '无有效片段' }}
                  </el-tag>
                </template>
                <el-descriptions v-if="message.processingTrace.retrieval.executed" :column="3" border size="small">
                  <el-descriptions-item label="全文候选">{{ message.processingTrace.retrieval.statistics.textCandidateCount }}</el-descriptions-item>
                  <el-descriptions-item label="向量候选">{{ message.processingTrace.retrieval.statistics.vectorCandidateCount }}</el-descriptions-item>
                  <el-descriptions-item label="融合候选">{{ message.processingTrace.retrieval.statistics.fusedCandidateCount }}</el-descriptions-item>
                  <el-descriptions-item label="重排输入">{{ message.processingTrace.retrieval.statistics.rerankInputCount }}</el-descriptions-item>
                  <el-descriptions-item label="过阈值">{{ message.processingTrace.retrieval.statistics.passedMinScoreCount }}</el-descriptions-item>
                  <el-descriptions-item label="最终片段">{{ message.processingTrace.retrieval.statistics.selectedCount }}</el-descriptions-item>
                </el-descriptions>
                <div v-if="message.retrievalHits?.length" class="ai-record__trace-tags">
                  <el-tag v-for="hit in message.retrievalHits" :key="hit.key" type="success" effect="light" size="small">
                    {{ hit.knowledgeBaseName }} / {{ hit.sourceName }} / {{ formatChunkSequence(hit.chunkIndex) }} / 综合 {{ formatScore(hit.score) }}
                  </el-tag>
                </div>
                <span v-if="message.processingTrace.retrieval.skippedReason" class="ai-record__trace-muted">{{ message.processingTrace.retrieval.skippedReason }}</span>
              </el-collapse-item>

              <el-collapse-item name="rerank">
                <template #title>
                  <span>7. 重排</span>
                  <el-tag class="ai-record__trace-title-tag" :type="message.processingTrace.rerank.applied ? 'success' : 'info'" effect="light" size="small">
                    {{ message.processingTrace.rerank.applied ? '已应用' : (message.processingTrace.rerank.configured ? '未应用' : '未启用') }}
                  </el-tag>
                </template>
                <div class="ai-record__trace-text">{{ message.processingTrace.rerank.applied ? '已按校准后的问题重新评分排序候选片段。' : (message.processingTrace.rerank.skippedReason || '-') }}</div>
              </el-collapse-item>

              <el-collapse-item name="business">
                <template #title>
                  <span>8. 获授权业务数据查询</span>
                  <el-tag class="ai-record__trace-title-tag" :type="message.processingTrace.businessData.matched ? 'success' : 'info'" effect="light" size="small">
                    {{ message.processingTrace.businessData.matched ? '已命中' : (message.processingTrace.businessData.authorized ? '未命中' : '未授权') }}
                  </el-tag>
                </template>
                <pre v-if="message.processingTrace.businessData.context" class="ai-record__trace-json">{{ formatJson(message.processingTrace.businessData.context) }}</pre>
                <span v-else class="ai-record__trace-muted">{{ message.processingTrace.businessData.skippedReason || '未返回业务事实。' }}</span>
              </el-collapse-item>
            </el-collapse>
          </div>
          <div v-else class="ai-record__trace ai-record__trace--legacy">
            历史问答记录未保存完整处理轨迹；新产生的记录会展示各阶段的实际命中情况。
          </div>
          <div v-if="message.retrievalQuery" class="ai-record__retrieval">
            <span>检索问题：{{ message.retrievalQuery }}</span>
            <el-tag v-if="message.rerankApplied" type="info" effect="light" size="small">
              已重排
            </el-tag>
          </div>
          <div
            v-if="!message.processingTrace && message.retrievalHits?.length"
            class="ai-record__retrieval-hits"
          >
            <el-tag
              v-for="hit in message.retrievalHits"
              :key="hit.key"
              type="info"
              effect="light"
              size="small"
            >
              {{ hit.knowledgeBaseName }} / {{ hit.sourceName }} /
              {{ formatChunkSequence(hit.chunkIndex) }} /
              ID {{ hit.chunkId ?? '-' }} / {{ formatScore(hit.score) }}
            </el-tag>
          </div>
          <div class="ai-record__meta">
            {{ message.providerName }} / {{ message.model }} /
            {{ message.elapsedMilliseconds }} ms /
            {{ formatTokenUsage(message) }} /
            {{ formatDateTime(message.createdAt) }}
          </div>
          <div v-if="!message.processingTrace && message.colloquialTermMatches?.length" class="ai-record__retrieval-hits">
            <el-tag
              v-for="term in message.colloquialTermMatches"
              :key="term.id"
              type="primary"
              effect="light"
              size="small"
            >
              术语：{{ term.term }} → {{ term.replacement }}
            </el-tag>
          </div>
          <div class="ai-record__actions">
            <el-tag v-if="message.qaEntryId" type="success" size="small">
              已命中标准问答 #{{ message.qaEntryId }}
            </el-tag>
            <Button
              v-else
              perm="KnowledgeStandardQa.create"
              link
              :disabled="!message.answer"
              @click="openCollect(message)"
            >
              收录为标准问答
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
    <Edit
      v-model:visible="collectVisible"
      :prefill="collectingPrefill"
      @success="collectingPrefill = null"
    />
  </PageContainer>
</template>

<style scoped>
.ai-record__message {
  padding: 14px 0;
  border-bottom: 1px solid #ebeef5;
}

.ai-record__hit-bases {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ai-record__question {
  margin-bottom: 8px;
  color: #303133;
  font-weight: 600;
  white-space: pre-wrap;
}

.ai-record__answer {
  color: #606266;
  line-height: 1.6;
  white-space: pre-wrap;
}

.ai-record__retrieval {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  color: #606266;
  font-size: 13px;
}

.ai-record__retrieval-hits {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.ai-record__message.is-error .ai-record__answer {
  color: #f56c6c;
}

.ai-record__meta {
  margin-top: 8px;
  color: #909399;
  font-size: 12px;
}

.ai-record__trace {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid #d9ecff;
  border-radius: 6px;
  background: #f8fbff;
}

.ai-record__trace--legacy {
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}

.ai-record__trace-title {
  margin-bottom: 8px;
  color: #303133;
  font-size: 13px;
  font-weight: 600;
}

.ai-record__trace-title-tag {
  margin-left: 8px;
}

.ai-record__trace-text {
  margin: 4px 0;
  color: #606266;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.ai-record__trace-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.ai-record__trace-muted {
  display: block;
  margin-top: 8px;
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}

.ai-record__trace-json {
  max-height: 280px;
  margin: 0;
  padding: 10px;
  overflow: auto;
  border-radius: 4px;
  background: #eef3f8;
  color: #475569;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-record__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
</style>
