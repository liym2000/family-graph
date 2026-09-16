import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchPersonsDto } from '../src/common/dto';
import { PersonsService } from '../src/persons/persons.service';

describe('person search pagination', () => {
  it('includes descendant paths outside the returned search page', async () => {
    const db = {
      query: jest.fn(async (sql: string) => ({
        rows: sql.includes('COUNT(*)')
          ? [{ total: 1 }]
          : sql.includes('SELECT from_person_id')
            ? [
                {
                  from_person_id: 31,
                  to_person_id: 70,
                  relation_type: 'parent',
                },
                {
                  from_person_id: 70,
                  to_person_id: 90,
                  relation_type: 'parent',
                },
              ]
            : [{ id: 31 }],
      })),
    };
    const result = await new PersonsService(db as never).search({
      familyId: 1,
      q: 'ancestor',
      limit: 30,
    });
    expect(result.results).toEqual([
      {
        id: 31,
        ancestor_generations: 0,
        is_pre_genealogy: true,
        children_count: 1,
        descendant_generations: 2,
        descendant_generations_source: 'direct',
      },
    ]);
  });
  it('counts the same filtered family and uses parameterized page boundaries', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      query: jest.fn(async (sql: string, params: unknown[]) => {
        calls.push({ sql, params: [...params] });
        return {
          rows: sql.includes('COUNT(*)')
            ? [{ total: 65 }]
            : sql.includes('SELECT from_person_id') || sql.includes('WITH RECURSIVE')
              ? []
              : [{ id: 31 }],
          rowCount: 1,
        };
      }),
    };
    const result = await new PersonsService(db as never).search({
      familyId: 1,
      q: 'example',
      generation: 2,
      issue: 'missing_source',
      sort: 'name',
      limit: 30,
      offset: 30,
    });
    expect(result).toEqual({
      results: [
        {
          id: 31,
          ancestor_generations: 0,
          is_pre_genealogy: false,
          children_count: 0,
          descendant_generations: 0,
          descendant_generations_source: 'none',
        },
      ],
      total: 65,
    });
    expect(calls[0].params).toEqual([1, '%example%', 2]);
    expect(calls[1].params).toEqual([1, '%example%', 2, 30, 30]);
    expect(calls[1].sql).toContain('LIMIT $4 OFFSET $5');
    expect(calls[1].sql).toContain('ORDER BY p.name, p.generation ASC NULLS LAST, p.id');
    expect(calls[0].sql).toContain('p.family_id = $1');
    expect(calls[0].sql).toContain('p.generation = $3');
    expect(calls[2].params).toEqual([1]);
    expect(calls[2].sql).toContain("relation_type IN ('parent', 'spouse')");
  });

  it('rejects negative offsets and arbitrary SQL sort strings', async () => {
    const dto = plainToInstance(SearchPersonsDto, {
      familyId: '1',
      offset: '-1',
      sort: 'name; DELETE FROM person',
    });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['offset', 'sort']),
    );
  });
});
