<template>
  <div class="app-shell" :class="{ 'sidebar-collapsed': collapsed }">
    <aside class="app-sidebar">
      <div class="sidebar-brand">
        <button class="sidebar-toggle" type="button" :title="t(collapsed ? '展开侧栏' : '折叠侧栏')" :aria-label="t(collapsed ? '展开侧栏' : '折叠侧栏')" :aria-expanded="!collapsed" @click="collapsed = !collapsed">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
            <rect x="3" y="3.5" width="18" height="17" rx="2" />
            <path d="M9 3.5v17" />
          </svg>
        </button>
        <RouterLink v-if="!collapsed" class="app-logo" to="/">{{ t('谱记') }}</RouterLink>
      </div>
      <nav :aria-label="t('家谱导航')">
        <RouterLink
          v-for="item in navigation"
          :key="item.path"
          :to="base + item.path"
          :class="{ selected: active(item.path) }"
          :title="item.label"
          :aria-label="item.label"
        >
          <span>{{ item.icon }}</span>
          <b class="nav-label">{{ item.label }}</b>
        </RouterLink>
      </nav>
      <div class="sidebar-footer">
        <LanguageSwitcher />
      </div>
    </aside>
    <div class="app-body">
      <main class="page-content">
        <LoadState
          :loading="loading && !loaded"
          :error="!loaded ? error : ''"
          @retry="load(true)"
        >
          <RouterView v-if="family" v-slot="{ Component }">
            <component :is="Component" :key="`${familyId}:${String(route.name)}`" />
          </RouterView>
          <el-empty v-else :description="t('未找到这个家谱')">
            <RouterLink to="/">{{ t('返回家谱列表') }}</RouterLink>
          </el-empty>
        </LoadState>
      </main>
    </div>
  </div>
</template>
<script setup lang="ts">
import { t } from '../i18n';

import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useFamily } from '../composables/useFamily';
import { useFamilies } from '../composables/useFamilies';
import LanguageSwitcher from '../components/LanguageSwitcher.vue';
import LoadState from '../components/LoadState.vue';
const { family, familyId, base } = useFamily();
const { loading, error, loaded, load } = useFamilies();
const route = useRoute();
const collapsed = ref(false);
const navigation = computed(() => [
  { path: '', label: t('家谱概览'), icon: '◈' },
  { path: '/people', label: t('人物档案'), icon: '☷' },
  { path: '/tree', label: t('家族树'), icon: '⑂' },
  { path: '/graph', label: t('关系图谱'), icon: '⌘' },
  { path: '/settings', label: t('设置与备份'), icon: '⚙' },
]);
function active(path: string) {
  return path === ''
    ? route.path === base.value
    : route.path.startsWith(base.value + path) ||
        (path === '/people' && route.name === 'person');
}
onMounted(() => load(true));
</script>
