import type { LayoutItem } from './compactTreeLayout';

export type RadialPoint = { x: number; y: number };
export type RadialEdge = { path: string; points: RadialPoint[] };
type Box = { left: number; top: number; right: number; bottom: number };
type Obstacle = { key: string; box: Box; segment?: [RadialPoint, RadialPoint] };

const bounds = (a: RadialPoint, b: RadialPoint, margin = 0): Box => ({
  left: Math.min(a.x, b.x) - margin, top: Math.min(a.y, b.y) - margin,
  right: Math.max(a.x, b.x) + margin, bottom: Math.max(a.y, b.y) + margin,
});
const overlaps = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
function intersects(a: RadialPoint, b: RadialPoint, c: RadialPoint, d: RadialPoint) {
  const cross = (p: RadialPoint, q: RadialPoint, r: RadialPoint) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0 &&
    overlaps(bounds(a, b, 0.01), bounds(c, d, 0.01));
}
function throughBox(a: RadialPoint, b: RadialPoint, box: Box) {
  const inside = (p: RadialPoint) => p.x > box.left && p.x < box.right && p.y > box.top && p.y < box.bottom;
  const corners = [{ x: box.left, y: box.top }, { x: box.right, y: box.top },
    { x: box.right, y: box.bottom }, { x: box.left, y: box.bottom }];
  return inside(a) || inside(b) || corners.some((p, i) => intersects(a, b, p, corners[(i + 1) % 4]));
}

/** Occupancy includes edges, not just cards: a visually empty corridor may carry another lineage. */
class Occupancy {
  private cells = new Map<string, Set<Obstacle>>();
  private entries = new Map<string, Obstacle[]>();
  private keys(box: Box) {
    const keys: string[] = [];
    for (let x = Math.floor(box.left / 64); x <= Math.floor(box.right / 64); x++)
      for (let y = Math.floor(box.top / 64); y <= Math.floor(box.bottom / 64); y++) keys.push(`${x}:${y}`);
    return keys;
  }
  add(item: Obstacle) {
    const entries = this.entries.get(item.key) || [];
    entries.push(item);
    this.entries.set(item.key, entries);
    for (const key of this.keys(item.box)) {
      const cell = this.cells.get(key) || new Set<Obstacle>();
      cell.add(item);
      this.cells.set(key, cell);
    }
  }
  remove(key: string) {
    for (const item of this.entries.get(key) || [])
      for (const cell of this.keys(item.box)) this.cells.get(cell)?.delete(item);
    this.entries.delete(key);
  }
  near(box: Box) {
    const result = new Set<Obstacle>();
    for (const key of this.keys(box))
      for (const item of this.cells.get(key) || []) if (overlaps(box, item.box)) result.add(item);
    return result;
  }
}

/** Every straight portion follows a ray from the unchanged panorama centre. */
export function radialBranchEdge(a: RadialPoint, b: RadialPoint, center: number): RadialEdge {
  const from = Math.atan2(a.y - center, a.x - center);
  const to = Math.atan2(b.y - center, b.x - center);
  const radiusA = Math.hypot(a.x - center, a.y - center);
  const radiusB = Math.hypot(b.x - center, b.y - center);
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  if (radiusA < 1e-6 || Math.abs(delta) < 1e-9)
    return { path: `M ${a.x} ${a.y} L ${b.x} ${b.y}`, points: [a, b] };
  const radius = (radiusA + radiusB) / 2;
  const point = (angle: number) => ({ x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) });
  const u = point(from), v = point(from + delta);
  const steps = Math.max(1, Math.ceil(Math.abs(delta) * radius / 8));
  return {
    path: `M ${a.x} ${a.y} L ${u.x} ${u.y} A ${radius} ${radius} 0 0 ${delta >= 0 ? 1 : 0} ${v.x} ${v.y} L ${b.x} ${b.y}`,
    points: [a, u, ...Array.from({ length: steps }, (_, i) => point(from + delta * (i + 1) / steps)), b],
  };
}

