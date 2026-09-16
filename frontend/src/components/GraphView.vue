<template>
  <section ref="root" class="graph-view" :class="{ fullscreen: isFullscreen }">
    <div class="ui-actions graph-display-controls">
      <div v-if="!isRelationshipGraph" class="depth-controls">
        <label>
          <span>{{ t('上代') }}</span>
          <el-input-number
            v-model="ancestorDepth"
            :max="100"
            size="small"
            :min="graphDepthMin"
            :step="1"
            step-strictly
            controls-position="right"
          />
          <el-button size="small" text type="primary" @click="showEarliestAncestors">
            {{ t('最初') }}
          </el-button>
        </label>
        <label>
          <span>{{ t('下代') }}</span>
          <el-input-number
            v-model="descendantDepth"
            size="small"
            :min="graphDepthMin"
            :max="descendantDepthMax"
            :step="1"
            step-strictly
            controls-position="right"
          />
        </label>
      </div>
      <el-button @click="centerCanvas">{{ t('定位起点') }}</el-button>
      <el-button @click="fitToView">{{ t('适应窗口') }}</el-button>
      <div class="graph-zoom">
        <el-slider
          :model-value="Math.round(scale * 100)"
          :min="10"
          :max="200"
          :step="1"
          :aria-label="t('缩放')"
          :format-tooltip="formatZoom"
          @update:model-value="sliderZoom"
        />
        <output>{{ Math.round(scale * 100) }}%</output>
      </div>
      <el-button @click="toggleFullscreen">{{ t(isFullscreen ? '退出全屏' : '全屏') }}</el-button>
    </div>

    <div
      ref="wrap"
      class="graph-wrap"
      tabindex="0"
      :aria-label="t('家谱图谱，可使用方向键滚动')"
      :class="{ panning: isPanning }"
      @pointerdown="startPan"
      @pointermove="movePan"
      @pointerup="endPan"
      @pointerleave="endPan"
    >
      <svg
        class="family-svg"
        :viewBox="`0 0 ${canvas.width} ${canvas.height}`"
        :style="{
          width: `${canvas.width * scale}px`,
          height: `${canvas.height * scale}px`,
        }"
      >
        <g class="edges">
          <path
            v-for="edge in visibleParentEdges"
            :key="`p-${edge.id}`"
            class="edge parent-edge"
            :class="{ 'relation-path-edge': relationPathEdgeIds.has(edge.id) }"
            :style="{ stroke: edgeStroke(edge) }"
            :d="parentPath(edge)"
          />
          <path
            v-for="edge in visibleSpouseEdges"
            :key="`s-${edge.id}`"
            class="edge spouse-edge"
            :class="{ 'relation-path-edge': relationPathEdgeIds.has(edge.id) }"
            :style="{ stroke: edgeStroke(edge) }"
            :d="spousePath(edge)"
          />
        </g>

        <g class="nodes">
          <g
            v-for="node in positionedNodes"
            :key="node.id"
            class="graph-node"
            :class="{
              center: node.isCenter,
              'relation-path-node': relationPathNodeIds.has(node.id),
              'relation-endpoint-node': relationEndpointIds.has(node.id),
            }"
            :transform="`translate(${node.x}, ${node.y})`"
            role="button"
            tabindex="0"
            :aria-label="t('查看 {p0}', { p0: node.label })"
            @keydown.enter.stop="emit('select', node.id)"
            @keydown.space.prevent.stop="emit('select', node.id)"
            @click.stop="emit('select', node.id)"
          >
            <rect
              class="person-card"
              :class="{
                'branch-framed': !!parentSourceId(node.id) || relationPathNodeIds.has(node.id),
                'relation-path-card': relationPathNodeIds.has(node.id),
                'relation-endpoint-card': relationEndpointIds.has(node.id),
              }"
              :style="{ stroke: nodeBorderColor(node.id) }"
              :width="nodeWidth"
              :height="mainHeight"
              rx="8"
            />
            <text class="node-name" x="14" y="23">{{ node.label }}</text>
            <text class="node-meta" x="14" y="44">
              {{ generationText(node.generation) }} ·
              {{ genderText(node.gender) }}
            </text>

            <g
              v-for="(spouse, index) in spouseBadges.get(node.id) || []"
              :key="spouse.id"
              class="spouse-badge"
              :transform="`translate(14, ${mainHeight + 10 + index * 42})`"
              role="button"
              tabindex="0"
              :aria-label="t('查看 {p0}', { p0: spouse.label })"
              @keydown.enter.stop="emit('select', spouse.id)"
              @keydown.space.prevent.stop="emit('select', spouse.id)"
              @click.stop="emit('select', spouse.id)"
            >
              <rect :width="nodeWidth - 28" height="30" rx="6" />
              <text x="12" y="20">{{ t('配') }} {{ spouse.label }}</text>
            </g>
          </g>
        </g>
      </svg>

      <div v-if="loading" class="graph-empty" role="status">
        {{ t('正在加载图谱') }}
      </div>
    </div>

    <div v-if="error" class="load-state" role="alert">
      <p>{{ error }}</p>
      <el-button @click="loadGraph">{{ t('重试') }}</el-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { t } from '../i18n';
