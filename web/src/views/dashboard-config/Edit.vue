<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Form, { type FormField } from '@/components/Form.vue';
import Dialog from '@/components/Dialog.vue';
import type { WidgetConfig, WidgetDefinition } from '@/api/dashboard';
const props = defineProps<{
  row: WidgetConfig | null;
  definition?: WidgetDefinition;
}>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ success: [WidgetConfig] }>();
const form = ref<Record<string, any>>({});
const formRef = ref<InstanceType<typeof Form>>();
watch(visible, (open) => {
  if (open && props.row)
    form.value = {
      title: props.row.title,
      span: props.row.layout.span,
      ...JSON.parse(JSON.stringify(props.row.params)),
    };
});
const fields = computed<FormField[]>(() => [
  {
    prop: 'title',
    label: '板块标题',
    type: 'input',
    componentProps: { maxlength: 40 },
  },
  {
    prop: 'span',
    label: '显示宽度',
    type: 'select',
    options: props.definition?.allowedSpans.map((n) => ({
      label: n === 12 ? '整行' : n + ' / 12',
      value: n,
    })),
    componentProps: { clearable: false, filterable: false },
  },
  ...(props.definition?.parameters ?? []).map(
    (p): FormField => ({
      prop: p.key,
      label: p.label,
      ...(p.type === 'integer'
        ? {
            component: 'InputNumber',
            componentProps: {
              min: p.min,
              max: p.max,
              mode: 'integer',
              required: true,
            },
          }
        : p.type === 'boolean'
          ? { component: 'Switch' }
          : {
              ...(p.type === 'multiSelect'
                ? { type: 'selectMultiple' as const }
                : { type: 'select' as const }),
              options: p.options,
              componentProps: { clearable: false, filterable: false },
            }),
    }),
  ),
]);
async function submit() {
  await formRef.value?.validate();
  if (!props.row || !props.definition) return;
  const params = Object.fromEntries(
    props.definition.parameters.map((p) => [p.key, form.value[p.key]]),
  );
  emit('success', {
    ...props.row,
    title: form.value.title,
    layout: { ...props.row.layout, span: form.value.span },
    params,
  });
  visible.value = false;
}
</script>
<template>
  <Dialog v-model="visible" title="板块设置" width="600px" @confirm="submit"
    ><Form
      ref="formRef"
      v-model="form"
      :fields="fields"
      :rules="{
        title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
      }"
      label-width="140px"
  /></Dialog>
</template>
