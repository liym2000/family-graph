import type { LayoutItem } from './compactTreeLayout';
import { compactRadialBranches, type RadialEdge } from './compactRadialBranches';

type Point = { x: number; y: number };
type Placement = { angle: number; radius: number; size: number; start: number; end: number };
/** Give sibling groups separate sectors; pack their subtrees into radial rows. */
export function radialTreeLayout(items: LayoutItem[], gap = 24, padding = 24) {
  const positions = new Map<string, Point>(),
    paths = new Map<string, string>();
  const root = items.find((n) => !n.parent);
  if (!root) return { positions, paths, width: padding * 2, height: padding * 2 };
  const children = new Map<string, LayoutItem[]>();
  for (const n of items)
    if (n.parent) {
      const list = children.get(n.parent.key) || [];
      list.push(n);
      children.set(n.parent.key, list);
    }
  const weights = new Map<string, number>();
  const depths = new Map<string, number>();
  const branchRows = new Map<string, number>();
  function groups(list: LayoutItem[], rows: number): LayoutItem[][] {
    const result: LayoutItem[][] = [];
    if (!list.length) return result;
    rows = Math.ceil(list.length / Math.ceil(list.length / rows));
    let group: LayoutItem[] = [];
    const flush = () => {
      if (group.length) {
        // Keep short subtrees inside longer ones. Each row reserves its whole
        // subtree, so descendants never overlap the next sibling's row.
        result.push([...group].sort((a, b) => depths.get(a.key)! - depths.get(b.key)!));
        group = [];
      }
    };
    for (const child of list) {
      group.push(child);
      if (group.length === rows) flush();
    }
    flush();
    return result;
  }
  function weigh(n: LayoutItem): number {
    const list = children.get(n.key) || [];
    list.forEach(weigh);
    depths.set(n.key, 1 + Math.max(0, ...list.map((c) => depths.get(c.key)!)));
    const sum = groups(list, branchRows.get(n.key) || 1).reduce(
      (sum, group) => sum + Math.max(...group.map((c) => weights.get(c.key)!)),
      0,
    );
    // Reserve angular space for two rows before considering denser packing. A long chain
    // needs one column, not more room than a short chain with the same leaves.
    const weight =
      list.length > 1 && list.every((c) => !children.has(c.key))
        ? Math.ceil(list.length / 2)
        : Math.max(1, sum);
    weights.set(n.key, weight);
    return weight;
  }
  const polar = new Map<string, Placement>();
  const routes = new Map<string, { rail: number; bus: number; entry: number; direct: boolean }>();
  function place(n: LayoutItem, start: number, end: number, inner: number, isRoot = false): number {
    const size = Math.hypot(n.width, n.height) / 2,
      angle = (start + end) / 2;
    const half = Math.min((end - start) / 2, Math.PI / 2);
    const radius = isRoot ? 0 : Math.max(inner + size, (size + gap / 4) / Math.sin(half));
    polar.set(n.key, { angle, radius, size, start, end });
    const list = children.get(n.key) || [];
    if (!list.length) return radius + size;
    const bus = radius + size + gap / 3;
    const childInner = radius + size + gap;
    const span = end - start;
    const terminal = list.every((c) => !children.has(c.key));
    // A shelf can contain several continuing branches in separate radial rows.
    let count = Math.ceil(list.length / (branchRows.get(n.key) || 1));
    if (terminal && list.length > 1) {
      const childSize = Math.max(...list.map((c) => Math.hypot(c.width, c.height) / 2));
      let bestOuter = Infinity;
      // Compare the space required by one to four rows inside THIS sector.
      // Include radial depth, so a roomy group does not fold unnecessarily.
      for (let rows = 1; rows <= Math.min(4, list.length); rows++) {
        const columns = Math.ceil(list.length / rows);
        // Small sibling groups should remain a fan, not a single radial string.
        if (list.length >= 3 && columns < 2) continue;
        const columnSpan = span / columns;
        const inset = rows > 1 ? Math.min(columnSpan * 0.02, 4 / Math.max(childInner, 1)) : 0;
        const firstRadius = Math.max(
          childInner + childSize,
          (childSize + gap / 4) / Math.sin(Math.min((columnSpan - 2 * inset) / 2, Math.PI / 2)),
        );
        const outer =
          firstRadius + childSize + (Math.ceil(list.length / columns) - 1) * (2 * childSize + gap);
        if (outer < bestOuter - 0.01) {
          bestOuter = outer;
          count = columns;
        }
      }
    }
    const active = groups(list, Math.ceil(list.length / count));
    const costs = active.map((c) => Math.max(...c.map((n) => weights.get(n.key)!)));
    // In an open sector reserve room for short branches in this generation.
    // Keep descendant proportions in narrow sectors to avoid repeatedly
    // squeezing a deep lineage as it grows outwards.
    const shortCount = list.filter((c) => !children.has(c.key)).length;
    if (span >= Math.PI / 2 && shortCount >= 8 && shortCount >= list.length / 2) {
      const floor = costs.reduce((a, b) => a + b, 0) / costs.length;
      for (let i = 0; i < costs.length; i++) costs[i] = Math.max(costs[i], floor);
    }
    const costTotal = costs.reduce((a, b) => a + b, 0);
    let cursor = start,
      outer = radius + size;
    active.forEach((group, index) => {
      const next = cursor + (span * costs[index]) / costTotal;
      // A narrow, empty corridor separates a shelf's incoming rail from all
      // routes and cards inside that shelf, including nested descendants.
      const inset =
        count < list.length ? Math.min((next - cursor) * 0.02, 4 / Math.max(childInner, 1)) : 0;
      const contentStart = cursor + inset,
        contentEnd = next - inset;
      const rail = group.length > 1 ? cursor + inset / 3 : (cursor + next) / 2;
      let shelf = childInner;
      for (const child of group) {
        const actualStart = list.length === 1 ? start : contentStart;
        const actualEnd = list.length === 1 ? end : contentEnd;
        const edgeOuter = place(child, actualStart, actualEnd, shelf);
        const childPosition = polar.get(child.key)!;
        const entry = childPosition.radius - childPosition.size - gap / 3;
        routes.set(child.key, { rail, bus, entry, direct: list.length === 1 });
        shelf = edgeOuter + gap;
        outer = Math.max(outer, edgeOuter);
      }
      cursor = next;
    });
    return outer;
  }
  function arrange(): number {
    weights.clear();
    polar.clear();
    routes.clear();
    weigh(root!);
    place(root!, -Math.PI / 2, Math.PI * 1.5, 0, true);
    let maxRadius = 0,
      totalRadius = 0,
      totalEdge = 0;
    for (const n of items) {
      const c = polar.get(n.key)!;
      maxRadius = Math.max(maxRadius, c.radius + c.size);
      totalRadius += c.radius;
      if (n.parent) {
        const p = polar.get(n.parent.key)!,
          route = routes.get(n.key)!;
        totalEdge +=
          c.radius -
          p.radius +
          (route.direct
            ? 0
            : route.bus * Math.abs(p.angle - route.rail) +
              route.entry * Math.abs(route.rail - c.angle));
      }
    }
    // Prefer occupied inner space and short routed edges over a perfect rim.
    return maxRadius + (3 * totalRadius) / items.length + totalEdge / items.length;
  }
  let score = arrange();
  // Try sibling subtree rows, measuring the entire layout rather than only
  // shrinking the immediate parent's ring at the expense of descendants.
  const candidates: LayoutItem[] = [];
  function collectCandidates(n: LayoutItem) {
    const list = children.get(n.key) || [];
    list.forEach(collectCandidates);
    // Terminal-only groups are optimized directly in place().
    if (list.length > 1 && list.some((c) => children.has(c.key)))
      candidates.push(n);
  }
  collectCandidates(root);
  for (let pass = 0; pass < 2; pass++)
    for (const n of pass === 0 ? candidates : [...candidates].reverse()) {
      let bestRows = branchRows.get(n.key) || 1;
      const currentRows = bestRows;
      for (let rows = 1; rows <= Math.min(4, children.get(n.key)!.length); rows++) {
        if (rows === currentRows) continue;
        branchRows.set(n.key, rows);
        const trial = arrange();
        if (trial < score * 0.995) {
          score = trial;
          bestRows = rows;
        }
      }
      if (bestRows === 1) branchRows.delete(n.key);
      else branchRows.set(n.key, bestRows);
    }
  arrange();
  for (const n of items) {
    const p = polar.get(n.key)!;
    positions.set(n.key, {
      x: p.radius * Math.cos(p.angle) - n.width / 2,
      y: p.radius * Math.sin(p.angle) - n.height / 2,
    });
  }
  const extent = Math.max(
    ...items.map((n) => {
      const p = positions.get(n.key)!;
      return Math.max(
        Math.abs(p.x + n.width / 2) + n.width / 2,
        Math.abs(p.y + n.height / 2) + n.height / 2,
      );
    }),
  );
  const center = extent + padding;
  for (const p of positions.values()) {
    p.x += center;
    p.y += center;
  }
  const point = (r: number, a: number): Point => ({
    x: center + r * Math.cos(a),
    y: center + r * Math.sin(a),
  });
  const arc = (r: number, from: number, to: number) => {
    if (Math.abs(from - to) < 1e-9) return '';
    const q = point(r, to),
      delta = to - from;
    return ` A ${r} ${r} 0 ${Math.abs(delta) > Math.PI ? 1 : 0} ${delta >= 0 ? 1 : 0} ${q.x} ${q.y}`;
  };
  const edges = new Map<string, RadialEdge>();
  const arcPoints = (r: number, from: number, to: number) => {
    const steps = Math.max(1, Math.ceil(Math.abs(to - from) * r / 8));
    return Array.from({ length: steps }, (_, i) => point(r, from + (to - from) * (i + 1) / steps));
  };
  for (const n of items)
    if (n.parent) {
      const parent = polar.get(n.parent.key)!,
        child = polar.get(n.key)!,
        route = routes.get(n.key)!;
      const a = point(parent.radius, parent.angle),
        b = point(child.radius, child.angle);
      if (route.direct) {
        paths.set(n.key, `M ${a.x} ${a.y} L ${b.x} ${b.y}`);
        edges.set(n.key, { path: paths.get(n.key)!, points: [a, b] });
        continue;
      }
      const u = point(route.bus, parent.angle),
        v = point(route.entry, route.rail);
      paths.set(
        n.key,
        `M ${a.x} ${a.y} L ${u.x} ${u.y}` +
          arc(route.bus, parent.angle, route.rail) +
          ` L ${v.x} ${v.y}` +
          arc(route.entry, route.rail, child.angle) +
          ` L ${b.x} ${b.y}`,
      );
      edges.set(n.key, { path: paths.get(n.key)!, points: [a, u,
        ...arcPoints(route.bus, parent.angle, route.rail), v,
        ...arcPoints(route.entry, route.rail, child.angle), b] });
    }
  compactRadialBranches(items, positions, edges, center, gap);
  for (const [key, edge] of edges) paths.set(key, edge.path);
  return { positions, paths, width: center * 2, height: center * 2 };
}
