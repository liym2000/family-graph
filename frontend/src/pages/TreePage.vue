<template>
  <PageHeading class="tree-page-heading">
    <div class="tree-title">
      <h1>{{ t('家族树') }}</h1>
      <span
        class="tree-status"
        aria-live="polite"
        :title="t('已显示 {count} 人', { count: displayCount })"
        :aria-label="t('已显示 {count} 人', { count: displayCount })"
      >{{ displayCount }}</span>
    </div>
    <div class="ui-actions tree-tools">
      <div class="tree-tool-group tree-person-group" role="group" :aria-label="t('搜索人物')"><TreePersonActions v-model="selected" :family-id="familyId" :busy="busy" :finding="finding" :has-root="!!root" @start="start" @find="findPerson" /></div>
      <div class="tree-tool-group tree-canvas-group">
        <div class="tree-zoom">
          <el-slider
            :model-value="Math.round(zoom * 100)"
            :min="1"
            :max="200"
            :step="1"
            :aria-label="t('缩放')"
            :format-tooltip="formatZoom"
            @update:model-value="sliderZoom"
          />
          <output>{{ Math.round(zoom * 100) }}%</output>
        </div>
      </div>
      <div class="tree-tool-group tree-view-group">
        <TreeLayoutSwitch v-model="layoutMode" />
        <TreeActionsMenu
          :has-root="!!root"
          :busy="busy"
          :expanding-all="expandingAll"
          :fullscreen="fullscreen"
          @command="treeAction"
        />
      </div>
    </div>
  </PageHeading>
  <section ref="treeSurface" class="tree-surface" :class="{ 'tree-dots-view': layoutMode === 'dots' }">
    <div v-if="fullscreen" class="tree-display-header">
      <div class="tree-status" aria-live="polite">
        {{ t('已显示 {count} 人', { count: displayCount }) }}
        <span v-if="busy"> · {{ t('加载中') }}</span>
      </div>
      <div class="ui-actions tree-tools">
        <div class="tree-tool-group tree-person-group" role="group" :aria-label="t('搜索人物')"><TreePersonActions v-model="selected" :family-id="familyId" :busy="busy" :finding="finding" :has-root="!!root" @start="start" @find="findPerson" /></div>
        <div class="tree-tool-group tree-canvas-group">
          <template v-if="fullscreen">
            <div class="tree-zoom">
              <el-slider
                :model-value="Math.round(zoom * 100)"
                :min="1"
                :max="200"
                :step="1"
                :aria-label="t('缩放')"
                :format-tooltip="formatZoom"
                @update:model-value="sliderZoom"
              />
              <output>{{ Math.round(zoom * 100) }}%</output>
            </div>
          </template>
        </div>
        <div class="tree-tool-group tree-view-group">
          <TreeLayoutSwitch v-model="layoutMode" />
          <TreeActionsMenu
            :has-root="!!root"
            :busy="busy"
            :expanding-all="expandingAll"
            :fullscreen="fullscreen"
            @command="treeAction"
          />
        </div>
      </div>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <div v-if="searchError || foundPerson" class="tree-search">
      <span v-if="searchError" role="alert" class="error-text">{{ searchError }}</span>
      <span v-else-if="foundPerson" role="status">{{ t('已定位：{name}', { name: foundPerson.name })
      }}<template v-if="foundNode && foundNode.person.id !== foundPerson.id">
        · {{ t('配偶显示在 {name} 的节点内', { name: foundNode.person.name }) }}</template></span>
      <el-button link @click="clearTreeHighlight">{{ t('关闭查找') }}</el-button>
    </div>
    <el-empty v-if="!root && !busy" :description="t('暂无人物')"><RouterLink :to="base + '/people'">{{ t(readOnly ? '人物档案' : '添加人物') }}</RouterLink></el-empty>
    <div class="tree-workspace" @keydown.esc="clearTreeHighlight">
      <div
        ref="viewport"
        class="tree-viewport"
        @click="clearRadialSelection"
        @scroll="measure"
        @pointerdown="dragStart"
        @pointermove="dragMove"
        @pointerup="dragEnd()"
        @pointercancel="dragEnd()"
      >
        <div
          :style="{
            width: `${Math.max(view.width, layout.width * zoom)}px`,
            height: `${Math.max(view.height, layout.height * zoom)}px`,
          }"
        >
          <div
            class="tree-stage"
            :style="{
              width: `${layout.width}px`,
              height: `${layout.height}px`,
              left: `${offset.x}px`,
              top: `${offset.y}px`,
              transform: zoom === 1 ? 'none' : `scale(${zoom})`,
            }"
          >
            <svg
              class="tree-lines"
              :class="{ radial: layoutMode !== 'tree', highlighting: !!highlightedNodes.size }"
              :width="layout.width"
              :height="layout.height"
              aria-hidden="true"
            >
              <path
                v-for="node in visibleEdges"
                :key="node.key"
                :d="connector(node)"
                :class="{
                  highlighted:
                    highlightedNodes.has(node.key) && highlightedNodes.has(node.parent?.key || ''),
                }"
                fill="none"
                stroke-width="1.6"
                stroke-linecap="round"
                :stroke="node.person.origin === 'single_spouse' ? '#bc8a29' : '#90aaa5'"
                :stroke-dasharray="node.person.origin === 'single_spouse' ? '5 4' : undefined"
              >
                <title>{{ node.group }}</title>
              </path>
            </svg>
            <template v-if="layoutMode === 'tree'">
              <TreeNodeCard
                v-for="node in visibleNodes"
                :key="node.key"
                :node="node"
                :spouses="spousesFor(node.person)"
                :busy="busy"
                :is-expanded="expanded.has(node.person.id)"
                :search-match="node.key === foundNode?.key"
                :search-muted="!!foundPerson && !highlightedNodes.has(node.key)"
                :has-more="branches[node.person.id]?.nextOffset != null"
                :append-to="fullscreen && treeSurface ? treeSurface : 'body'"
                @detail="detail"
                @locate="locate"
                @parent="node.parent ? hideParents(node) : showParent(node)"
                @collapse="collapse"
                @expand="expand"
              />
            </template>
            <template v-else>
              <button
                v-for="node in visibleNodes"
                :key="node.key"
                class="radial-dot"
                :class="[
                  node.person.gender,
                  {
                    origin: !node.parent,
                    dimmed: !!highlightedNodes.size && !highlightedNodes.has(node.key),
                    highlighted: highlightedNodes.has(node.key),
                    automatic: node.person.origin === 'single_spouse',
                    'search-match': node.key === foundNode?.key,
                  },
                ]"
                :style="{ left: `${node.x}px`, top: `${node.y}px` }"
                aria-controls="radial-person-panel"
                :aria-pressed="pinned && hoveredNode === node.key"
                :aria-label="`${node.person.name} · ${genderLabel(node.person.gender)}`"
                @mouseenter="previewNode(node.key)"
                @focus="previewNode(node.key)"
                @click="pinNode(node.key)"
              ></button>
            </template>
          </div>
        </div>
      </div>
      <aside
        v-if="layoutMode !== 'tree'"
        id="radial-person-panel"
        class="radial-info-panel"
        :aria-label="t('人物详情')"
      >
        <div v-if="activeRadialNode" class="radial-person-info">
          <div class="radial-info-heading">
            <strong>{{ activeRadialNode.person.name }}</strong><button
              class="radial-info-close"
              :aria-label="t('关闭人物信息')"
              @click="clearTreeHighlight"
            >
              ×
            </button>
          </div>
          <span class="radial-person-meta">{{ genderLabel(activeRadialNode.person.gender) }} ·
            {{
              activeRadialNode.person.generation
                ? t('第 {p0} 世', { p0: activeRadialNode.person.generation })
                : t('世代未定')
            }}</span>
          <div v-if="spousesFor(activeRadialNode.person).length" class="radial-person-spouses">
            <span>{{ t('配偶') }}：</span>
            <div class="spouse-list">
              <el-button
                v-for="spouse in spousesFor(activeRadialNode.person)"
                :key="spouse.id"
                :class="{ 'found-spouse': spouse.id === foundPerson?.id }"
                link
                @click="detail(spouse.id)"
              >{{ spouse.name }}</el-button>
            </div>
          </div>
          <p v-if="sidebarError" role="alert">{{ sidebarError }}</p>
          <p v-else-if="sidebarPerson" class="ui-notes">{{ sidebarPerson.remark || t('暂无备注') }}</p>
        </div>
        <p v-else class="radial-info-empty">{{ t('悬浮圆点查看人物') }}</p>
      </aside>
    </div>
  </section>
  <TreeExportDialog
    v-model="exportDialog"
    v-model:layout="exportLayout"
    v-model:scope="exportScope"
    v-model:format="exportFormat"
    :disabled="busy || exporting"
    :append-to="fullscreen && treeSurface ? treeSurface : 'body'"
    @export="exportTree"
  />
  <el-drawer
    v-model="drawer"
    :title="person?.name || t('人物详情')"
    size="min(440px, 90vw)"
    append-to-body
    :append-to="fullscreen && treeSurface ? treeSurface : 'body'"
  >
    <div class="ui-actions">
      <RouterLink v-if="person" :to="base + '/person/' + person.id">{{ t(readOnly ? '人物详情' : '编辑资料') }}</RouterLink>
    </div>
    <p v-if="detailError" role="alert">{{ detailError }}</p>
    <p v-if="person">
      {{ genderLabel(person.gender) }} ·
      {{ person.generation ? t('第 {p0} 世', { p0: person.generation }) : t('世代未定') }}
    </p>
    <p class="ui-notes">{{ person?.remark || t('暂无备注') }}</p>
  </el-drawer>
