import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue';
import type { TreeLayout, TreeMode } from './types';
export function useTreeViewport(
  layout: ComputedRef<TreeLayout>,
  layoutMode: Ref<TreeMode>,
  onError: (message: string) => void,
) {
  const viewport = ref<HTMLElement>();
  const treeSurface = ref<HTMLElement>();
  const fullscreen = ref(false);
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === treeSurface.value) await document.exitFullscreen();
      else await treeSurface.value?.requestFullscreen();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }
  async function fullscreenChanged() {
    fullscreen.value = document.fullscreenElement === treeSurface.value;
    await nextTick();
    measure();
    fit();
  }
  onMounted(() => document.addEventListener('fullscreenchange', fullscreenChanged));
  onUnmounted(() => document.removeEventListener('fullscreenchange', fullscreenChanged));
  const view = reactive({ left: 0, top: 0, width: 1000, height: 600 });
  const zoom = ref(1);
  let autoFit = true;
  let drag: { x: number; y: number; left: number; top: number } | undefined;
  function dragStart(event: PointerEvent) {
    if (event.pointerType !== 'mouse' || (event.target as HTMLElement).closest('button,a,input'))
      return;
    const el = viewport.value!;
    autoFit = false;
    drag = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop };
    el.setPointerCapture(event.pointerId);
  }
  function dragMove(event: PointerEvent) {
    if (drag && viewport.value) {
      viewport.value.scrollLeft = drag.left + drag.x - event.clientX;
      viewport.value.scrollTop = drag.top + drag.y - event.clientY;
    }
  }
  const offset = computed(() => ({
    x: Math.max(0, Math.round((view.width - layout.value.width * zoom.value) / 2)),
    y: Math.max(0, Math.round((view.height - layout.value.height * zoom.value) / 2)),
  }));
  function setZoom(value: number, x = view.width / 2, y = view.height / 2) {
    autoFit = false;
    const worldX = (view.left + x - offset.value.x) / zoom.value;
    const worldY = (view.top + y - offset.value.y) / zoom.value;
    zoom.value = Math.max(0.01, Math.min(2, value));
    void nextTick(() => {
      viewport.value?.scrollTo({
        left: worldX * zoom.value + offset.value.x - x,
        top: worldY * zoom.value + offset.value.y - y,
      });
      measure();
    });
  }
  function formatZoom(value: number) {
    return `${value}%`;
  }
  function sliderZoom(value: number | number[]) {
    if (typeof value === 'number') setZoom(value / 100);
  }
  function fit() {
    autoFit = true;
    measure();
    zoom.value = Math.max(0.01, Math.min(1, (view.width - 32) / layout.value.width, (view.height - 32) / layout.value.height));
    void nextTick(() => {
      viewport.value?.scrollTo({ left: 0, top: 0 });
      measure();
    });
  }
  const visibleNodes = computed(() =>
    layout.value.nodes.filter(
      (n) =>
        n.x + 100 > (view.left - offset.value.x) / zoom.value - 300 &&
        n.x < (view.left + view.width - offset.value.x) / zoom.value + 300 &&
        n.y + 160 > (view.top - offset.value.y) / zoom.value - 200 &&
        n.y < (view.top + view.height - offset.value.y) / zoom.value + 200,
    ),
  );
  const visibleEdges = computed(() =>
    layout.value.nodes.filter(
      (n) =>
        n.parent &&
        (layoutMode.value === 'radial' ||
          (Math.max(n.x, n.parent.x) + 100 > (view.left - offset.value.x) / zoom.value &&
            Math.min(n.x, n.parent.x) < (view.left + view.width - offset.value.x) / zoom.value &&
            Math.max(n.y + n.height, n.parent.y + n.parent.height) >
              (view.top - offset.value.y) / zoom.value &&
            Math.min(n.y, n.parent.y) < (view.top + view.height - offset.value.y) / zoom.value)),
    ),
  );
  function measure() {
    if (viewport.value)
      Object.assign(view, {
        left: viewport.value.scrollLeft,
        top: viewport.value.scrollTop,
        width: viewport.value.clientWidth,
        height: viewport.value.clientHeight,
      });
  }
  function locate(id: number) {
    autoFit = false;
    const n = layout.value.nodes.find((n) => n.person.id === id);
    if (n)
      viewport.value?.scrollTo({
        left: Math.max(
          0,
          offset.value.x +
            (n.x + (layoutMode.value !== 'tree' ? 10 : 50)) * zoom.value -
            view.width / 2,
        ),
        top: Math.max(0, offset.value.y + (n.y + n.height / 2) * zoom.value - view.height / 2),
      });
  }
  function dragEnd() {
    drag = undefined;
  }
  let observer: ResizeObserver;
  onMounted(() => {
    observer = new ResizeObserver(() => {
      measure();
      if (autoFit && layoutMode.value === 'dots') fit();
    });
    if (viewport.value) observer.observe(viewport.value);
  });
  onUnmounted(() => observer?.disconnect());
  watch(zoom, () => nextTick(measure));
  return {
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
    setZoom,
    sliderZoom,
    formatZoom,
    toggleFullscreen,
    dragStart,
    dragMove,
    dragEnd,
  };
}
