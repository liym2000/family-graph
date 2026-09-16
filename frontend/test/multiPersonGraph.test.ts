import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/api';
import { multiPersonGraph } from '../src/multiPersonGraph';

vi.mock('../src/api', () => ({ api: { relationshipPath: vi.fn(), getPerson: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());
const node = (id: number) => ({ id, label: `Person ${id}`, person_no: String(id), generation: 1, gender: 'unknown' as const, source: null, isCenter: id === 1 });
describe('multiple person graph', () => {
  it('merges shared nodes and edges while marking every selected person', async () => {
    vi.mocked(api.relationshipPath).mockImplementation(async (_family, from, to) => ({
      fromId: from, toId: to, centerId: from, found: true,
      nodes: [node(1), node(4), node(to)],
      edges: [{ id: 10, source: 1, target: 4, type: 'parent' }, { id: to + 10, source: 4, target: to, type: 'parent' }],
      pathNodeIds: [1, 4, to], pathEdgeIds: [10, to + 10], steps: [],
    }));
    const graph = await multiPersonGraph(1, [1, 2, 3]);
    expect(graph.nodes).toHaveLength(4);
    expect(graph.edges).toHaveLength(3);
    expect(graph.nodes.filter(n => n.isRelationEndpoint).map(n => n.id).sort()).toEqual([1, 2, 3]);
    expect(graph.disconnectedNames).toEqual([]);
  });
  it('keeps disconnected selected people visible without inventing edges', async () => {
    vi.mocked(api.relationshipPath).mockResolvedValue({ fromId: 1, toId: 2, centerId: 1, found: false, nodes: [], edges: [], pathNodeIds: [], pathEdgeIds: [], steps: [] });
    vi.mocked(api.getPerson).mockImplementation(async id => ({ person: { id, name: `Person ${id}`, family_id: 1, person_no: String(id), generation: 1, gender: 'unknown', source: null, remark: null }, relations: [] }));
    const graph = await multiPersonGraph(1, [1, 2]);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toEqual([]);
    expect(graph.disconnectedNames).toEqual(['Person 2']);
  });
  it('rejects a selection containing only one distinct person', async () => {
    await expect(multiPersonGraph(1, [1, 1])).rejects.toThrow();
    expect(api.relationshipPath).not.toHaveBeenCalled();
  });
});