</template>
<script setup lang="ts">
import { useDemoMode } from '../composables/useDemoMode';
const { readOnly } = useDemoMode();
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useFamily } from '../composables/useFamily';
import { api, type Person } from '../api';
import { t } from '../i18n';
import TreeNodeCard from '../features/tree/TreeNodeCard.vue';
import TreeExportDialog from '../features/tree/TreeExportDialog.vue';
import PageHeading from '../components/PageHeading.vue';
import TreePersonActions from '../features/tree/TreePersonActions.vue';
import TreeActionsMenu from '../components/TreeActionsMenu.vue';
import TreeLayoutSwitch from '../components/TreeLayoutSwitch.vue';
import { useTreeBranches } from '../features/tree/useTreeBranches';
import { useTreeLayout } from '../features/tree/useTreeLayout';
import { useTreeViewport } from '../features/tree/useTreeViewport';
import { useTreeSearch } from '../features/tree/useTreeSearch';
import { useTreeExport } from '../features/tree/useTreeExport';
import type { TreeMode, TreeNode } from '../features/tree/types';
const { familyId, base } = useFamily();
const layoutMode = ref<TreeMode>('tree'),
  hoveredNode = ref<string>();
const pinned = ref(false);
function previewNode(key: string) {
  if (!pinned.value) hoveredNode.value = key;
}
function pinNode(key: string) {
  hoveredNode.value = key;
  pinned.value = true;
}
watch(hoveredNode, (key) => {
  if (!key) pinned.value = false;
}, { flush: 'sync' });
const tree = useTreeBranches(familyId, {
  nodes: () => treeNodes.value,
  count: () => displayCount.value,
  reset: () => search.reset(),
  fit: () => {
    measure();
    fit();
  },
  locate: (id) => {
    measure();
    viewportState.locate(id);
  },
});
const {
  root,
  selected,
  branches,
  expanded,
  busy,
  error,
  expandingAll,
  start,
  expand,
  collapse,
  hideParents,
  showParent,
} = tree;
const { treeNodes, layout, displayCount, spousesFor } = useTreeLayout(
  root,
  branches,
  expanded,
  layoutMode,
);
const viewportState = useTreeViewport(layout, layoutMode, (message) => {
  error.value = message;
});
const {
  viewport,
  treeSurface,
  fullscreen,
  view,
  zoom,
  offset,
  visibleNodes,
  visibleEdges,
  measure,
  fit,
  locate,
  sliderZoom,
  formatZoom,
  dragStart,
  dragMove,
  dragEnd,
} = viewportState;
const search = useTreeSearch(familyId, tree, layout, spousesFor, viewportState, hoveredNode, selected);
const {
  searchError,
  finding,
  foundPerson,
  foundNode,
  highlightedNodes,
  findPerson,
  reset: clearTreeHighlight,
} = search;
const exportingState = useTreeExport(tree, layout, spousesFor, layoutMode);
const { exportDialog, exporting, exportScope, exportFormat, exportLayout, exportTree } =
  exportingState;
