import { describe, expect, it } from 'vitest';
import { compactTreeLayout, type LayoutItem } from '../src/layout/compactTreeLayout';
import { buildTreeSvg } from '../src/export/treeExport';

describe('compact family layout', () => {
  it('keeps expanded branches clear of a neighbouring folded sibling group', () => {
    const nodes: LayoutItem[] = [{key:'root',width:100,height:60}, {key:'branch',parent:{key:'root'},width:100,height:60}, {key:'grandchild',parent:{key:'branch'},width:100,height:60}];
    for(let i=0;i<9;i++) nodes.push({key:`s${i}`,parent:{key:'root'},width:100,height:60});
    const result=compactTreeLayout(nodes);
    const branch=result.positions.get('branch')!;
    const grandchild=result.positions.get('grandchild')!;
    for(const item of nodes.slice(3)) {
      const p=result.positions.get(item.key)!;
      expect(p.x - 8).toBeGreaterThan(branch.x+100);
      expect(p.x - 8).toBeGreaterThan(grandchild.x+100);
    }
    expect(new Set(nodes.slice(3).map(n=>result.positions.get(n.key)!.y)).size).toBe(2);
  });
  it('packs wide terminal families into nearby rows with clear side connections', () => {
    const nodes: LayoutItem[] = [{ key: 'root', width: 100, height: 60 }];
    for (let i = 0; i < 12; i++) nodes.push({ key: `c${i}`, parent: { key: 'root' }, width: 100, height: 60 + i % 3 * 17 });
    const result = compactTreeLayout(nodes);
    expect(result.width).toBeLessThan(12 * 116 * .65);
    expect(new Set(nodes.slice(1).map(n => result.positions.get(n.key)!.y)).size).toBe(2);
    for (const child of nodes.slice(1)) {
      const p = result.positions.get(child.key)!;
      expect(p.y + child.height).toBeLessThan(result.positions.get('root')!.y);
      expect(result.paths.get(child.key)).toContain(`H ${p.x - 8} V ${p.y + child.height / 2} H ${p.x}`);
      for (const other of nodes.slice(1)) if (child !== other) {
        const q = result.positions.get(other.key)!;
        expect(p.x + child.width <= q.x || q.x + other.width <= p.x || p.y + child.height <= q.y || q.y + other.height <= p.y).toBe(true);
        // The vertical family rail stays outside every card, including the
        // lower sibling when connecting the upper row.
        expect(p.x - 8 < q.x || p.x - 8 > q.x + other.width).toBe(true);
      }
    }
  });
  it('interleaves empty space without overlapping nodes or changing generation rows', () => {
    const nodes: LayoutItem[] = [{ key: 'root', width: 100, height: 60 }];
    for (let i = 0; i < 6; i++) {
      nodes.push({ key: `child${i}`, parent: { key: 'root' }, width: 100, height: 60 });
      if (i % 2 === 0) for (let j = 0; j < 4; j++) nodes.push({ key: `leaf${i}-${j}`, parent: { key: `child${i}` }, width: 100, height: 80 });
    }
    const layout = compactTreeLayout(nodes);
    expect(layout.width).toBeLessThan(15 * 116 + 32);
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = layout.positions.get(nodes[i].key)!;
      const b = layout.positions.get(nodes[j].key)!;
      if (a.y === b.y) expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(116);
    }
    expect(new Set(nodes.filter(n => n.key.startsWith('child')).map(n => layout.positions.get(n.key)!.y)).size).toBe(1);
  });
  it('exports complete escaped names and spouses without using viewport coordinates', () => {
    const node = { key:'r', x:99999, person:{id:1,name:'A & <B>',gender:'male' as const,generation:1},spouses:[{id:2,name:'Very long spouse name',gender:'female' as const,generation:1}] };
    const result=buildTreeSvg([node], 'Tree');
    expect(result.width).toBe(188);
    expect(result.svg).toContain('A &amp; &lt;B&gt;');
    expect(result.svg).not.toContain('<image');
  });
});
