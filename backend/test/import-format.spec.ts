import { normalizeFamilyImport } from '../src/families/import-format';

function payload(count = 3) {
  return {
    format: 'family_graph_export' as const,
    version: 1 as const,
    family: { name: 'Fixture', person_prefix: 'demo00' },
    people: Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      person_no: `demo00-${String(i + 1).padStart(8, '0')}`,
      name: `Person ${i}`,
      generation: null,
    })),
    relations: Array.from({ length: count - 1 }, (_, i) => ({
      from_person_id: i + 1,
      to_person_id: i + 2,
      relation_type: 'parent',
    })),
  };
}
describe('backup normalization', () => {
  it('accepts a deep acyclic lineage and rejects its closing edge', () => {
    const input = payload(12000);
    expect(normalizeFamilyImport(input).people).toHaveLength(12000);
    input.relations.push({ from_person_id: 12000, to_person_id: 1, relation_type: 'parent' });
    expect(() => normalizeFamilyImport(input)).toThrow('cycle');
  });
  it('rejects foreign endpoints and symmetric spouse duplicates', () => {
    const input = payload();
    input.relations[0].to_person_id = 999;
    expect(() => normalizeFamilyImport(input)).toThrow('not in this export');
    input.relations = [
      { from_person_id: 1, to_person_id: 2, relation_type: 'spouse' },
      { from_person_id: 2, to_person_id: 1, relation_type: 'spouse' },
    ];
    expect(() => normalizeFamilyImport(input)).toThrow('duplicates another relation');
  });
});
