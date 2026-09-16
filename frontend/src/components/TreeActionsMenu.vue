<template>
  <el-dropdown trigger="click" placement="bottom-end" :teleported="false" @command="emit('command', $event)">
    <el-button>{{ t('更多') }}<span class="menu-arrow" aria-hidden="true">▾</span></el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="expand" :disabled="!hasRoot || (busy && !expandingAll)">{{ t(expandingAll ? '停止展开' : '展开后裔') }}</el-dropdown-item>
        <el-dropdown-item command="collapse" :disabled="busy || !hasRoot">{{ t('收起后裔') }}</el-dropdown-item>
        <el-dropdown-item command="fit" :disabled="!hasRoot">{{ t('适应窗口') }}</el-dropdown-item>
        <el-dropdown-item command="export" divided :disabled="busy || !hasRoot">{{ t('导出家族树') }}</el-dropdown-item>
        <el-dropdown-item command="fullscreen">{{ t(fullscreen ? '退出全屏' : '全屏') }}</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>
<script setup lang="ts">
import { t } from '../i18n';
defineProps<{ hasRoot: boolean; busy: boolean; expandingAll: boolean; fullscreen: boolean }>();
const emit = defineEmits<{ command: [command: string] }>();
</script>
<style scoped>
.menu-arrow { margin-left: 8px; font-size: 12px; }
</style>
