import { descendantGenerations } from '../src/persons/descendant-generations';

const edges = (pairs: number[][]) =>
  pairs.map(([from_person_id, to_person_id]) => ({
    from_person_id,
    to_person_id,
  }));

describe('recorded descendant generations', () => {
  it('uses the deepest branch rather than counting children or descendants', () => {
    const depths = descendantGenerations(
      edges([
        [1, 2],
        [1, 3],
        [3, 4],
        [4, 5],
        [3, 6],
      ]),
    );
    expect(depths.get(1)).toBe(3);
    expect(depths.get(3)).toBe(2);
    expect(depths.get(2)).toBe(0);
    expect(depths.get(6)).toBe(0);
  });

  it('handles shared descendants reached through paths of different lengths', () => {
    const depths = descendantGenerations(
      edges([
        [1, 2],
        [2, 4],
        [1, 3],
        [3, 5],
        [5, 4],
        [4, 6],
      ]),
    );
    expect(depths.get(1)).toBe(4);
    expect(depths.get(2)).toBe(2);
  });

  it('reports cycles and their ancestors as unavailable without affecting other branches', () => {
    const depths = descendantGenerations(
      edges([
        [1, 2],
        [2, 3],
        [3, 2],
        [1, 4],
        [5, 6],
      ]),
    );
    expect(depths.get(1)).toBeNull();
    expect(depths.get(2)).toBeNull();
    expect(depths.get(3)).toBeNull();
    expect(depths.get(4)).toBe(0);
    expect(depths.get(5)).toBe(1);
  });

  it('does not depend on recursive JavaScript stack depth', () => {
    const depths = descendantGenerations(
      edges(Array.from({ length: 15000 }, (_, i) => [i, i + 1])),
    );
    expect(depths.get(0)).toBe(15000);
  });
});