/** Move short subtrees into nearby free corridors without changing any parent identity. */
export function compactRadialBranches(
  items: LayoutItem[], positions: Map<string, RadialPoint>, edges: Map<string, RadialEdge>,
  center: number, gap: number,
) {
  const byKey = new Map(items.map(n => [n.key, n]));
  const children = new Map<string, string[]>();
  for (const n of items) if (n.parent) {
    const list = children.get(n.parent.key) || [];
    list.push(n.key);
    children.set(n.parent.key, list);
  }
  const point = (key: string): RadialPoint => {
    const n = byKey.get(key)!, p = positions.get(key)!;
    return { x: p.x + n.width / 2, y: p.y + n.height / 2 };
  };
  const nodeBox = (key: string, dx = 0, dy = 0): Box => {
    const n = byKey.get(key)!, p = positions.get(key)!, margin = Math.max(1, gap / 4);
    return { left: p.x + dx - margin, top: p.y + dy - margin,
      right: p.x + dx + n.width + margin, bottom: p.y + dy + n.height + margin };
  };
  const occupancy = new Occupancy();
  const add = (key: string) => {
    occupancy.add({ key, box: nodeBox(key) });
    const points = edges.get(key)?.points || [];
    for (let i = 1; i < points.length; i++)
      occupancy.add({ key, box: bounds(points[i - 1], points[i], 1), segment: [points[i - 1], points[i]] });
  };
  items.forEach(n => add(n.key));
  // Large branching subtrees keep their sector allocation. Compact small local
  // clusters only, bounding both search cost and disruption of branch order.
  for (const n of [...items].reverse()) {
    if (!n.parent) continue;
    const a = point(n.parent.key), b = point(n.key), parent = byKey.get(n.parent.key)!;
    if (!parent.parent && (children.get(parent.key) || []).every(key => !children.has(key))) continue;
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const spacing = (Math.hypot(n.width, n.height) + Math.hypot(parent.width, parent.height)) / 2 + gap;
    if (distance < spacing * 2.5) continue;
    const cluster = [n.key];
    for (let i = 0; i < cluster.length && cluster.length <= 24; i++) cluster.push(...(children.get(cluster[i]) || []));
    if (cluster.length > 24) continue;
    const own = new Set(cluster);
    const radial = Math.hypot(b.x - center, b.y - center);
    const ux = (b.x - center) / radial, uy = (b.y - center) / radial;
    const parentRadius = Math.hypot(a.x - center, a.y - center);
    const room = radial - parentRadius - spacing;
    if (room < spacing) continue;
    const validSegments = (points: RadialPoint[], startKey: string, endKey: string) => {
      for (let i = 1; i < points.length; i++) {
        const p = points[i - 1], q = points[i];
        for (const obstacle of occupancy.near(bounds(p, q, 1))) {
          if (own.has(obstacle.key)) continue;
          if (!obstacle.segment) {
            if (obstacle.key !== startKey && obstacle.key !== endKey && throughBox(p, q, obstacle.box)) return false;
          } else if (intersects(p, q, ...obstacle.segment)) {
            // Routes incident on the same parent may meet inside its card only.
            const parentBox = nodeBox(startKey);
            if (!throughBox(p, q, parentBox) || !throughBox(...obstacle.segment, parentBox)) return false;
          }
        }
      }
      return true;
    };
    for (let step = 12; step >= 2; step--) {
      const shift = room * step / 12, dx = -ux * shift, dy = -uy * shift;
      let valid = true;
      for (const key of cluster) {
        const box = nodeBox(key, dx, dy), childPoint = point(key), node = byKey.get(key)!;
        const parentPoint = point(node.parent!.key);
        const parentShift = own.has(node.parent!.key) ? { x: dx, y: dy } : { x: 0, y: 0 };
        if (Math.hypot(childPoint.x + dx - center, childPoint.y + dy - center) >
          Math.hypot(childPoint.x - center, childPoint.y - center)) { valid = false; break; }
        if (Math.hypot(childPoint.x + dx - center, childPoint.y + dy - center) <=
          Math.hypot(parentPoint.x + parentShift.x - center, parentPoint.y + parentShift.y - center)) { valid = false; break; }
        for (const obstacle of occupancy.near(box)) {
          if (own.has(obstacle.key)) continue;
          if (!obstacle.segment || throughBox(...obstacle.segment, box)) { valid = false; break; }
        }
        if (!valid) break;
      }
      if (!valid) continue;
      const movedPoint = (key: string) => {
        const p = point(key);
        return own.has(key) ? { x: p.x + dx, y: p.y + dy } : p;
      };
      const replacement = new Map<string, RadialEdge>();
      for (const key of cluster) {
        const parentKey = byKey.get(key)!.parent!.key;
        const edge = radialBranchEdge(movedPoint(parentKey), movedPoint(key), center);
        if (!validSegments(edge.points, parentKey, key)) { valid = false; break; }
        for (let i = 1; i < edge.points.length && valid; i++) {
          const p = edge.points[i - 1], q = edge.points[i];
          for (const other of cluster) {
            if (other !== key && other !== parentKey && throughBox(p, q, nodeBox(other, dx, dy))) {
              valid = false; break;
            }
          }
          for (const [other, earlier] of replacement) {
            const otherParent = byKey.get(other)!.parent!.key;
            const shared = [parentKey, key].filter(k => k === other || k === otherParent);
            for (let j = 1; j < earlier.points.length; j++) {
              const s = earlier.points[j - 1], t = earlier.points[j];
              if (intersects(p, q, s, t) && !shared.some(k => {
                const box = nodeBox(k, own.has(k) ? dx : 0, own.has(k) ? dy : 0);
                return throughBox(p, q, box) && throughBox(s, t, box);
              })) { valid = false; break; }
            }
          }
        }
        if (!valid) break;
        replacement.set(key, edge);
      }
      if (!valid) continue;
      cluster.forEach(key => occupancy.remove(key));
      for (const key of cluster) {
        const p = positions.get(key)!;
        p.x += dx; p.y += dy;
        edges.set(key, replacement.get(key)!);
      }
      cluster.forEach(add);
      break;
    }
  }
}
