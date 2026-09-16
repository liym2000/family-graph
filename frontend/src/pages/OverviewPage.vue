<template>
  <PageHeading>
    <h1>{{ t('家谱概览') }}</h1>
  </PageHeading>
  <div class="stat-grid overview-stats">
    <article class="surface stat">
      <span>{{ t('姓氏') }}</span>
      <strong>{{ family.surname || t('未填写') }}</strong>
    </article>
    <article class="surface stat">
      <span>{{ t('家谱名称') }}</span>
      <strong class="family-name">{{ family.name }}</strong>
    </article>
    <article class="surface stat">
      <span>{{ t('人数') }}</span>
      <strong>{{ family.people_count ?? 0 }}</strong>
    </article>
  </div>
  <div class="overview-grid">
    <section class="surface">
      <h2>{{ t('开始整理') }}</h2>
      <RouterLink v-for="link in links" :key="link.path" class="feature-link" :to="base + link.path">
        <strong>{{ link.label }}</strong>
        <span>{{ link.description }}</span>
      </RouterLink>
    </section>
    <section class="surface">
      <h2>{{ t('备注') }}</h2>
      <p class="ui-notes overview-notes">{{ family.remark?.trim() ? family.remark : '---' }}</p>
    </section>
  </div>
</template>
<script setup lang="ts">
import PageHeading from '../components/PageHeading.vue';
import { t } from '../i18n';
import { computed } from 'vue';

import { useFamily } from '../composables/useFamily';
const { family, base } = useFamily();
const links = computed(() => [
  { path: '/people', label: t('人物档案'), description: t('按姓名、世代和性别查找人物 →') },
  { path: '/graph', label: t('探索亲缘'), description: t('从一个人出发，查看祖先、后代与两人联系 →') },
]);
</script>
<style scoped>
.overview-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.family-name { overflow-wrap: anywhere; }
@media (max-width: 760px) {
  .overview-stats { grid-template-columns: 1fr; }
}
.overview-notes { margin: 0; line-height: 1.7; }
</style>
