import { describe, expect, it } from 'vitest';
import { compactRadialBranches, radialBranchEdge, type RadialEdge } from '../src/layout/compactRadialBranches';
import type { LayoutItem } from '../src/layout/compactTreeLayout';
import { radialTreeLayout } from '../src/layout/radialTreeLayout';

function fixture(blocked = false) {
  const items: LayoutItem[] = [
    { key: 'r', width: 20, height: 20 },
    { key: 'p', parent: { key: 'r' }, width: 20, height: 20 },
    { key: 'c', parent: { key: 'p' }, width: 20, height: 20 },
    { key: 'd', parent: { key: 'c' }, width: 20, height: 20 },
  ];
  const positions = new Map([['r', { x: 490, y: 490 }], ['p', { x: 590, y: 490 }],
    ['c', { x: 890, y: 490 }], ['d', { x: 940, y: 490 }]]);
  const edges = new Map<string, RadialEdge>();
  for (const n of items) if (n.parent) {
    const a = positions.get(n.parent.key)!, b = positions.get(n.key)!;
    edges.set(n.key, { path: `M ${a.x + 10} ${a.y + 10} L ${b.x + 10} ${b.y + 10}`,
      points: [{ x: a.x + 10, y: a.y + 10 }, { x: b.x + 10, y: b.y + 10 }] });
  }
  if (blocked) {
    items.push({ key: 'wall', width: 20, height: 200 });
    positions.set('wall', { x: 650, y: 400 });
  }
  compactRadialBranches(items, positions, edges, 500, 8);
  return { positions, edges };
}

describe('local radial compaction', () => {
  it('turns between different rays using an arc instead of a diagonal chord', () => {
    const a = { x: 620, y: 510 }, b = { x: 750, y: 600 };
    const edge = radialBranchEdge(a, b, 500);
    expect(edge.path).toContain(' A ');
    expect(edge.points[0]).toEqual(a);
    expect(edge.points.at(-1)).toEqual(b);
    const segments = [...edge.path.matchAll(/([MLA])\s+([^MLA]+)/g)];
    let previous = a;
    for (const [, command, arguments_] of segments) {
      const values = arguments_.trim().split(/\s+/).map(Number);
      const next = { x: values.at(-2)!, y: values.at(-1)! };
      if (command === 'L')
        expect((previous.x - 500) * (next.y - 500) - (previous.y - 500) * (next.x - 500)).toBeCloseTo(0);
      previous = next;
    }
  });
  it('preserves all parent endpoints and separates nodes in an irregular large family', () => {
    let seed = 73;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const items: LayoutItem[] = [{ key: 'r', width: 20, height: 20 }];
    let layer = ['r'];
    for (let generation = 0; generation < 9; generation++) {
      const next: string[] = [];
      for (const parent of layer) {
        const count = generation < 2 ? 3 : Math.floor(random() * 5);
        for (let j = 0; j < count && items.length < 1300; j++) {
          const key = `n${items.length}`;
          items.push({ key, parent: { key: parent }, width: 20, height: 20 });
          next.push(key);
        }
      }
      layer = next;
    }
    const result = radialTreeLayout(items, 8);
    for (let i = 0; i < items.length; i++) {
      const n = items[i], p = result.positions.get(n.key)!;
      if (n.parent) {
        const parent = result.positions.get(n.parent.key)!;
        const path = result.paths.get(n.key)!;
        const start = path.match(/^M ([\d.e+-]+) ([\d.e+-]+)/)!;
        const end = path.match(/L ([\d.e+-]+) ([\d.e+-]+)$/)!;
        expect(Number(start[1])).toBeCloseTo(parent.x + 10);
        expect(Number(start[2])).toBeCloseTo(parent.y + 10);
        expect(Number(end[1])).toBeCloseTo(p.x + 10);
        expect(Number(end[2])).toBeCloseTo(p.y + 10);
        let previous = { x: Number(start[1]), y: Number(start[2]) };
        const center = result.width / 2;
        for (const [, command, arguments_] of path.matchAll(/([MLA])\s+([^MLA]+)/g)) {
          const values = arguments_.trim().split(/\s+/).map(Number);
          const next = { x: values.at(-2)!, y: values.at(-1)! };
          if (command === 'L')
            expect((previous.x - center) * (next.y - center) - (previous.y - center) * (next.x - center)).toBeCloseTo(0, 5);
          previous = next;
        }
      }
      for (const other of items.slice(i + 1)) {
        const q = result.positions.get(other.key)!;
        if (!(p.x + 20 <= q.x || q.x + 20 <= p.x || p.y + 20 <= q.y || q.y + 20 <= p.y))
          throw Error(`Overlap: ${n.key}/${other.key}`);
      }
    }
  });
  it('moves a short branch inward with its descendants and preserves its actual parent', () => {
    const { positions, edges } = fixture();
    expect(positions.get('c')!.x).toBeLessThan(650);
    expect(positions.get('d')!.x - positions.get('c')!.x).toBeCloseTo(50);
    expect(edges.get('c')!.points[0]).toEqual({ x: positions.get('p')!.x + 10, y: 500 });
    expect(edges.get('d')!.points[0].x).toBeCloseTo(positions.get('c')!.x + 10);
    expect(positions.get('r')).toEqual({ x: 490, y: 490 });
  });
  it('retains placement when the replacement path would cross another person', () => {
    const { positions } = fixture(true);
    expect(positions.get('c')!.x).toBe(890);
    expect(positions.get('d')!.x).toBe(940);
  });
});
