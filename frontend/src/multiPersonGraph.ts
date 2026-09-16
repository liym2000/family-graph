import { api, type GraphPayload } from './api';

export async function multiPersonGraph(familyId: number, ids: number[]): Promise<GraphPayload & { disconnectedNames: string[] }> {
  const selected = [...new Set(ids)];
  if (selected.length < 2 || selected.length > 10)
    throw new Error('Select 2–10 different people');
  const root = selected[0];
  const paths = await Promise.all(selected.slice(1).map(id => api.relationshipPath(familyId, root, id)));
  const nodes = new Map<number, GraphPayload['nodes'][number]>();
  const edges = new Map<number, GraphPayload['edges'][number]>();
  for (const path of paths) {
    for (const node of path.nodes) nodes.set(Number(node.id), { ...node, isRelationEndpoint: selected.includes(Number(node.id)) });
    for (const edge of path.edges) edges.set(Number(edge.id), edge);
  }
  await Promise.all(selected.filter(id => !nodes.has(id)).map(async id => {
    const { person } = await api.getPerson(id);
    if (Number(person.family_id) !== familyId) throw new Error('Person does not belong to this family');
    nodes.set(id, { id, label: person.name, person_no: person.person_no, generation: person.generation, gender: person.gender, source: person.source, isCenter: id === root, isRelationEndpoint: true });
  }));
  return {
    centerId: root,
    selectedPersonIds: selected,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    pathNodeIds: [...new Set(paths.flatMap(path => path.pathNodeIds))],
    pathEdgeIds: [...edges.keys()],
    disconnectedNames: paths.filter(path => !path.found).map(path => nodes.get(Number(path.toId))!.label),
  };
}
