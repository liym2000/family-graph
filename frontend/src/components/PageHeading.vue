<template>
  <header class="page-heading page-toolbar"><slot /><el-tag v-if="readOnly">{{ t('只读演示') }}</el-tag></header>
</template>
<script setup lang="ts">
import { useDemoMode } from '../composables/useDemoMode';
import { t } from '../i18n';
const { readOnly } = useDemoMode();
</script>
