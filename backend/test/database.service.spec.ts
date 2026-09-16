import { mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DatabaseService } from '../src/database/database.service';
import { initializeSchema, installTriggers } from '../src/database/sqlite-schema';

describe('SQLite transactions', () => {
  let folder: string;
  let service: DatabaseService;
  let oldPath: string | undefined;
  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'family-graph-sqlite-test-'));
    oldPath = process.env.SQLITE_PATH;
    process.env.SQLITE_PATH = join(folder, 'test.sqlite');
    const db = new DatabaseSync(process.env.SQLITE_PATH);
    initializeSchema(db);
    installTriggers(db);
    db.close();
    service = new DatabaseService();
  });
  afterEach(async () => {
    await service.onModuleDestroy();
    unlinkSync(join(folder, 'test.sqlite'));
    rmdirSync(folder);
    if (oldPath === undefined) delete process.env.SQLITE_PATH;
    else process.env.SQLITE_PATH = oldPath;
  });

  it('rolls back failed writes and allows subsequent transactions', async () => {
    await expect(
      service.transaction(async (client) => {
        await client.query("INSERT INTO family(name,person_prefix) VALUES('Rollback','roll00')");
        throw new Error('failure');
      }),
    ).rejects.toThrow('failure');
    expect((await service.query('SELECT * FROM family')).rowCount).toBe(0);
    await service.transaction((client) =>
      client.query("INSERT INTO family(name,person_prefix) VALUES('Committed','keep00')"),
    );
    expect((await service.query('SELECT * FROM family')).rowCount).toBe(1);
  });

  it('queues concurrent queries outside the active transaction', async () => {
    let entered!: () => void;
    let resume!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const transaction = service.transaction(async (client) => {
      await client.query("INSERT INTO family(name,person_prefix) VALUES('Hidden','hide00')");
      entered();
      await gate;
      throw new Error('rollback');
    });
    const rejected = expect(transaction).rejects.toThrow('rollback');
    await started;
    const read = service.query('SELECT * FROM family');
    const write = service.transaction((client) =>
      client.query("INSERT INTO family(name,person_prefix) VALUES('Other','next00')"),
    );
    resume();
    await rejected;
    expect((await read).rowCount).toBe(0);
    await write;
    expect((await service.query('SELECT * FROM family')).rows[0].name).toBe('Other');
  });

  it('rejects a missing database without initializing it', async () => {
    process.env.SQLITE_PATH = join(folder, 'missing.sqlite');
    await expect(service.query('SELECT 1')).rejects.toThrow('database missing');
  });

  it('preserves historical person property order used by review fingerprints', async () => {
    const order = [
      'id',
      'family_id',
      'name',
      'generation',
      'gender',
      'remark',
      'source',
      'created_at',
      'updated_at',
      'person_no',
    ];
    await service.query("UPDATE app_metadata SET value=$1 WHERE key='person_column_order'", [
      JSON.stringify(order),
    ]);
    const family = (
      await service.query(
        "INSERT INTO family(name,person_prefix) VALUES('Fixture','order0') RETURNING id",
      )
    ).rows[0].id;
    const person = (
      await service.query(
        "INSERT INTO person(family_id,person_no,name,source,remark) VALUES($1,'order0-00000001','Fixture','Page','Note') RETURNING *",
        [family],
      )
    ).rows[0];
    expect(Object.keys(person)).toEqual(order);
    expect(person.source).toBeNull();
    expect(person.remark).toBe('来源：Page\nNote');
    expect((await service.query('SELECT * FROM person')).rows[0]).toEqual(person);
  });
});
