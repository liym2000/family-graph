import { ValidationService } from '../src/validation/validation.service';
import { DatabaseService } from '../src/database/database.service';

describe('review confirmations', () => {
  function fixture() {
    const people = [
      { id: 1, name: 'A', generation: 3, source: 'page 1' },
      { id: 2, name: 'A', generation: 3, source: 'page 2' },
    ];
    const fingerprints = new Set<string>();
    const db = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('INSERT INTO review_confirmation')) fingerprints.add(String(params[1]));
        if (sql.includes('DELETE FROM review_confirmation')) fingerprints.delete(String(params[1]));
        if (sql.includes('SELECT fingerprint'))
          return { rows: [...fingerprints].map((fingerprint) => ({ fingerprint })) };
        if (sql.includes('SELECT * FROM person WHERE')) return { rows: people };
        if (sql.includes('json_group_array'))
          return { rows: [{ name: 'A', generation: 3, count: 2, ids: '[1,2]' }] };
        return { rows: [] };
      }),
    };
    return { people, service: new ValidationService(db as unknown as DatabaseService) };
  }

  it('returns all duplicate members and persists reversible confirmation', async () => {
    const { service } = fixture();
    const item = (await service.anomalies(1, 100)).anomalies[0];
    expect(item.personIds).toEqual([1, 2]);
    await service.confirm(1, item.fingerprint, true);
    expect((await service.anomalies(1, 100)).anomalies[0].confirmed).toBe(true);
    await service.confirm(1, item.fingerprint, false);
    expect((await service.anomalies(1, 100)).anomalies[0].confirmed).toBe(false);
  });

  it('requires another review when a group member changes and rejects stale confirmation', async () => {
    const { service, people } = fixture();
    const item = (await service.anomalies(1, 100)).anomalies[0];
    await service.confirm(1, item.fingerprint, true);
    people[1].source = 'corrected source';
    expect((await service.anomalies(1, 100)).anomalies[0].confirmed).toBe(false);
    await expect(service.confirm(1, item.fingerprint, true)).rejects.toThrow();
  });
});
