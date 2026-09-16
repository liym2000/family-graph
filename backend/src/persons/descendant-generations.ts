type ParentEdge = { from_person_id: number; to_person_id: number };
export type DescendantSummary = {
  descendant_generations: number | null;
  descendant_generations_source: 'direct' | 'spouse' | 'none';
};

/** Depth follows stored parent links; source describes the person's outgoing links. */
export function descendantSummaries(
  relations: Array<ParentEdge & { relation_type: 'parent' | 'spouse'; origin?: string }>,
): Map<number, DescendantSummary> {
  const parentEdges = relations.filter((edge) => edge.relation_type === 'parent');
  const depths = descendantGenerations(parentEdges);
  const summaries = new Map<number, DescendantSummary>();
  for (const edge of parentEdges) {
    const id = Number(edge.from_person_id);
    const previous = summaries.get(id);
    summaries.set(id, {
      descendant_generations: depths.get(id) ?? null,
      descendant_generations_source:
        edge.origin !== 'single_spouse' || previous?.descendant_generations_source === 'direct'
          ? 'direct'
          : 'spouse',
    });
  }
  return summaries;
}

/** Longest recorded parent-child path, excluding the person themselves.
 * A null depth means a cycle is reachable, so no finite depth can be reported.
 */
export function descendantGenerations(edges: ParentEdge[]): Map<number, number | null> {
  const parents = new Map<number, number[]>();
  const remaining = new Map<number, number>();
  const depths = new Map<number, number | null>();
  for (const edge of edges) {
    const parent = Number(edge.from_person_id);
    const child = Number(edge.to_person_id);
    remaining.set(parent, (remaining.get(parent) || 0) + 1);
    if (!remaining.has(child)) remaining.set(child, 0);
    const incoming = parents.get(child) || [];
    incoming.push(parent);
    parents.set(child, incoming);
    depths.set(parent, 0);
    depths.set(child, 0);
  }
  const queue = [...remaining].filter(([, count]) => count === 0).map(([id]) => id);
  for (let index = 0; index < queue.length; index += 1) {
    const child = queue[index];
    for (const parent of parents.get(child) || []) {
      depths.set(parent, Math.max(depths.get(parent) || 0, (depths.get(child) || 0) + 1));
      const count = remaining.get(parent)! - 1;
      remaining.set(parent, count);
      if (count === 0) queue.push(parent);
    }
  }
  for (const [id, count] of remaining) if (count > 0) depths.set(id, null);
  return depths;
}
