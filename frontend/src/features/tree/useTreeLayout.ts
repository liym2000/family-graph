import { computed, type Ref } from 'vue';
import { type TreeBranch, type TreePerson } from '../../api';
import { t } from '../../i18n';
import { compactTreeLayout } from '../../layout/compactTreeLayout';
import { radialTreeLayout } from '../../layout/radialTreeLayout';
import type { TreeMode, TreeNode } from './types';
export function useTreeLayout(
  root: Ref<TreePerson | undefined>,
  branches: Record<number, TreeBranch>,
  expanded: Set<number>,
  layoutMode: Ref<TreeMode>,
) {
  const treeNodes = computed(() => {
    const nodes: TreeNode[] = [],
      seen = new Set<number>();
    function visit(p: TreePerson, level: number, parent?: TreeNode, group = ''): TreeNode {
      const node: TreeNode = {
        key: `${parent?.key || 'root'}-${p.id}`,
        person: p,
        x: 0,
        y: level * 140,
        height: layoutMode.value !== 'tree' ? 20 : branchHeight(p),
        parent,
        repeat: seen.has(p.id),
        group,
      };
      nodes.push(node);
      seen.add(p.id);
      const branch = branches[p.id];
      const children = !node.repeat && expanded.has(p.id) ? branch?.children || [] : [];
      const partners = branch?.spouses || [];
      const ordered = [...children].sort((a, b) => groupIndex(a) - groupIndex(b));
      function groupIndex(child: TreePerson) {
        const i = partners.findIndex((s) => child.other_parent_ids?.includes(s.id));
        return i < 0 ? partners.length : i;
      }
      ordered.map((child) =>
        visit(
          child,
          level + 1,
          node,
          partners.length > 1
            ? partners.find((s) => child.other_parent_ids?.includes(s.id))?.name ||
                t('另一位家长未定')
            : '',
        ),
      );
      return node;
    }
    if (root.value) visit(root.value, 0);
    return nodes;
  });
  const layout = computed(() => {
    const byKey = new Map<string, TreeNode>();
    const nodes = treeNodes.value.map((original) => {
      const node: TreeNode = {
        ...original,
        parent: original.parent ? byKey.get(original.parent.key) : undefined,
      };
      byKey.set(node.key, node);
      return node;
    });
    const compact = (layoutMode.value === 'radial' ? radialTreeLayout : compactTreeLayout)(
      nodes.map((n) => ({
        key: n.key,
        parent: n.parent,
        width: layoutMode.value !== 'tree' ? 20 : 100,
        height: n.height,
      })),
      layoutMode.value !== 'tree' ? 8 : 16,
      layoutMode.value === 'dots' ? 32 : undefined,
      24,
      layoutMode.value === 'dots',
    );
    for (const node of nodes) {
      const point = compact.positions.get(node.key)!;
      node.x = point.x;
      node.y = point.y;
    }
    const { width, height } = compact;
    return { nodes, width, height, paths: compact.paths };
  });
  function spousesFor(person: TreePerson) {
    return branches[person.id]?.spouses || person.spouses || [];
  }
  function branchHeight(person: TreePerson) {
    const nameRows =
      Array.from(person.name).reduce(
        (width, char) => width + (char.codePointAt(0)! > 255 ? 1 : 0.55),
        0,
      ) > 6
        ? 2
        : 1;
    return 23 + nameRows * 16 + 7 + (spousesFor(person).length ? 19 : 0);
  }
  const displayCount = computed(
    () =>
      new Set(
        treeNodes.value.flatMap((n) => [n.person.id, ...spousesFor(n.person).map((s) => s.id)]),
      ).size,
  );
  return { treeNodes, layout, displayCount, spousesFor };
}
