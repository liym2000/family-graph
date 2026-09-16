import type { GraphPayload } from '../api';
type GraphNode = GraphPayload['nodes'][number];
type GraphEdge = GraphPayload['edges'][number];
type PositionedNode = GraphNode & { x: number; y: number };

/** Pure geometry shared by graph rendering and tests. */
export function relationshipGraphLayout(payload: GraphPayload | null) {
  const nodeWidth = 168;
  const mainHeight = 66;
  const xGap = 270;
  const yGap = 34;
  const margin = 72;

  const centerNode = (() => payload?.nodes.find((node) => node.id === payload?.centerId) || null)();
  const nodeById = (() => new Map((payload?.nodes || []).map((node) => [node.id, node])))();
  const branchPalette = [
    '#0f8b7e',
    '#3b8cff',
    '#b7791f',
    '#7c3aed',
    '#db2777',
    '#059669',
    '#dc2626',
    '#64748b',
  ];
  const relationPathColor = '#dc2626';
  const parentEdges = (() => (payload?.edges || []).filter((edge) => edge.type === 'parent'))();
  const isRelationshipGraph = (() =>
    Boolean(payload?.selectedPersonIds?.length || (payload?.fromId && payload?.toId)))();
  const relationPathNodeIds = (() => new Set((payload?.pathNodeIds || []).map(Number)))();
  const relationPathEdgeIds = (() => new Set((payload?.pathEdgeIds || []).map(Number)))();
  const relationEndpointIds = (() =>
    new Set(
      (payload?.selectedPersonIds || [payload?.fromId, payload?.toId])
        .filter((id): id is number => Boolean(id))
        .map(Number),
    ))();

  const spouseBadges = (() => {
    const badges = new Map<number, GraphNode[]>();
    if (isRelationshipGraph) return badges;
    for (const edge of payload?.edges || []) {
      if (edge.type !== 'spouse') continue;
      const from = nodeById.get(edge.source);
      const to = nodeById.get(edge.target);
      if (!from || !to) continue;
      const host = spouseHost(from, to);
      const spouse = host.id === from.id ? to : from;
      badges.set(host.id, [...(badges.get(host.id) || []), spouse]);
    }
    return badges;
  })();

  const hiddenSpouseIds = (() => {
    const hidden = new Set<number>();
    if (isRelationshipGraph) return hidden;
    for (const spouses of spouseBadges.values()) {
      for (const spouse of spouses) {
        if (!spouse.isCenter) hidden.add(spouse.id);
      }
    }
    return hidden;
  })();

  const visibleNodes = (() =>
    (payload?.nodes || []).filter((node) => !hiddenSpouseIds.has(node.id)))();

  const generationMin = (() => {
    const generations = visibleNodes
      .map((node) => node.generation)
      .filter((value): value is number => value !== null);
    return generations.length ? Math.min(...generations) : 1;
  })();

  const positionedNodes = (() => {
    const groups = new Map<number, GraphNode[]>();
    for (const node of visibleNodes) {
      const generation = node.generation ?? generationMin;
      groups.set(generation, [...(groups.get(generation) || []), node]);
    }

    const generations = [...groups.keys()].sort((a, b) => a - b);
    const columnHeights = [...groups.values()].map((nodes) => {
      return (
        nodes.reduce((sum, node) => sum + nodeHeight(node), 0) +
        Math.max(0, nodes.length - 1) * yGap
      );
    });
    const baseHeight = Math.max(620, margin * 2 + Math.max(1, ...columnHeights));
    const positionedById = new Map<number, PositionedNode>();
    const allPositioned: PositionedNode[] = [];

    function directParentSortValue(node: GraphNode) {
      const parents = parentEdges
        .filter(
          (edge) =>
            Number(edge.target) === Number(node.id) && positionedById.has(Number(edge.source)),
        )
        .map((edge) => positionedById.get(Number(edge.source)) as PositionedNode);
      if (parents.length) {
        return parents.reduce((sum, parent) => sum + parent.y + mainHeight / 2, 0) / parents.length;
      }
      return Number.MAX_SAFE_INTEGER;
    }

    function parentSortValue(node: GraphNode) {
      const directSort = directParentSortValue(node);
      if (directSort !== Number.MAX_SAFE_INTEGER || !isRelationshipGraph) return directSort;

      for (const edge of payload?.edges || []) {
        if (edge.type !== 'spouse') continue;
        const partnerId =
          Number(edge.source) === Number(node.id)
            ? edge.target
            : Number(edge.target) === Number(node.id)
              ? edge.source
              : null;
        if (!partnerId) continue;
        const partner = nodeById.get(partnerId);
        if (!partner) continue;
        const partnerSort = directParentSortValue(partner);
        if (partnerSort !== Number.MAX_SAFE_INTEGER) return partnerSort + 0.1;
      }

      return Number.MAX_SAFE_INTEGER;
    }

    for (const generation of generations) {
      const nodes = [...(groups.get(generation) || [])].sort((a, b) => {
        const sortA = parentSortValue(a);
        const sortB = parentSortValue(b);
        if (sortA !== sortB) return sortA - sortB;
        return a.id - b.id;
      });
      const total =
        nodes.reduce((sum, node) => sum + nodeHeight(node), 0) +
        Math.max(0, nodes.length - 1) * yGap;
      let cursorY = baseHeight / 2 - total / 2;
      for (const node of nodes) {
        const positioned = {
          ...node,
          x: margin + (generation - generationMin) * xGap,
          y: cursorY,
        };
        positionedById.set(Number(node.id), positioned);
        allPositioned.push(positioned);
        cursorY += nodeHeight(node) + yGap;
      }
    }

    return allPositioned;
  })();

  const positionById = (() => new Map(positionedNodes.map((node) => [node.id, node])))();

  const visibleParentEdges = (() =>
    (payload?.edges || []).filter((edge) => {
      return (
        edge.type === 'parent' && positionById.has(edge.source) && positionById.has(edge.target)
      );
    }))();

  const visibleSpouseEdges = (() =>
    (payload?.edges || []).filter((edge) => {
      return (
        edge.type === 'spouse' && positionById.has(edge.source) && positionById.has(edge.target)
      );
    }))();

  const canvas = (() => {
    const maxX = Math.max(900, ...positionedNodes.map((node) => node.x + nodeWidth + margin));
    const maxY = Math.max(
      620,
      ...positionedNodes.map((node) => node.y + nodeHeight(node) + margin),
    );
    return { width: maxX, height: maxY };
  })();

  function spouseHost(a: GraphNode, b: GraphNode) {
    if (a.isCenter) return a;
    if (b.isCenter) return b;
    if (a.gender === 'male' && b.gender !== 'male') return a;
    if (b.gender === 'male' && a.gender !== 'male') return b;
    return a.id < b.id ? a : b;
  }

  function parentSourceId(nodeId: number) {
    const directParents = visibleParentEdges
      .filter((edge) => Number(edge.target) === Number(nodeId))
      .map((edge) => Number(edge.source))
      .sort((a, b) => a - b);
    return directParents[0];
  }

  function branchColor(parentId?: number) {
    if (!parentId) return branchPalette[0];
    return branchPalette[Math.abs(parentId) % branchPalette.length];
  }

  function nodeBorderColor(nodeId: number) {
    if (relationEndpointIds.has(nodeId)) return relationPathColor;
    if (relationPathNodeIds.has(nodeId)) return '#f97316';
    const parentId = parentSourceId(nodeId);
    return parentId ? branchColor(parentId) : undefined;
  }

  function edgeStroke(edge: GraphEdge) {
    if (relationPathEdgeIds.has(Number(edge.id))) return relationPathColor;
    if (edge.type === 'parent') return branchColor(edge.source);
    return undefined;
  }

  function nodeHeight(node: GraphNode) {
    const spouseCount = spouseBadges.get(node.id)?.length || 0;
    return mainHeight + (spouseCount ? 10 + spouseCount * 42 : 0) + 12;
  }

  function parentPath(edge: GraphEdge) {
    const from = positionById.get(edge.source);
    const to = positionById.get(edge.target);
    if (!from || !to) return '';
    const x1 = from.x + nodeWidth;
    const y1 = from.y + mainHeight / 2;
    const x2 = to.x;
    const y2 = to.y + mainHeight / 2;
    const mid = Math.max(34, (x2 - x1) * 0.52);
    return `M ${x1} ${y1} C ${x1 + mid} ${y1}, ${x2 - mid} ${y2}, ${x2} ${y2}`;
  }

  function spousePath(edge: GraphEdge) {
    const from = positionById.get(edge.source);
    const to = positionById.get(edge.target);
    if (!from || !to) return '';
    if (Math.abs(from.x - to.x) < 1) {
      const x = from.x + nodeWidth / 2;
      const y1 = from.y < to.y ? from.y + mainHeight : from.y;
      const y2 = from.y < to.y ? to.y : to.y + mainHeight;
      return `M ${x} ${y1} L ${x} ${y2}`;
    }
    const x1 = from.x + nodeWidth / 2;
    const y1 = from.y + mainHeight;
    const x2 = to.x + nodeWidth / 2;
    const y2 = to.y + mainHeight;
    return `M ${x1} ${y1} C ${x1} ${y1 + 42}, ${x2} ${y2 + 42}, ${x2} ${y2}`;
  }

  return {
    centerNode,
    isRelationshipGraph,
    relationPathNodeIds,
    relationPathEdgeIds,
    relationEndpointIds,
    spouseBadges,
    positionedNodes,
    positionById,
    visibleParentEdges,
    visibleSpouseEdges,
    canvas,
    nodeWidth,
    mainHeight,
    parentSourceId,
    nodeBorderColor,
    edgeStroke,
    parentPath,
    spousePath,
  };
}
