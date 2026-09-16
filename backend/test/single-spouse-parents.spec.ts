import { planSingleSpouseParents } from '../src/relations/single-spouse-parents';
const people = [1, 2, 3, 4, 5].map((id) => ({
  id,
  generation: id < 4 ? 1 : 2,
}));
const parent = (from: number, to = 4, origin = 'manual') => ({
  id: from * 10 + to,
  from_person_id: from,
  to_person_id: to,
  relation_type: 'parent',
  origin,
});
const spouse = (a: number, b: number) => ({
  id: a * 100 + b,
  from_person_id: a,
  to_person_id: b,
  relation_type: 'spouse',
  origin: 'manual',
});

describe('first-recorded-spouse default parentage', () => {
  it('shares children in either direction for a mutually unique couple', () => {
    expect(planSingleSpouseParents(people, [spouse(1, 2), parent(1)]).relations).toEqual([
      { from_person_id: 2, to_person_id: 4 },
    ]);
    expect(planSingleSpouseParents(people, [spouse(2, 1), parent(2)]).relations).toEqual([
      { from_person_id: 1, to_person_id: 4 },
    ]);
  });
  it('defaults to the first recorded spouse even with multiple spouses', () => {
    expect(
      planSingleSpouseParents(people, [spouse(1, 2), spouse(1, 3), parent(1)]).relations,
    ).toEqual([{ from_person_id: 2, to_person_id: 4 }]);
    expect(
      planSingleSpouseParents(people, [spouse(1, 2), spouse(1, 3), parent(2)]).relations,
    ).toEqual([{ from_person_id: 1, to_person_id: 4 }]);
  });
  it('uses record IDs rather than the incoming array order', () => {
    expect(
      planSingleSpouseParents(people, [spouse(1, 3), parent(1), spouse(1, 2)]).relations,
    ).toEqual([{ from_person_id: 2, to_person_id: 4 }]);
  });
  it('keeps the original default when another spouse is added', () => {
    const edges = [spouse(1, 2), spouse(1, 3), parent(1), parent(2, 4, 'single_spouse')];
    expect(planSingleSpouseParents(people, edges).relations).toEqual([
      { from_person_id: 2, to_person_id: 4 },
    ]);
    expect(edges.find((r) => r.from_person_id === 1 && r.relation_type === 'parent')?.origin).toBe(
      'manual',
    );
  });
  it('respects a manually selected other parent and explicit exclusions', () => {
    expect(planSingleSpouseParents(people, [spouse(1, 2), parent(1), parent(3)]).relations).toEqual(
      [],
    );
    expect(
      planSingleSpouseParents(
        people,
        [spouse(1, 2), parent(1)],
        [{ from_person_id: 2, to_person_id: 4 }],
      ).relations,
    ).toEqual([]);
  });
  it('rejects generation conflicts and cyclic inferred parentage', () => {
    expect(
      planSingleSpouseParents(
        people.map((p) => (p.id === 2 ? { ...p, generation: 5 } : p)),
        [spouse(1, 2), parent(1)],
      ).skipped,
    ).toBe(1);
    const unknown = people.map((p) => ({ ...p, generation: null }));
    expect(
      planSingleSpouseParents(unknown, [spouse(1, 2), parent(1), parent(4, 2)]).relations,
    ).not.toContainEqual({ from_person_id: 2, to_person_id: 4 });
  });
});
