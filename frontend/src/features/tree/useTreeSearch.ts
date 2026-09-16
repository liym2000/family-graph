import { computed, nextTick, ref, watch, type ComputedRef, type Ref } from 'vue';
import { api, type TreePerson } from '../../api';
import { t } from '../../i18n';
import type { TreeLayout } from './types';
import type { useTreeBranches } from './useTreeBranches';
import type { useTreeViewport } from './useTreeViewport';
export function useTreeSearch(
  familyId: Ref<number>,
  tree: ReturnType<typeof useTreeBranches>,
  layout: ComputedRef<TreeLayout>,
  spousesFor: (person: TreePerson) => TreePerson[],
  viewport: ReturnType<typeof useTreeViewport>,
  hoveredNode: Ref<string | undefined>,
  searchId: Ref<number | undefined>,
) {
  const { root, busy, branches, expanded, loadBranch } = tree;
  const { zoom, setZoom, measure, locate } = viewport;
  const searchError = ref(''),
    finding = ref(false);
  const foundPerson = ref<TreePerson>();
  const foundNode = computed(() =>
    foundPerson.value
      ? layout.value.nodes.find((n) => n.person.id === foundPerson.value!.id) ||
        layout.value.nodes.find((n) =>
          spousesFor(n.person).some((s) => s.id === foundPerson.value!.id),
        )
      : undefined,
  );
  const highlightedNodes = computed(() => {
    const highlighted = new Set<string>();
    for (let current of [
      layout.value.nodes.find((n) => n.key === hoveredNode.value),
      foundNode.value,
    ]) {
      while (current && !highlighted.has(current.key)) {
        highlighted.add(current.key);
        current = current.parent;
      }
    }
    return highlighted;
  });
  function clearTreeHighlight() {
    hoveredNode.value = undefined;
    foundPerson.value = undefined;
  }
  async function findPerson() {
    if (!searchId.value || !root.value || busy.value) return;
    const token = tree.getVersion(),
      targetId = searchId.value,
      rootId = root.value.id;
    busy.value = true;
    finding.value = true;
    searchError.value = '';
    clearTreeHighlight();
    try {
      const target = await api.getPerson(targetId);
      if (token !== tree.getVersion()) return;
      if (Number(target.person.family_id) !== familyId.value) throw Error(t('人物不属于当前家谱'));
      let node =
        layout.value.nodes.find((n) => n.person.id === targetId) ||
        layout.value.nodes.find((n) => spousesFor(n.person).some((s) => s.id === targetId));
      if (!node) {
        const result = await api.treePath(familyId.value, rootId, targetId);
        if (token !== tree.getVersion()) return;
        if (!result.found) {
          searchError.value = t('该人物不在当前起点的分支中，可通过顶部选择起点查看');
          return;
        }
        for (let i = 0; i < result.path.length; i++) {
          const id = result.path[i],
            child = result.path[i + 1];
          if (!branches[id] && (child !== undefined || result.spouseId !== null))
            await loadBranch(id, false, token, Infinity);
          if (token !== tree.getVersion()) return;
          if (child !== undefined) {
            while (
              !branches[id]?.children.some((p) => p.id === child) &&
              branches[id]?.nextOffset != null
            ) {
              await loadBranch(id, true, token, Infinity);
              if (token !== tree.getVersion()) return;
            }
            if (!branches[id]?.children.some((p) => p.id === child))
              throw Error(t('分支已变化，请重新查找'));
            expanded.add(id);
          }
        }
        node =
          layout.value.nodes.find((n) => n.person.id === targetId) ||
          layout.value.nodes.find((n) => spousesFor(n.person).some((s) => s.id === targetId));
      }
      if (!node) throw Error(t('分支已变化，请重新查找'));
      if (targetId !== searchId.value) return;
      foundPerson.value = target.person;
      hoveredNode.value = node.key;
      await nextTick();
      measure();
      if (zoom.value < 0.75) {
        setZoom(0.75);
        await nextTick();
      }
      locate(node.person.id);
    } catch (e) {
      if (token === tree.getVersion())
        searchError.value = e instanceof Error ? e.message : t('搜索失败');
    } finally {
      finding.value = false;
      if (token === tree.getVersion()) busy.value = false;
    }
  }
  watch(searchId, () => {
    clearTreeHighlight();
    searchError.value = '';
  });
  function reset() {
    clearTreeHighlight();
    searchError.value = '';
  }
  return {
    searchId,
    searchError,
    finding,
    foundPerson,
    foundNode,
    highlightedNodes,
    findPerson,
    reset,
  };
}
