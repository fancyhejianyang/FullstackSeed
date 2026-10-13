<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormRules } from 'element-plus';
import Form, { type FormField } from '@/components/Form.vue';
import Button from '@/components/Button.vue';
import { useUserStore } from '@/stores/user';
import { getPermissionActionColor } from '@/utils/permission';

const router = useRouter();
const userStore = useUserStore();

const formRef = ref<InstanceType<typeof Form>>();
const loading = ref(false);

const form = reactive({
  username: 'root',
  password: 'root123',
});

// 凭据保持原样传递，不能使用 Input 默认的失焦去空格行为。
const fields: FormField[] = [
  {
    prop: 'username',
    label: '',
    placeholder: '用户名',
    componentProps: {
      prefixIcon: 'User',
      trim: false,
      autocomplete: 'username',
      'aria-label': '用户名',
    },
  },
  {
    prop: 'password',
    label: '',
    placeholder: '密码',
    inputMode: 'password',
    componentProps: {
      trim: false,
      autocomplete: 'current-password',
      'aria-label': '密码',
    },
  },
];

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};

async function handleLogin() {
  if (!formRef.value || loading.value) return;
  // 回车同样走此入口，在异步校验前锁定，避免与按钮点击重复提交。
  loading.value = true;
  try {
    if (!(await formRef.value.validate())) return;
    await userStore.login({ ...form });
    ElMessage.success('登录成功');
    await router.push('/');
  } catch {
    // 字段错误由 Form 展示，接口错误由请求拦截器统一提示。
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login flex items-center justify-center">
    <el-card class="login__card">
      <template #header>
        <div class="login__title text-center font-bold">FullstackSeed 管理后台</div>
      </template>
      <Form
        ref="formRef"
        v-model="form"
        :fields="fields"
        :rules="rules"
        label-width="0"
        size="large"
        @enter="handleLogin"
        @submit.prevent
      >
        <template #actions>
          <Button
            :type="getPermissionActionColor('login')"
            class="login__btn"
            :loading="loading"
            @click="handleLogin"
          >
            登 录
          </Button>
        </template>
      </Form>
      <div class="mt-lg text-center text-secondary text-xs">默认账号：root / root123</div>
    </el-card>
  </div>
</template>

<style scoped>
.login {
  height: 100vh;
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
}
.login__card {
  width: 380px;
}
.login__title {
  font-size: var(--el-font-size-large);
}
.login__btn {
  width: 100%;
}
</style>
