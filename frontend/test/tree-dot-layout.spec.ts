import { expect, it } from 'vitest';
import { compactTreeLayout, type LayoutItem } from '../src/layout/compactTreeLayout';

it('aligns a dominant lineage while preserving sibling order, spacing and upward descendants', () => {
  const items: LayoutItem[] = [{ key: 'root', width: 20, height: 20 }];
  for (let i = 0; i < 4; i++) items.push({ key: `child${i}`, parent: { key: 'root' }, width: 20, height: 20 });
  for (let i = 0; i < 12; i++) items.push({ key: `next${i}`, parent: { key: i ? `next${i - 1}` : 'child0' }, width: 20, height: 20 });
  const original = compactTreeLayout(items, 8, 32);
  const dots = compactTreeLayout(items, 8, 32, 24, true);
  const travel = (result: typeof dots) => Math.abs(result.positions.get('root')!.x - result.positions.get('child0')!.x);
  expect(travel(dots)).toBe(0);
  expect(travel(original)).toBeGreaterThan(20);
  for (let i = 1; i < 4; i++)
    expect(dots.positions.get(`child${i}`)!.x).toBeGreaterThan(dots.positions.get(`child${i - 1}`)!.x);
  for (let i = 0; i < items.length; i++) {
    const n = items[i], p = dots.positions.get(n.key)!;
    if (n.parent) expect(p.y + 20).toBeLessThan(dots.positions.get(n.parent.key)!.y);
    for (const other of items.slice(i + 1)) {
      const q = dots.positions.get(other.key)!;
      expect(p.x + 20 <= q.x || q.x + 20 <= p.x || p.y + 20 <= q.y || q.y + 20 <= p.y).toBe(true);
    }
  }
  expect(compactTreeLayout(items, 8, 32, 24, false)).toEqual(original);
});
