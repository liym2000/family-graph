export interface LayoutItem {
  key: string;
  parent?: { key: string };
  width: number;
  height: number;
}

/** Merge the occupied contours of each subtree, retaining sibling order. */
export function compactTreeLayout(items: LayoutItem[], gap = 16, levelGap = 72, padding = 24, alignMainBranch = false) {
  const children = new Map<string, LayoutItem[]>();
  const folded = new Set<string>();
  for (const item of items)
    if (item.parent) {
      const siblings = children.get(item.parent.key) || [];
      siblings.push(item);
      children.set(item.parent.key, siblings);
    }
  type Branch = {
    positions: Map<string, { x: number; depth: number }>;
    left: number[];
    right: number[];
  };
  function place(item: LayoutItem): Branch {
    const positions = new Map<string, { x: number; depth: number }>();
    const siblings = children.get(item.key) || [];
    // Fold wide terminal families into two nearby rows. Reserve the whole
    // envelope, including the side rails, so neighbouring branches stay out.
    if (siblings.length >= 5 && siblings.every((child) => !children.has(child.key))) {
      const cell = Math.max(...siblings.map((child) => child.width)) + gap + 12;
      const columns = Math.ceil(siblings.length / 2);
      const start = (-(columns - 1) * cell) / 2;
      siblings.forEach((child, index) => {
        positions.set(child.key, {
          x: start + Math.floor(index / 2) * cell,
          depth: (index % 2) + 1,
        });
        folded.add(child.key);
      });
      positions.set(item.key, { x: 0, depth: 0 });
      const lo = start - cell / 2,
        hi = -start + cell / 2;
      return { positions, left: [-item.width / 2, lo, lo], right: [item.width / 2, hi, hi] };
    }
    const left: number[] = [],
      right: number[] = [],
      centers: number[] = [],
      weights: number[] = [];
    for (let index = 0; index < siblings.length; index++) {
      const child = siblings[index];
      let last = index;
      while (last < siblings.length && !children.has(siblings[last].key)) last++;
      let branch: Branch;
      if (last - index >= 5) {
        const leaves = siblings.slice(index, last);
        const cell = Math.max(...leaves.map((n) => n.width)) + gap + 12;
        const start = (-(Math.ceil(leaves.length / 2) - 1) * cell) / 2;
        branch = {
          positions: new Map(),
          left: [start - cell / 2, start - cell / 2],
          right: [-start + cell / 2, -start + cell / 2],
        };
        leaves.forEach((leaf, i) => {
          branch.positions.set(leaf.key, { x: start + Math.floor(i / 2) * cell, depth: i % 2 });
          folded.add(leaf.key);
        });
        index = last - 1;
      } else branch = place(child);
      let shift = 0;
      if (centers.length)
        for (let d = 0; d < branch.left.length; d++) {
          if (right[d] !== undefined) shift = Math.max(shift, right[d] + gap - branch.left[d]);
        }
      centers.push(shift);
      weights.push(branch.positions.size);
      for (const [key, point] of branch.positions)
        positions.set(key, { x: point.x + shift, depth: point.depth + 1 });
      for (let d = 0; d < branch.left.length; d++) {
        left[d] = Math.min(left[d] ?? Infinity, branch.left[d] + shift);
        right[d] = Math.max(right[d] ?? -Infinity, branch.right[d] + shift);
      }
    }
    let center = centers.length ? (centers[0] + centers[centers.length - 1]) / 2 : 0;
    if (alignMainBranch && centers.length) {
      // A weighted median minimizes horizontal travel across all descendant
      // paths and aligns the parent with a dominant continuing branch.
      const half = weights.reduce((sum, weight) => sum + weight, 0) / 2;
      let total = 0;
      for (let i = 0; i < centers.length; i++) {
        total += weights[i];
        if (total >= half) {
          center = total === half && i + 1 < centers.length ? (centers[i] + centers[i + 1]) / 2 : centers[i];
          break;
        }
      }
    }
    for (const point of positions.values()) point.x -= center;
    positions.set(item.key, { x: 0, depth: 0 });
    return {
      positions,
      left: [-item.width / 2, ...left.map((x) => x - center)],
      right: [item.width / 2, ...right.map((x) => x - center)],
    };
  }
  const root = items.find((item) => !item.parent);
  if (!root)
    return {
      positions: new Map<string, { x: number; y: number }>(),
      paths: new Map<string, string>(),
      width: padding * 2,
      height: padding * 2,
    };
  const branch = place(root);
  const min = Math.min(...branch.left),
    max = Math.max(...branch.right);
  const heights: number[] = [];
  for (const item of items) {
    const depth = branch.positions.get(item.key)!.depth;
    heights[depth] = Math.max(heights[depth] || 0, item.height);
  }
  let bottom = padding;
  const tops: number[] = [];
  for (let d = heights.length - 1; d >= 0; d--) {
    tops[d] = bottom;
    bottom += heights[d] + (d ? levelGap : 0);
  }
  const positions = new Map(
    items.map((item) => {
      const p = branch.positions.get(item.key)!;
      return [item.key, { x: p.x - item.width / 2 - min + padding, y: tops[p.depth] }] as const;
    }),
  );
  const paths = new Map<string, string>();
  const byKey = new Map(items.map((item) => [item.key, item]));
  const foldedParents = new Set(
    items.filter((item) => folded.has(item.key)).map((item) => item.parent!.key),
  );
  for (const item of items)
    if (item.parent) {
      const p = positions.get(item.parent.key)!;
      const n = positions.get(item.key)!;
      const x = p.x + byKey.get(item.parent.key)!.width / 2;
      const end = n.y + item.height;
      const mid = (p.y + end) / 2;
      paths.set(
        item.key,
        folded.has(item.key)
          ? `M ${x} ${p.y} V ${p.y - levelGap / 2} H ${n.x - 8} V ${n.y + item.height / 2} H ${n.x}`
          : foldedParents.has(item.parent.key)
            ? `M ${x} ${p.y} V ${p.y - levelGap / 2} H ${n.x + item.width / 2} V ${end}`
            : `M ${x} ${p.y} C ${x} ${mid}, ${n.x + item.width / 2} ${mid}, ${n.x + item.width / 2} ${end}`,
      );
    }
  return { positions, paths, width: max - min + padding * 2, height: bottom + padding };
}
