import { nextTick, onMounted, onUnmounted, reactive, ref, watch, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, type TreeBranch, type TreePerson } from '../../api';
import { t } from '../../i18n';
import type { TreeNode } from './types';
export function useTreeBranches(
  familyId: Ref<number>,
  options: {
    nodes: () => TreeNode[];
    count: () => number;
    reset: () => void;
    fit: () => void;
    locate: (id: number) => void;
  },
) {
  const route = useRoute(),
    router = useRouter();
  const INITIAL_DISPLAY_LIMIT = 200;
  let version = 0;
  const selected = ref<number>(),
    root = ref<TreePerson>();
  const branches = reactive<Record<number, TreeBranch>>({});
  const expanded = reactive(new Set<number>());
  const busy = ref(false),
    error = ref('');
  const expandingAll = ref(false);
  let stopRequested = false;
  function stopExpansion() {
    stopRequested = true;
  }
  async function expandAll() {
    if (busy.value || !root.value) return;
    const token = version;
    busy.value = true;
    expandingAll.value = true;
    stopRequested = false;
    error.value = '';
    const queue = [root.value.id],
      seen = new Set<number>();
    try {
      for (let index = 0; index < queue.length && !stopRequested && token === version; index++) {
        const id = queue[index];
        if (seen.has(id)) continue;
        seen.add(id);
        if (!branches[id]) {
          if (!(await loadBranch(id, false, token, Infinity))) break;
        } else expanded.add(id);
        while (token === version && !stopRequested && branches[id]?.nextOffset != null) {
          if (!(await loadBranch(id, true, token, Infinity))) break;
        }
        if (token !== version) break;
        for (const child of branches[id]?.children || [])
          if (child.has_children !== false) queue.push(child.id);
        // Yield between batches so controls and stop remain responsive.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } catch (e) {
      if (token === version) error.value = e instanceof Error ? e.message : t('加载失败');
    } finally {
      if (token === version) {
        busy.value = false;
        await nextTick();
        options.fit();
      }
      expandingAll.value = false;
    }
  }
  function hideParents(node: TreeNode) {
    if (busy.value) return;
    root.value = node.person;
    selected.value = node.person.id;
    prune();
    error.value = '';
    void router.replace({ query: { ...route.query, person: node.person.id } });
    void nextTick(() => {
      options.locate(node.person.id);
    });
  }
  async function showParent(node: TreeNode) {
    if (node.parent) {
      options.locate(node.parent.person.id);
      return;
    }
    if (busy.value || !root.value) return;
    busy.value = true;
    error.value = '';
    const token = version;
    try {
      const result = await api.getPerson(node.person.id);
      if (token !== version) return;
      const parents = result.relations
        .filter((r) => r.relation_type === 'parent' && r.to_person_id === node.person.id)
        .sort(
          (a, b) =>
            Number(b.from_gender === 'male') - Number(a.from_gender === 'male') || a.id - b.id,
        );
      if (!parents.length) {
        error.value = t('未录入上一代');
        return;
      }
      const parentId = parents[0].from_person_id;
      if (options.nodes().some((n) => n.person.id === parentId)) {
        options.locate(parentId);
        return;
      }
      const branch = await api.treeBranch(familyId.value, parentId);
      if (token !== version || !branch.person) return;
      const previousRoot = root.value;
      const previousBranch = branches[parentId];
      // Only attach the current branch; siblings remain available through pagination.
      const child = { ...previousRoot, origin: parents[0].origin };
      branches[parentId] = { ...branch, children: [child], nextOffset: 0 };
      expanded.add(parentId);
      root.value = branch.person;
      if (options.count() > 300) {
        root.value = previousRoot;
        expanded.delete(parentId);
        if (previousBranch) branches[parentId] = previousBranch;
        else delete branches[parentId];
        error.value = t('显示人数已达上限，请收起其他分支后再展开');
        return;
      }
      selected.value = parentId;
      void router.replace({ query: { ...route.query, person: parentId } });
      await nextTick();
      options.locate(parentId);
    } catch (e) {
      if (token === version) error.value = e instanceof Error ? e.message : t('加载失败');
    } finally {
      if (token === version) busy.value = false;
    }
  }
  function collapse(id: number) {
    expanded.delete(id);
    prune();
  }
  function collapseAll() {
    expanded.clear();
    prune();
    if (root.value) options.locate(root.value.id);
  }
  function prune() {
    const visible = new Set(options.nodes().map((n) => n.person.id));
    for (const key of Object.keys(branches))
      if (!visible.has(Number(key))) {
        delete branches[Number(key)];
        expanded.delete(Number(key));
      }
  }
  async function loadBranch(id: number, more: boolean, token: number, limit = 300) {
    const result = await api.treeBranch(
      familyId.value,
      id,
      more ? branches[id]?.nextOffset || 0 : 0,
    );
    if (token !== version) return false;
    const old = branches[id];
    branches[id] = {
      ...result,
      children: more
        ? [
            ...new Map(
              [...(old?.children || []), ...result.children].map((child) => [child.id, child]),
            ).values(),
          ]
        : result.children,
    };
    expanded.add(id);
    if (Number.isFinite(limit) && options.count() > limit) {
      if (old) branches[id] = old;
      else delete branches[id];
      if (!more) expanded.delete(id);
      error.value = t('显示人数已达上限，请收起其他分支后再展开');
      return false;
    }
    return true;
  }
  async function expand(id: number, more = false) {
    if (busy.value) return;
    busy.value = true;
    error.value = '';
    const token = version;
    try {
      await loadBranch(id, more, token);
      await nextTick();
      options.locate(id);
    } catch (e) {
      error.value = e instanceof Error ? e.message : t('加载失败');
    } finally {
      if (token === version) busy.value = false;
    }
  }
  async function start(id?: number) {
    options.reset();
    const token = ++version;
    busy.value = true;
    error.value = '';
    expanded.clear();
    Object.keys(branches).forEach((key) => delete branches[Number(key)]);
    root.value = undefined;
    try {
      const first = await api.treeBranch(familyId.value, id);
      if (token !== version) return;
      if (!first.person) return;
      root.value = first.person;
      selected.value = first.person.id;
      branches[first.person.id] = first;
      expanded.add(first.person.id);
      while (options.count() > INITIAL_DISPLAY_LIMIT && branches[first.person.id].children.length) {
        branches[first.person.id].children = branches[first.person.id].children.slice(0, -1);
        branches[first.person.id].nextOffset = branches[first.person.id].children.length;
      }
      // Root plus children plus grandchildren: bounded breadth-first expansion.
      for (const child of [...branches[first.person.id].children]) {
        if (token !== version) return;
        if (
          child.has_children &&
          !(await loadBranch(child.id, false, token, INITIAL_DISPLAY_LIMIT))
        )
          break;
      }
      if (Number(route.query.person) !== first.person.id)
        void router.replace({ query: { person: first.person.id } });
      await nextTick();
      options.fit();
    } catch (e) {
      if (token === version) error.value = e instanceof Error ? e.message : t('加载失败');
    } finally {
      if (token === version) busy.value = false;
    }
  }
  onMounted(() => void start(Number(route.query.person) || undefined));
  onUnmounted(() => {
    version++;
    stopRequested = true;
  });
  watch(
    () => route.query.person,
    (value) => {
      if (Number(value) !== root.value?.id) void start(Number(value) || undefined);
    },
  );
  return {
    selected,
    root,
    branches,
    expanded,
    busy,
    error,
    expandingAll,
    start,
    loadBranch,
    expand,
    collapse,
    collapseAll,
    expandAll,
    stopExpansion,
    showParent,
    hideParents,
    getVersion: () => version,
    isStopped: () => stopRequested,
  };
}
