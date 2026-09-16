<template>
  <article
    class="tree-node"
    :style="{ left: `${node.x}px`, top: `${node.y}px`, height: `${node.height}px` }"
    :class="[
      node.person.gender,
      {
        automatic: node.person.origin === 'single_spouse',
        'search-match': searchMatch,
        'search-muted': searchMuted,
      },
    ]"
    :aria-label="`${node.person.name} · ${genderLabel(node.person.gender)}`"
  >
    <button
      class="tree-person"
      :title="`${node.person.name} · ${genderLabel(node.person.gender)}`"
      @click="emit('detail', node.person.id)"
    >
      <strong>{{ node.person.name }}</strong>
    </button>

    <div v-if="spouses.length" class="tree-spouses" :aria-label="t('配偶')">
      <button :title="spouses[0].name" @click="emit('detail', spouses[0].id)">
        {{ spouses[0].name }}
      </button>
      <el-popover
        v-if="spouses.length > 1"
        trigger="click"
        :width="220"
        :title="t('配偶')"
        :append-to="appendTo"
      >
        <template #reference><button class="spouse-more" :aria-label="t('配偶')">
          +{{ spouses.length - 1 }}
        </button></template>
        <div class="spouse-list">
          <el-button
            v-for="spouse in spouses"
            :key="spouse.id"
            link
            @click="emit('detail', spouse.id)"
          >{{ spouse.name }}</el-button>
        </div>
      </el-popover>
    </div>
    <div class="ui-actions tree-node-actions">
      <button
        class="tree-icon"
        :title="t(node.parent ? '收起上一代' : '显示上一代')"
        :aria-label="t(node.parent ? '收起上一代' : '显示上一代')"
        :disabled="busy"
        @click="emit('parent')"
      >
        {{ node.parent ? '−' : '↓' }}
      </button>
      <span
        class="tree-generation"
        :title="
          node.person.generation ? t('第 {p0} 世', { p0: node.person.generation }) : t('世代未定')
        "
        :aria-label="
          node.person.generation ? t('第 {p0} 世', { p0: node.person.generation }) : t('世代未定')
        "
      >{{ node.person.generation ?? '—' }}</span>
      <button
        v-if="node.repeat"
        class="tree-icon"
        :title="t('定位已显示人物')"
        :aria-label="t('定位已显示人物')"
        @click="emit('locate', node.person.id)"
      >
        ↗
      </button>
      <button
        v-else-if="isExpanded"
        class="tree-icon"
        :title="t('收起')"
        :aria-label="t('收起')"
        @click="emit('collapse', node.person.id)"
      >
        −
      </button>
      <button
        v-else-if="node.person.has_children !== false"
        class="tree-icon"
        :title="t('展开子女')"
        :aria-label="t('展开子女')"
        :disabled="busy"
        @click="emit('expand', node.person.id)"
      >
        ↑
      </button>
      <button
        v-if="isExpanded && hasMore"
        class="tree-icon"
        :title="t('加载更多')"
        :aria-label="t('加载更多')"
        :disabled="busy"
        @click="emit('expand', node.person.id, true)"
      >
        …
      </button>
    </div>
  </article>
</template>
<script setup lang="ts">
import { t } from '../../i18n';
import type { TreePerson } from '../../api';
import type { TreeNode } from './types';
defineProps<{
  node: TreeNode;
  spouses: TreePerson[];
  busy: boolean;
  isExpanded: boolean;
  searchMatch: boolean;
  searchMuted: boolean;
  hasMore: boolean;
  appendTo: HTMLElement | string;
}>();
const emit = defineEmits<{
  detail: [id: number];
  locate: [id: number];
  parent: [];
  collapse: [id: number];
  expand: [id: number, more?: boolean];
}>();
function genderLabel(g: string) {
  return g === 'male' ? t('男') : g === 'female' ? t('女') : t('未定');
}
</script>
