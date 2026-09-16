<template>
  <div v-if="error" class="load-state" role="alert">
    <p>{{ error }}</p>
    <el-button @click="$emit('retry')">{{ t('重试') }}</el-button>
  </div>
  <div v-else-if="loading" class="load-state" role="status">
    <el-skeleton :rows="3" animated />
  </div>
  <slot v-else />
</template>
<script setup lang="ts">
import { t } from '../i18n';

defineProps<{ loading: boolean; error: string }>();
defineEmits<{ retry: [] }>();
</script>
