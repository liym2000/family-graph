import { describe, expect, it } from 'vitest';
import type { GraphPayload } from '../src/api';
import { relationshipGraphLayout } from '../src/layout/relationshipGraphLayout';

function fixture(): GraphPayload {
  return {
    centerId: 1,
    nodes: [
      {
        id: 1,
        person_no: 'demo00-00000001',
        label: 'Root',
        gender: 'male',
        generation: 1,
        source: null,
        isCenter: true,
      },
      {
        id: 2,
        person_no: 'demo00-00000002',
        label: 'Partner',
        gender: 'female',
        generation: 1,
        source: null,
        isCenter: false,
      },
      {
        id: 3,
        person_no: 'demo00-00000003',
        label: 'Child',
        gender: 'male',
        generation: 2,
        source: null,
        isCenter: false,
      },
    ],
    edges: [
      { id: 1, source: 1, target: 2, type: 'spouse' },
      { id: 2, source: 1, target: 3, type: 'parent' },
    ],
  };
}
describe('relationship graph geometry', () => {
  it('reserves spouse badge space and draws the parent link between visible cards', () => {
    const input = fixture(),
      original = JSON.stringify(input),
      result = relationshipGraphLayout(input);
    expect(result.positionedNodes.map((n) => n.id)).toEqual([1, 3]);
    expect(result.spouseBadges.get(1)?.map((n) => n.id)).toEqual([2]);
    expect(result.positionById.get(3)!.x).toBeGreaterThan(result.positionById.get(1)!.x);
    expect(result.parentPath(input.edges[1])).toMatch(/^M .+ C /);
    expect(JSON.stringify(input)).toBe(original);
  });
  it('keeps selected spouses visible as path endpoints', () => {
    const input = {
      ...fixture(),
      selectedPersonIds: [1, 2],
      pathNodeIds: [1, 2],
      pathEdgeIds: [1],
    };
    const result = relationshipGraphLayout(input);
    expect(result.positionedNodes).toHaveLength(3);
    expect(result.visibleSpouseEdges).toHaveLength(1);
    expect(result.relationEndpointIds.has(2)).toBe(true);
  });
});
