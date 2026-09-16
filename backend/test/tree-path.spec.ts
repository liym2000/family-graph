import { TreeService } from '../src/graph/tree.service';

describe('finding a person within a rooted family tree', () => {
  const relations = [
    { from_person_id: 1, to_person_id: 2, relation_type: 'parent' },
    { from_person_id: 2, to_person_id: 3, relation_type: 'parent' },
    { from_person_id: 3, to_person_id: 4, relation_type: 'parent' },
    { from_person_id: 3, to_person_id: 5, relation_type: 'spouse' },
    { from_person_id: 5, to_person_id: 6, relation_type: 'parent' },
    { from_person_id: 4, to_person_id: 2, relation_type: 'parent' },
  ];
  function service() {
    return new TreeService({
      query: jest.fn(async (_sql: string, args: unknown[]) =>
        args.length === 2
          ? {
              rows: (args[1] as number[])
                .filter((id, i, ids) => id <= 6 && ids.indexOf(id) === i)
                .map((id) => ({ id })),
            }
          : { rows: relations },
      ),
    } as never);
  }
  it('reveals a deep descendant without looping on legacy cycles', async () => {
    expect(await service().findPath(10, 1, 4)).toEqual({
      found: true,
      path: [1, 2, 3, 4],
      spouseId: null,
    });
  });
  it('attaches a spouse at the end instead of using a spouse as an ancestor', async () => {
    expect(await service().findPath(10, 1, 5)).toEqual({
      found: true,
      path: [1, 2, 3],
      spouseId: 5,
    });
    expect(await service().findPath(10, 1, 6)).toEqual({ found: false, path: [], spouseId: null });
  });
  it('handles the root and refuses to change to an ancestor outside the branch', async () => {
    expect(await service().findPath(10, 1, 1)).toEqual({ found: true, path: [1], spouseId: null });
    expect((await service().findPath(10, 3, 1)).found).toBe(false);
  });
  it('rejects endpoints outside the family before reading relationships', async () => {
    await expect(service().findPath(10, 1, 99)).rejects.toThrow('person not found in family');
  });
});