const activeRadialNode = computed(
  () => layout.value.nodes.find((node) => node.key === hoveredNode.value) || foundNode.value,
);
const sidebarPerson = ref<Person>();
const sidebarError = ref('');
watch(() => activeRadialNode.value?.person.id, (id, _previous, onCleanup) => {
  sidebarPerson.value = undefined;
  sidebarError.value = '';
  if (!id) return;
  let cancelled = false;
  const timer = setTimeout(async () => {
    try {
      const result = await api.getPerson(id);
      if (!cancelled) sidebarPerson.value = result.person;
    } catch (e) {
      if (!cancelled) sidebarError.value = e instanceof Error ? e.message : t('加载失败');
    }
  }, 150);
  onCleanup(() => { cancelled = true; clearTimeout(timer); });
});
function clearRadialSelection(event: MouseEvent) {
  if (!pinned.value && !(event.target as HTMLElement).closest('.radial-dot')) hoveredNode.value = undefined;
}
function connector(node: TreeNode) {
  return layout.value.paths.get(node.key);
}
function genderLabel(g: string) {
  return g === 'male' ? t('男') : g === 'female' ? t('女') : t('未定');
}
function treeAction(command: string) {
  switch (command) {
    case 'expand':
      return expandingAll.value ? tree.stopExpansion() : tree.expandAll();
    case 'collapse':
      return tree.collapseAll();
    case 'fit':
      return fit();
    case 'export':
      return exportingState.openExport();
    case 'fullscreen':
      return viewportState.toggleFullscreen();
  }
}
const drawer = ref(false),
  person = ref<Person>(),
  detailError = ref('');
let detailVersion = 0;
async function detail(id: number) {
  const token = ++detailVersion;
  drawer.value = true;
  person.value = undefined;
  detailError.value = '';
  try {
    const result = await api.getPerson(id);
    if (token === detailVersion) person.value = result.person;
  } catch (e) {
    if (token === detailVersion) detailError.value = e instanceof Error ? e.message : t('加载失败');
  }
}

onUnmounted(() => {
  detailVersion++;
});
watch(layoutMode, () => {
  hoveredNode.value = undefined;
  void nextTick(() => {
    measure();
    fit();
  });
});
</script>
<style src="../features/tree/tree.css"></style>
