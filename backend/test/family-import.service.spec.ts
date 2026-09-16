import { BadRequestException } from '@nestjs/common';
import { FamilyImportService } from '../src/families/family-import.service';

function validPayload() {
  return {
    format: 'family_graph_export' as const,
    version: 1 as const,
    family: { name: '示例家谱', surname: '陈', person_prefix: 'demofm', remark: null },
    people: [
      { id: 1, person_no: 'demofm-00000001', name: '甲', generation: 1, gender: 'male' },
      { id: 2, person_no: 'demofm-00000002', name: '乙', generation: 2, gender: 'female' },
    ],
    relations: [{ id: 1, from_person_id: 1, to_person_id: 2, relation_type: 'parent' }],
  };
}

describe('FamilyImportService', () => {
  it('imports a valid export in one transaction', async () => {
    let personId = 100;
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT EXISTS')) return { rows: [{ exists: false }], rowCount: 1 };
        if (sql.includes('INSERT INTO family')) {
          return { rows: [{ id: 10, name: '示例家谱', person_prefix: 'demofm' }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO person ')) return { rows: [{ id: personId++ }], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      }),
    };
    const database = {
      transaction: jest.fn(async (callback: (value: typeof client) => Promise<unknown>) =>
        callback(client),
      ),
    };
    const service = new FamilyImportService(database as never);

    const result = await service.importAsNewFamily(validPayload());

    expect(result.imported).toEqual({ people: 2, relations: 1 });
    expect(result.prefixChanged).toBe(false);
    expect(database.transaction).toHaveBeenCalledTimes(1);
  });

  it('allocates a new prefix when the exported prefix already exists', async () => {
    let prefixChecks = 0;
    const client = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('SELECT EXISTS')) {
          prefixChecks += 1;
          return { rows: [{ exists: prefixChecks === 1 }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO family')) {
          return { rows: [{ id: 11, name: '示例家谱', person_prefix: params?.[2] }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO person '))
          return { rows: [{ id: 200 + prefixChecks }], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      }),
    };
    const database = {
      transaction: (callback: (value: typeof client) => Promise<unknown>) => callback(client),
    };
    const service = new FamilyImportService(database as never);

    const result = await service.importAsNewFamily(validPayload());

    expect(result.prefixChanged).toBe(true);
    const personInsert = client.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO person '),
    );
    expect(String(personInsert?.[1]?.[1])).toMatch(/^[a-z0-9]{6}-00000001$/);
    expect(String(personInsert?.[1]?.[1])).not.toBe('demofm-00000001');
  });

  it('rejects parent cycles before opening a transaction', async () => {
    const payload = validPayload();
    payload.relations.push({ id: 2, from_person_id: 2, to_person_id: 1, relation_type: 'parent' });
    payload.people[0].generation = null as never;
    payload.people[1].generation = null as never;
    const database = { transaction: jest.fn() };
    const service = new FamilyImportService(database as never);

    await expect(service.importAsNewFamily(payload)).rejects.toBeInstanceOf(BadRequestException);
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('preserves historical generation gaps in a backup', async () => {
    const payload = validPayload();
    payload.people[1].generation = 3;
    let id = 100;
    const query = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('SELECT EXISTS')) return { rows: [{ exists: false }] };
      if (sql.includes('INSERT INTO family')) return { rows: [{ id: 10 }] };
      if (sql.includes('INSERT INTO person ')) return { rows: [{ id: id++ }] };
      return { rows: [], rowCount: 0 };
    });
    const database = {
      transaction: async (run: (client: { query: typeof query }) => unknown) => run({ query }),
    };
    await new FamilyImportService(database as never).importAsNewFamily(payload);
    expect(
      query.mock.calls
        .filter(([sql]) => sql.includes('INSERT INTO person '))
        .map(([, params]) => params?.[3]),
    ).toEqual([1, 3]);
    expect(
      query.mock.calls.find(([sql]) => sql.includes('INSERT INTO person_relation'))?.[1],
    ).toEqual([10, 100, 101, 'parent']);
  });
});
