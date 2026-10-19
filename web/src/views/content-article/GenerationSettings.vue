<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Select, { type SelectOption } from '@/components/Select.vue';
import Button from '@/components/Button.vue';
import Form, { type FormField } from '@/components/Form.vue';
import { getContentGenerationConfigs } from '@/api/contentArticle';
import { getContentTemplates } from '@/api/contentTemplate';
import { useUserStore } from '@/stores/user';

const props = defineProps<{ disabled?: boolean }>();
const aiConfigId = defineModel<number | null>('aiConfigId', { required: true });
const templateId = defineModel<number | null>('templateId', { required: true });
const user = useUserStore();
const selection = computed({
  get: () => ({ aiConfigId: aiConfigId.value, templateId: templateId.value }),
  set: (value) => {
    aiConfigId.value = value.aiConfigId;
    templateId.value = value.templateId;
  },
});
const fields = computed<FormField[]>(() => [
  { prop: 'aiConfigId', label: 'AI 配置', slot: true },
  ...(user.hasPermission('ContentTemplate.read')
    ? [{ prop: 'templateId', label: '写作模板', slot: true }]
    : []),
]);
const configOptions = ref<SelectOption[]>([]);
const templateOptions = ref<SelectOption[]>([]);
const configError = ref(false);
const templateError = ref(false);
const configTruncated = ref(false);
const templateTruncated = ref(false);
let configSequence = 0;
let templateSequence = 0;
const configValue = computed({
  get: () => (aiConfigId.value == null ? null : String(aiConfigId.value)),
  set: (value: string | null) => {
    aiConfigId.value = value ? Number(value) : null;
  },
});
const templateValue = computed({
  get: () => (templateId.value == null ? null : String(templateId.value)),
  set: (value: string | null) => {
    templateId.value = value ? Number(value) : null;
  },
});
function preserve(
  options: SelectOption[],
  previous: SelectOption[],
  id: number | null,
  label: string,
) {
  if (id != null && !options.some((item) => item.value === String(id)))
    options.unshift(
      previous.find((item) => item.value === String(id)) ?? {
        value: String(id),
        text: `已保存的${label} #${id}（请搜索确认）`,
      },
    );
  return options;
}
async function fetchConfigs(keyword = '') {
  const sequence = ++configSequence;
  try {
    const result = await getContentGenerationConfigs({
      pageSize: 100,
      keyword,
    });
    if (sequence !== configSequence) return;
    configOptions.value = preserve(
      result.list.map((row) => ({
        value: String(row.id),
        text: `${row.name} · ${row.model || '未设置模型'} · ${row.responseFormat === 'text' ? '纯文本' : 'Markdown'}`,
      })),
      configOptions.value,
      aiConfigId.value,
      'AI 配置',
    );
    configTruncated.value = result.total > result.list.length;
    configError.value = false;
  } catch {
    if (sequence === configSequence) configError.value = true;
  }
}
async function fetchTemplates(keyword = '') {
  if (!user.hasPermission('ContentTemplate.read')) return;
  const sequence = ++templateSequence;
  try {
    const result = await getContentTemplates({ pageSize: 100, keyword });
    if (sequence !== templateSequence) return;
    templateOptions.value = preserve(
      result.list.map((row) => ({ value: String(row.id), text: row.name })),
      templateOptions.value,
      templateId.value,
      '写作模板',
    );
    templateTruncated.value = result.total > result.list.length;
    templateError.value = false;
  } catch {
    if (sequence === templateSequence) templateError.value = true;
  }
}
watch(aiConfigId, () => {
  configOptions.value = preserve(
    configOptions.value,
    [],
    aiConfigId.value,
    'AI 配置',
  );
});
watch(templateId, () => {
  templateOptions.value = preserve(
    templateOptions.value,
    [],
    templateId.value,
    '写作模板',
  );
});
void fetchConfigs();
void fetchTemplates();
onBeforeUnmount(() => {
  ++configSequence;
  ++templateSequence;
});
</script>

<template>
  <section class="generation-settings" aria-label="生成设置">
    <h3>生成设置</h3>
    <Form
      v-model="selection"
      :fields="fields"
      label-position="top"
      :disabled="props.disabled"
    >
      <template #field-aiConfigId>
        <Select
          v-model="configValue"
          :options="configOptions"
          :disabled="props.disabled"
          placeholder="未设置 · 首次生成时选择"
          aria-label="AI 配置"
          @search="fetchConfigs"
        />
        <p v-if="configError">
          配置读取失败，已保存的选择不会被清空，可重新搜索。
        </p>
        <p v-else-if="configTruncated">
          匹配项较多，请输入配置名称或模型筛选。
        </p>
      </template>
      <template #field-templateId>
        <Select
          v-model="templateValue"
          :options="templateOptions"
          :disabled="props.disabled"
          placeholder="通用写作 · 可选模板"
          aria-label="写作模板"
          @search="fetchTemplates"
        />
        <p v-if="templateError">
          模板读取失败，已保存的选择不会被清空，可重新搜索。
        </p>
        <p v-else-if="templateTruncated">匹配项较多，请输入模板名称筛选。</p>
      </template>
    </Form>
    <p v-if="templateId && !user.hasPermission('ContentTemplate.read')">
      已保存写作模板，无模板读取权限时不能使用；可清除后使用通用写作。
    </p>
    <Button
      v-if="templateId && !user.hasPermission('ContentTemplate.read')"
      perm="ContentArticle.update"
      link
      :disabled="props.disabled"
      @click="templateId = null"
      >清除模板选择</Button
    >
    <p>保存后，下次点击“AI 生成”直接使用这些设置。保存本身不会调用 AI。</p>
  </section>
</template>

<style scoped>
.generation-settings {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #dcdfe6;
}
.generation-settings h3 {
  margin: 0 0 14px;
  font-size: 15px;
}
.generation-settings p {
  margin: 8px 0;
  color: #606266;
  font-size: 13px;
  line-height: 1.7;
}
</style>
