import type { TreePerson } from '../api';
import { compactTreeLayout } from '../layout/compactTreeLayout';
import { radialTreeLayout } from '../layout/radialTreeLayout';

export interface ExportNode {
  key: string;
  person: TreePerson;
  x: number;
  parent?: { key: string };
  spouses: TreePerson[];
}
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
function lines(value: string, limit = 14) {
  const result: string[] = [];
  let line = '',
    width = 0;
  for (const c of value) {
    const size = c.codePointAt(0)! > 255 ? 2 : 1;
    if (width + size > limit) {
      result.push(line);
      line = '';
      width = 0;
    }
    line += c;
    width += size;
  }
  return [...result, line];
}
export function buildTreeSvg(nodes: ExportNode[], title: string, mode: 'tree' | 'dots' | 'radial' = 'tree') {
  const entries = nodes.map((n) => {
    const names = lines(n.person.name);
    const spouses = n.spouses.flatMap((s) => lines(s.name));
    const height = 38 + names.length * 20 + spouses.length * 17;
    return { ...n, names, spouses, height: mode === 'dots' ? 20 : height, width: mode === 'dots' ? 20 : 140, left: 0, top: 0 };
  });
  const compact = mode === 'dots' ? compactTreeLayout(entries, 8, 32, 24, true)
    : (mode === 'radial' ? radialTreeLayout : compactTreeLayout)(entries);
  entries.forEach((n) => {
    const p = compact.positions.get(n.key)!;
    n.left = p.x;
    n.top = p.y + 40;
  });
  const width = compact.width;
  const height = compact.height + 40;
  const paths = entries
    .filter((n) => n.parent)
    .map((n) => {
      return `<path transform="translate(0 40)" d="${compact.paths.get(n.key)}" fill="none" stroke="#90aaa5" stroke-width="1.6" ${n.person.origin === 'single_spouse' ? 'stroke-dasharray="5 4"' : ''}/>`;
    })
    .join('');
  const cards = entries
    .map((n) => {
      const fill =
        n.person.gender === 'male'
          ? '#deedf9'
          : n.person.gender === 'female'
            ? '#f8e1eb'
            : '#e9edf1';
      if (mode === 'dots') return `<circle cx="${n.left + 10}" cy="${n.top + 10}" r="8" fill="${fill}" stroke="#5c8b91" ${n.person.origin === 'single_spouse' ? 'stroke-dasharray="3 2"' : ''}><title>${escape(n.person.name)}${n.spouses.length ? ' / ' + escape(n.spouses.join(', ')) : ''}</title></circle>`;
      return `<g transform="translate(${n.left} ${n.top})"><rect width="140" height="${n.height}" rx="10" fill="${fill}" stroke="#91b8b0"/><text x="70" y="20" font-size="12" fill="#536678">${n.person.generation ?? '—'}</text>${n.names.map((line, i) => `<text x="70" y="${42 + i * 20}" font-size="16" font-weight="600">${escape(line)}</text>`).join('')}${n.spouses.map((line, i) => `<text x="70" y="${42 + n.names.length * 20 + i * 17}" font-size="13">${escape(line)}</text>`).join('')}</g>`;
    })
    .join('');
  const body = `<rect width="100%" height="100%" fill="white"/><g font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif" fill="#0f766e" text-anchor="middle"><text x="${width / 2}" y="30" font-size="20">${escape(title)}</text>${paths}${cards}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
  return { svg, body, width, height };
}
export function downloadTreeSvg(svg: string, name: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/[\\/:*?"<>|]/g, '_') + '.svg';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function printTree(
  win: Window,
  tree: ReturnType<typeof buildTreeSvg>,
  tiled: boolean,
  title: string,
) {
  const tileWidth = 1040,
    tileHeight = 1480;
  const columns = tiled ? Math.ceil(tree.width / tileWidth) : 1;
  const rows = tiled ? Math.ceil(tree.height / tileHeight) : 1;
  const ratio = Math.min(0.264583, 5000 / Math.max(tree.width, tree.height));
  const size = tiled ? 'A3 portrait' : `${tree.width * ratio}mm ${tree.height * ratio}mm`;
  const pages: string[] = [];
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < columns; col++) {
      const viewBox = tiled
        ? `${col * tileWidth} ${row * tileHeight} ${tileWidth} ${tileHeight}`
        : `0 0 ${tree.width} ${tree.height}`;
      pages.push(
        `<section><svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${tree.body}</svg></section>`,
      );
    }
  win.document.open();
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title><style>@page{size:${size};margin:0}*{box-sizing:border-box}body{margin:0}section{width:${tiled ? '297mm' : tree.width * ratio + 'mm'};height:${tiled ? '420mm' : tree.height * ratio + 'mm'};break-after:page}section:last-child{break-after:auto}svg{display:block;width:100%;height:100%}</style></head><body>${pages.join('')}</body></html>`,
  );
  win.document.close();
  void win.document.fonts.ready.then(() => {
    if (!win.closed) {
      win.focus();
      win.print();
    }
  });
}