import { relationshipGraphLayout } from '../layout/relationshipGraphLayout';

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, type GraphPayload, type Person } from '../api';

const props = defineProps<{
  familyId: number;
  personId: number;
  relationshipGraph?: GraphPayload | null;
}>();
const emit = defineEmits<{ select: [personId: number] }>();

const root = ref<HTMLElement | null>(null);
const wrap = ref<HTMLDivElement | null>(null);
const payload = ref<GraphPayload | null>(null);
const scale = ref(1);
const route = useRoute();
const router = useRouter();
const depth = (value: unknown, fallback: number, max: number) =>
  value !== undefined && Number.isInteger(Number(value))
    ? Math.max(0, Math.min(max, Number(value)))
    : fallback;
const ancestorDepth = ref(depth(route.query.ancestors, 3, 100));
const descendantDepth = ref(depth(route.query.descendants, 2, 8));
const loading = ref(false);
const error = ref('');
let requestId = 0;
watch(
  () => [route.query.ancestors, route.query.descendants],
  () => {
    ancestorDepth.value = depth(route.query.ancestors, 3, 100);
    descendantDepth.value = depth(route.query.descendants, 2, 8);
  },
);
watch([ancestorDepth, descendantDepth], () => {
  router.replace({
    query: {
      ...route.query,
      ancestors: ancestorDepth.value,
      descendants: descendantDepth.value,
    },
  });
});
const isFullscreen = ref(false);
const isPanning = ref(false);
const panStart = ref<{
  x: number;
  y: number;
  left: number;
  top: number;
} | null>(null);

const graphDepthMin = 0;
const allAncestorDepthFallback = 100;
const descendantDepthMax = 8;
const geometry = computed(() => relationshipGraphLayout(payload.value));
const centerNode = computed(() => geometry.value.centerNode);
const isRelationshipGraph = computed(() => geometry.value.isRelationshipGraph);
const relationPathNodeIds = computed(() => geometry.value.relationPathNodeIds);
const relationPathEdgeIds = computed(() => geometry.value.relationPathEdgeIds);
const relationEndpointIds = computed(() => geometry.value.relationEndpointIds);
const spouseBadges = computed(() => geometry.value.spouseBadges);
const positionedNodes = computed(() => geometry.value.positionedNodes);
const positionById = computed(() => geometry.value.positionById);
const visibleParentEdges = computed(() => geometry.value.visibleParentEdges);
const visibleSpouseEdges = computed(() => geometry.value.visibleSpouseEdges);
const canvas = computed(() => geometry.value.canvas);
const nodeWidth = computed(() => geometry.value.nodeWidth);
const mainHeight = computed(() => geometry.value.mainHeight);
function parentSourceId(
  ...args: Parameters<ReturnType<typeof relationshipGraphLayout>['parentSourceId']>
) {
  return geometry.value.parentSourceId(...args);
}
function nodeBorderColor(
  ...args: Parameters<ReturnType<typeof relationshipGraphLayout>['nodeBorderColor']>
) {
  return geometry.value.nodeBorderColor(...args);
}
function edgeStroke(...args: Parameters<ReturnType<typeof relationshipGraphLayout>['edgeStroke']>) {
  return geometry.value.edgeStroke(...args);
}
function parentPath(...args: Parameters<ReturnType<typeof relationshipGraphLayout>['parentPath']>) {
  return geometry.value.parentPath(...args);
}
function spousePath(...args: Parameters<ReturnType<typeof relationshipGraphLayout>['spousePath']>) {
  return geometry.value.spousePath(...args);
}

function generationText(value: number | null) {
  return value ? t('{p0}世', { p0: value }) : t('世代未定');
}

