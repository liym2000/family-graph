<template>
  <el-tooltip :content="description" placement="top" :show-after="150">
    <span
      class="descendant-badge"
      :class="`descendant-badge--${tone}`"
      tabindex="0"
      :aria-label="(ancestor ? t('上溯 {count} 代', { count: depth ?? '—' }) : t('后裔 {count} 代', { count: depth ?? '—' })) + ' · ' + label + ' · ' + description"
    >
      <strong>{{ depth ?? '—' }}</strong>
    </span>
  </el-tooltip>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import type { Person } from '../api';
import { t } from '../i18n';
const props = defineProps<{ person: Person; ancestor?: boolean }>();
const depth = computed(() => props.ancestor ? props.person.ancestor_generations : props.person.descendant_generations);
const source = computed(
  () =>
    (props.ancestor ? ((depth.value || 0) > 0 ? 'direct' : 'none') : props.person.descendant_generations_source) ||
    ((props.person.descendant_generations || 0) > 0 ? 'direct' : 'none'),
);
const unavailable = computed(() => depth.value == null);
const tone = computed(() =>
  unavailable.value ? 'none' : source.value || 'none',
);
const label = computed(() =>
  props.ancestor ? t('上溯') : unavailable.value
    ? t('暂无法计算')
    : source.value === 'spouse'
      ? t('自动关联')
      : source.value === 'direct'
        ? t('手动绑定')
        : t('未录入后裔'),
);
const description = computed(() =>
  props.ancestor ? (unavailable.value ? t('关联的亲子关系存在循环或数据未加载，暂无法计算上溯代数。') : t('沿已记录亲子关系向上追溯的最长代数，不含本人；0 表示未记录父母，不一定是错误。')) : unavailable.value
    ? props.person.descendant_generations === null
      ? t('关联的亲子关系存在循环，暂无法计算后裔代数。')
      : t('暂无法计算')
    : source.value === 'spouse'
      ? t('默认关联：按现有记录顺序选择第一位配偶作为另一位家长，可随后手动修改。')
      : source.value === 'direct'
        ? t('根据本人已录入的亲子关系计算，不含本人。')
        : t('未录入后裔'),
);
</script>
<style scoped>
.descendant-badge {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  padding: 5px 9px;
  border-radius: 7px;
  line-height: 1.4;
  max-width: 100%;
  cursor: help;
}
.descendant-badge strong {
  font-size: 12px;
  font-weight: 600;
}
.descendant-badge--direct {
  color: #155e50;
  background: #e1f2eb;
  border: 1px solid #b9ddcd;
}
.descendant-badge--spouse {
  color: #854d0e;
  background: #fff3d6;
  border: 1px solid #e9cd88;
}
.descendant-badge--none {
  color: #556171;
  background: #f0f2f5;
  border: 1px solid #d9dfe5;
}
</style>
