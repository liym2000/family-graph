<template>
  <el-config-provider :locale="elementLocale">
    <RouterView />
  </el-config-provider>
</template>
<script setup lang="ts">
import { elementLocale } from './i18n';
</script>