function genderText(value: Person['gender']) {
  if (value === 'male') return t('男');
  if (value === 'female') return t('女');
  return t('未定');
}

async function loadGraph() {
  const id = ++requestId;
  loading.value = true;
  error.value = '';
  try {
    const result =
      props.relationshipGraph ||
      (await api.graph(props.personId, props.familyId, {
        ancestorDepth: ancestorDepth.value,
        descendantDepth: descendantDepth.value,
      }));
    if (id !== requestId) return;
    payload.value = result;
    await nextTick();
    fitToView();
  } catch (e) {
    if (id === requestId) error.value = e instanceof Error ? e.message : t('无法加载图谱');
  } finally {
    if (id === requestId) loading.value = false;
  }
}

function handleFullscreenChange() {
  isFullscreen.value = document.fullscreenElement === root.value;
  nextTick(fitToView);
}

async function toggleFullscreen() {
  if (!root.value) return;
  if (document.fullscreenElement === root.value) {
    await document.exitFullscreen();
  } else {
    await root.value.requestFullscreen();
  }
}

function centerCanvas() {
  const el = wrap.value;
  const center = centerNode.value ? positionById.value.get(centerNode.value.id) : null;
  if (!el || !center) return;
  el.scrollLeft = Math.max(0, center.x * scale.value - el.clientWidth * 0.42);
  el.scrollTop = Math.max(0, center.y * scale.value - el.clientHeight * 0.44);
}

function fitToView() {
  const el = wrap.value;
  if (!el) return;
  const fitWidth = (el.clientWidth - 36) / canvas.value.width;
  const fitHeight = (el.clientHeight - 36) / canvas.value.height;
  scale.value = Math.max(0.1, Math.min(1, fitWidth, fitHeight));
  nextTick(centerCanvas);
}

function setScale(nextScale: number, anchor?: { x: number; y: number }) {
  const el = wrap.value;
  const previous = scale.value;
  const next = Math.max(0.1, Math.min(2, nextScale));
  if (!el || next === previous) {
    scale.value = next;
    return;
  }

  const rect = el.getBoundingClientRect();
  const anchorX = anchor ? anchor.x - rect.left : el.clientWidth / 2;
  const anchorY = anchor ? anchor.y - rect.top : el.clientHeight / 2;
  const contentX = (el.scrollLeft + anchorX) / previous;
  const contentY = (el.scrollTop + anchorY) / previous;

  scale.value = next;
  nextTick(() => {
    el.scrollLeft = Math.max(0, contentX * next - anchorX);
    el.scrollTop = Math.max(0, contentY * next - anchorY);
  });
}

function sliderZoom(value: number | number[]) {
  if (typeof value === 'number') setScale(value / 100);
}
function formatZoom(value: number) {
  return `${value}%`;
}

function showEarliestAncestors() {
  const generation = centerNode.value?.generation;
  ancestorDepth.value = generation
    ? Math.min(100, Math.max(0, generation - 1))
    : allAncestorDepthFallback;
}

function startPan(event: PointerEvent) {
  if ((event.target as Element).closest('.graph-node, .spouse-badge, button')) return;
  const el = wrap.value;
  if (!el) return;
  isPanning.value = true;
  panStart.value = {
    x: event.clientX,
    y: event.clientY,
    left: el.scrollLeft,
    top: el.scrollTop,
  };
  el.setPointerCapture(event.pointerId);
}

function movePan(event: PointerEvent) {
  if (!isPanning.value || !panStart.value || !wrap.value) return;
  wrap.value.scrollLeft = panStart.value.left - (event.clientX - panStart.value.x);
  wrap.value.scrollTop = panStart.value.top - (event.clientY - panStart.value.y);
}

function endPan() {
  isPanning.value = false;
  panStart.value = null;
}

watch(
  () => [
    props.familyId,
    props.personId,
    ancestorDepth.value,
    descendantDepth.value,
    props.relationshipGraph,
  ],
  loadGraph,
);
onMounted(() => {
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  loadGraph();
});
onBeforeUnmount(() => {
  requestId++;
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
});
</script>
<style scoped>
.graph-display-controls {
  margin: 0 0 12px;
  flex-shrink: 0;
}
.graph-zoom {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 210px;
  padding: 0 8px;
}
.graph-zoom .el-slider {
  flex: 1;
  min-width: 0;
}
.graph-zoom output {
  width: 44px;
  text-align: right;
  font-size: 13px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
</style>
