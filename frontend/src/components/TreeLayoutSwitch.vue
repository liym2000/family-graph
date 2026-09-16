<template>
  <el-dropdown trigger="click" :teleported="false" @command="choose">
    <el-button class="tree-view-button">{{ t('视图：{name}', { name: t(labels[model]) }) }}<span class="menu-arrow" aria-hidden="true">▾</span></el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item v-for="mode in modes" :key="mode" :command="mode" :class="{ 'is-current': model === mode }">
          {{ t(labels[mode]) }}<span v-if="model === mode" aria-hidden="true"> ✓</span>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>
<script setup lang="ts">
import { t } from '../i18n';
import type { TreeMode } from '../features/tree/types';
const model = defineModel<TreeMode>({ required: true });
const modes: TreeMode[] = ['tree', 'dots', 'radial'];
const labels = { tree: '树形', dots: '树形点图', radial: '径向全景' } as const;
function choose(mode: TreeMode) { model.value = mode; }
</script>
<style scoped>
.tree-view-button { width: 160px; flex: 0 0 160px; }
.menu-arrow { margin-left: 8px; font-size: 12px; }
.is-current { color: var(--el-color-primary); font-weight: 600; }
</style>
