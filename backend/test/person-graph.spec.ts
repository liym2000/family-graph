import { GraphService } from '../src/graph/graph.service';

describe('person graph spouse boundary', () => {
  it.each([false, true])(
    'attaches direct spouses without traversing their spouses (reverse=%s)',
    async (reverse) => {
      const edges = [
        { id: 1, from_person_id: 1, to_person_id: 2, relation_type: 'spouse' },
        { id: 2, from_person_id: 2, to_person_id: 3, relation_type: 'spouse' },
      ];
      if (reverse) edges.reverse();
      const query = jest.fn(async (sql: string, params: unknown[]) => {
        if (sql.includes('FROM person_relation')) return { rows: edges };
        if (sql.includes('json_each'))
          return { rows: (params[0] as number[]).map((id) => ({ id, name: `Person ${id}` })) };
        return { rows: [{ id: 1 }], rowCount: 1 };
      });
      const graph = await new GraphService({ query } as never).personGraph({
        centerId: 1,
        familyId: 1,
        ancestorDepth: 0,
        descendantDepth: 0,
      });
      expect(graph.nodes.map((n) => n.id).sort()).toEqual([1, 2]);
      expect(graph.edges.map((e) => e.id)).toEqual([1]);
    },
  );
});
