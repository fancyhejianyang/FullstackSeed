import Input from './Input.vue';
import type { ComponentName } from './Component';

export const FORM_COMPONENT_MAP = {
  Input,
} as const satisfies Record<ComponentName, unknown>;

export function getFormComponent(name: ComponentName) {
  return FORM_COMPONENT_MAP[name];
}
