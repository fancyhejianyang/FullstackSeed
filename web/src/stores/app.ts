import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * 示例 Store：演示 Pinia 用法
 */
export const useAppStore = defineStore('app', () => {
  const appName = ref('FullstackSeed');

  function setAppName(name: string) {
    appName.value = name;
  }

  return { appName, setAppName };
});
