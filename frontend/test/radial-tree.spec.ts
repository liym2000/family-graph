import { describe, expect, it } from 'vitest';
import { radialTreeLayout } from '../src/layout/radialTreeLayout';
import { type LayoutItem } from '../src/layout/compactTreeLayout';
import { buildTreeSvg } from '../src/export/treeExport';

describe('radial panorama', () => {
  it('gives small terminal sibling groups at least two columns in narrow sectors', () => {
    const items: LayoutItem[] = [{ key: 'r', width: 20, height: 20 }];
    for (let i = 0; i < 30; i++) {
      const key = `parent${i}`;
      items.push({ key, parent: { key: 'r' }, width: 20, height: 20 });
      for (let j = 0; j < 4; j++)
        items.push({ key: `${key}-${j}`, parent: { key }, width: 20, height: 20 });
    }
    const result = radialTreeLayout(items, 8), center = result.width / 2;
    for (let i = 0; i < 30; i++) {
      const angles = Array.from({ length: 4 }, (_, j) => {
        const p = result.positions.get(`parent${i}-${j}`)!;
        return Math.atan2(p.y + 10 - center, p.x + 10 - center).toFixed(5);
      });
      expect(new Set(angles).size).toBeGreaterThanOrEqual(2);
    }
  });
  it('uses inner space for a wide multigeneration family while retaining real edge endpoints', () => {
    const items: LayoutItem[] = [{ key: 'r', width: 20, height: 20 }];
    for (let i = 0; i < 8; i++) {
      const key = `b${i}`;
      items.push({ key, parent: { key: 'r' }, width: 20, height: 20 });
      for (let j = 0; j < 12; j++) {
        const parent = `${key}p${j}`;
        items.push({ key: parent, parent: { key }, width: 20, height: 20 });
        for (let k = 0; k < 8; k++)
          items.push({ key: `${parent}c${k}`, parent: { key: parent }, width: 20, height: 20 });
      }
    }
    const result = radialTreeLayout(items, 8);
    expect(result.width).toBeLessThan(1900);
    expect(result.paths.size).toBe(items.length - 1);
    for (let i = 0; i < items.length; i++) {
      const node = items[i], p = result.positions.get(node.key)!;
      if (node.parent) {
        const parent = result.positions.get(node.parent.key)!;
        const path = result.paths.get(node.key)!;
        const start = path.match(/^M ([\d.e+-]+) ([\d.e+-]+)/)!;
        const end = path.match(/L ([\d.e+-]+) ([\d.e+-]+)$/)!;
        expect(Number(start[1])).toBeCloseTo(parent.x + 10);
        expect(Number(start[2])).toBeCloseTo(parent.y + 10);
        expect(Number(end[1])).toBeCloseTo(p.x + 10);
        expect(Number(end[2])).toBeCloseTo(p.y + 10);
      }
      for (const other of items.slice(i + 1)) {
        const q = result.positions.get(other.key)!;
        if (!(p.x + 20 <= q.x || q.x + 20 <= p.x || p.y + 20 <= q.y || q.y + 20 <= p.y))
          throw Error(`Overlap: ${node.key}/${other.key}`);
      }
    }
  });
  it('keeps short second-generation branches inside a neighbouring thirteen-generation lineage', () => {
    const items:LayoutItem[]=[{key:'r',width:20,height:20}];
    for(let i=0;i<42;i++)items.push({key:`child${i}`,parent:{key:'r'},width:20,height:20});
    for(const branch of [0,4,9]){
      let parent=`child${branch}`;
      for(let generation=3;generation<=13;generation++){
        const key=`branch${branch}-generation${generation}`;
        items.push({key,parent:{key:parent},width:20,height:20});
        if(generation<7)for(let j=0;j<3;j++)items.push({key:`${key}-sibling${j}`,parent:{key:parent},width:20,height:20});
        parent=key;
      }
    }
    const result=radialTreeLayout(items,8),center=result.width/2;
    const radius=(key:string)=>{const p=result.positions.get(key)!;return Math.hypot(p.x+10-center,p.y+10-center);};
    const second=items.filter(n=>n.parent?.key==='r').map(n=>radius(n.key));
    expect(Math.max(...second)).toBeLessThan(240);
    for(const branch of [0,4,9])expect(radius(`branch${branch}-generation13`)).toBeGreaterThan(Math.max(...second));
    for(let i=0;i<items.length;i++){
      const a=items[i],p=result.positions.get(a.key)!;
      if(a.parent)expect(radius(a.key)).toBeGreaterThan(radius(a.parent.key));
      for(const b of items.slice(i+1)){
        const q=result.positions.get(b.key)!;
        expect(p.x+20<=q.x || q.x+20<=p.x || p.y+20<=q.y || q.y+20<=p.y).toBe(true);
      }
    }
  });
  it('packs crowded continuing siblings into at most four subtree rows without overlap', () => {
    const items:LayoutItem[]=[{key:'r',width:20,height:20}];
    for(let i=0;i<40;i++){
      items.push({key:`p${i}`,parent:{key:'r'},width:20,height:20});
      for(let j=0;j<3;j++)items.push({key:`c${i}-${j}`,parent:{key:`p${i}`},width:20,height:20});
    }
    const result=radialTreeLayout(items,8),center=result.width/2;
    const radius=(key:string)=>{const p=result.positions.get(key)!;return Math.hypot(p.x+10-center,p.y+10-center);};
    const parents=items.filter(n=>n.key.startsWith('p'));
    const angles=parents.map(n=>{const p=result.positions.get(n.key)!;return Math.atan2(p.y+10-center,p.x+10-center).toFixed(6);});
    expect(new Set(angles).size).toBeLessThan(parents.length);
    for (const angle of new Set(angles)) {
      const column = parents.filter((_, i) => angles[i] === angle);
      expect(column.length).toBeLessThanOrEqual(4);
      expect(new Set(column.map(n => radius(n.key).toFixed(3))).size).toBe(column.length);
    }
    expect(result.width).toBeLessThan(900);
    for(let i=0;i<items.length;i++){
      const a=items[i],p=result.positions.get(a.key)!;
      if(a.parent)expect(radius(a.key)).toBeGreaterThan(radius(a.parent.key));
      for(const b of items.slice(i+1)){
        const q=result.positions.get(b.key)!;
        expect(p.x+20<=q.x || q.x+20<=p.x || p.y+20<=q.y || q.y+20<=p.y).toBe(true);
      }
    }
    expect(result.paths.size).toBe(items.length-1);
    expect(radialTreeLayout(items,8)).toEqual(result);
  });
  it.each([[4,1],[24,2],[60,3],[120,4],[121,4]])('packs %i siblings into %i rows according to available space', (count,rows) => {
    const nodes:LayoutItem[]=[{key:'r',width:20,height:20}];
    for(let i=0;i<count;i++)nodes.push({key:`leaf${i}`,parent:{key:'r'},width:20,height:20});
    const result=radialTreeLayout(nodes,8),center=result.width/2;
    const radii=nodes.slice(1).map(n=>{const p=result.positions.get(n.key)!;return Math.hypot(p.x+10-center,p.y+10-center);});
    expect(new Set(radii.map(r=>r.toFixed(3))).size).toBe(rows);
    expect(result.paths.size).toBe(count);
    expect(result.width).toBeLessThan(650);
  });
  it('keeps the trunk near the centre when a later generation is crowded', () => {
    const nodes:LayoutItem[]=[{key:'r',width:20,height:20}];
    for(let i=1;i<=4;i++)nodes.push({key:`p${i}`,parent:{key:i===1?'r':`p${i-1}`},width:20,height:20});
    for(let i=0;i<120;i++)nodes.push({key:`leaf${i}`,parent:{key:'p4'},width:20,height:20});
    const result=radialTreeLayout(nodes,8),center=result.width/2;
    const radius=(key:string)=>{const p=result.positions.get(key)!;return Math.hypot(p.x+10-center,p.y+10-center);};
    expect(radius('p1')).toBeLessThan(60);
    expect(radius('p4')).toBeLessThan(180);
    expect(result.width).toBeLessThan(800);
  });
  it('lets an only-child trunk spread its later branches around the entire centre', () => {
    const nodes:LayoutItem[]=[{key:'r',width:20,height:20},{key:'only',parent:{key:'r'},width:20,height:20}];
    for(let i=0;i<24;i++)nodes.push({key:`leaf${i}`,parent:{key:'only'},width:20,height:20});
    const result=radialTreeLayout(nodes),center=result.width/2;
    const quadrants=new Set(nodes.slice(2).map(n=>{const p=result.positions.get(n.key)!;return `${p.x+10>center}:${p.y+10>center}`;}));
    expect(quadrants.size).toBe(4);
    expect(result.width).toBeLessThan(1000);
    expect(result.paths.size).toBe(25);
  });
  it('keeps small families close together instead of stretching children to an outer ring', () => {
    const nodes: LayoutItem[] = [{key:'r',width:100,height:60}];
    for(let i=0;i<8;i++){
      nodes.push({key:`p${i}`,parent:{key:'r'},width:100,height:60});
      for(let j=0;j<3;j++)nodes.push({key:`c${i}-${j}`,parent:{key:`p${i}`},width:100,height:60});
    }
    const result=radialTreeLayout(nodes);
    for(const node of nodes.filter(n=>n.key.startsWith('c'))){
      const a=result.positions.get(node.key)!,b=result.positions.get(node.parent!.key)!;
      expect(Math.hypot(a.x-b.x,a.y-b.y)).toBeLessThan(450);
    }
    expect(result.paths.size).toBe(nodes.length-1);
  });
  it('centres the root and keeps 701 variable-sized cards apart in elastic bands', () => {
    const items: LayoutItem[] = [{ key: 'r', width: 140, height: 180 }];
    for (let i = 0; i < 20; i++) {
      items.push({ key: `c${i}`, parent: { key: 'r' }, width: 140, height: 60 });
      for (let j = 0; j < 34; j++) items.push({ key: `g${i}-${j}`, parent: { key: `c${i}` }, width: 140, height: 60 + j % 4 * 20 });
    }
    const result = radialTreeLayout(items);
    expect(result.width).toBe(result.height);
    expect(result.positions.get('r')!.x + 70).toBe(result.width / 2);
    expect(result.positions.get('r')!.y + 90).toBe(result.height / 2);
    expect(result.paths.size).toBe(700);
    const radii = new Map<string, number>();
    for (const n of items) {
      const p = result.positions.get(n.key)!;
      radii.set(n.key, Math.hypot(p.x + n.width / 2 - result.width / 2, p.y + n.height / 2 - result.height / 2));
    }
    for (let i = 0; i < items.length; i++) {
      const a = items[i], p = result.positions.get(a.key)!;
      if (a.parent) expect(radii.get(a.key)!).toBeGreaterThan(radii.get(a.parent.key)!);
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j], q = result.positions.get(b.key)!;
        if (!(p.x + a.width <= q.x || q.x + b.width <= p.x || p.y + a.height <= q.y || q.y + b.height <= p.y)) throw Error(`Overlap: ${a.key}/${b.key}`);
      }
    }
    expect(Math.abs(radii.get('g0-0')! - radii.get('g0-3')!)).toBeGreaterThan(1);
  });
  it('does not push a sparse cousin out to match a crowded family', () => {
    const items: LayoutItem[] = [{key:'r',width:100,height:60}];
    for (const key of ['dense','sparse']) items.push({key,parent:{key:'r'},width:100,height:60});
    for(let i=0;i<30;i++) items.push({key:`d${i}`,parent:{key:'dense'},width:100,height:60});
    items.push({key:'s',parent:{key:'sparse'},width:100,height:60});
    const result=radialTreeLayout(items);
    const radius=(key:string)=>{const p=result.positions.get(key)!;return Math.hypot(p.x+50-result.width/2,p.y+30-result.height/2);};
    // The sparse child's edge stays at normal spacing even when its cousins
    // require extra rows. It need not share the dense group's outer radius.
    expect(radius('s')-radius('sparse')).toBeCloseTo(Math.hypot(100,60)+24);
    expect(radius('s')).toBeGreaterThan(radius('sparse'));
  });
  it('gives a larger descendant branch more angular space and exports vector paths', () => {
    const items: LayoutItem[] = [{key:'r',width:100,height:60}, {key:'large',parent:{key:'r'},width:100,height:60}, {key:'small',parent:{key:'r'},width:100,height:60}];
    for(let i=0;i<10;i++) items.push({key:`g${i}`,parent:{key:'large'},width:100,height:60});
    const result=radialTreeLayout(items);
    const big=result.positions.get('large')!, small=result.positions.get('small')!;
    expect(big.y).not.toBeCloseTo(small.y, 1);
    const svg=buildTreeSvg(items.map((n,i)=>({...n,x:0,person:{id:i,name:n.key,gender:'male',generation:1},spouses:[]})), 'Radial', 'radial');
    expect(svg.svg).toContain('<path ');
    expect(svg.svg).not.toMatch(/NaN|Infinity|<image/);
    expect(svg.height).toBe(svg.width+40);
  });
  it('handles an empty tree and a single root', () => {
    expect(radialTreeLayout([]).paths.size).toBe(0);
    const result=radialTreeLayout([{key:'r',width:100,height:60}]);
    expect(result.width).toBe(148);
    expect(result.paths.size).toBe(0);
  });
});
