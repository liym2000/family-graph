import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { loadAppConfig } from '../config';
import { SCHEMA_VERSION } from './sqlite-schema';

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QueryRow = Record<string, any>;

export class DatabaseClient {
  constructor(private readonly connection: DatabaseSync) {}

  async query<T = QueryRow>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const statement = this.connection.prepare(sql);
    const bindings: Record<string, SQLInputValue> = {};
    params.forEach((value, index) => {
      bindings[`$${index + 1}`] = Array.isArray(value)
        ? JSON.stringify(value)
        : value instanceof Date
          ? value.toISOString()
          : (value as SQLInputValue);
    });
    if (statement.columns().length) {
      const rows = statement.all(bindings).map((row) => ({ ...row }));
      // AFTER triggers normalize legacy source values before the API returns.
      if (/^\s*(INSERT|UPDATE)/i.test(sql)) {
        for (let i = 0; i < rows.length; i++) {
          if ('person_no' in rows[i] && rows[i].source !== null) {
            rows[i] = {
              ...this.connection.prepare('SELECT * FROM person WHERE id=?').get(rows[i].id),
            };
          }
        }
      }
      // Match the former API timestamp representation, including review fingerprints.
      for (const row of rows) {
        for (const key of ['created_at', 'updated_at', 'confirmed_at']) {
          if (typeof row[key] === 'string') row[key] = new Date(row[key]).toISOString();
        }
      }
      // Legacy review hashes used JSON property order from SELECT *. Preserve the
      // source column order, which differs between historical PostgreSQL schemas.
      if (rows.some((row) => 'person_no' in row && 'created_at' in row)) {
        const metadata = this.connection
          .prepare("SELECT value FROM app_metadata WHERE key='person_column_order'")
          .get();
        const order = JSON.parse(String(metadata?.value)) as string[];
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if ('person_no' in row && 'created_at' in row) {
            rows[i] = Object.fromEntries(
              [
                ...order.filter((key) => key in row),
                ...Object.keys(row).filter((key) => !order.includes(key)),
              ].map((key) => [key, row[key]]),
            );
          }
        }
      }
      return { rows: rows as T[], rowCount: rows.length };
    }
    return { rows: [], rowCount: Number(statement.run(bindings).changes) };
  }
}

@Injectable()
export class DatabaseService implements OnModuleDestroy, OnModuleInit {
  private connection?: DatabaseSync;
  private pending: Promise<unknown> = Promise.resolve();

  async onModuleInit(): Promise<void> {
    await this.query('SELECT 1');
  }

  private client() {
    if (!this.connection) {
      const path = loadAppConfig().databasePath;
      if (!existsSync(path))
        throw new Error(
          'SQLite database missing; explicitly initialize or migrate before starting.',
        );
      const connection = new DatabaseSync(path, { timeout: 5000 });
      try {
        connection.exec(
          'PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;',
        );
        if (connection.prepare('PRAGMA user_version').get()?.user_version !== SCHEMA_VERSION)
          throw new Error('Unsupported SQLite schema; run database migration before starting.');
        this.connection = connection;
      } catch (error) {
        connection.close();
        throw error;
      }
    }
    return new DatabaseClient(this.connection);
  }

  // Standalone queries must not enter another request's open transaction.
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => undefined);
    return result;
  }

  query<T = QueryRow>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    return this.enqueue(() => this.client().query<T>(sql, params));
  }

  transaction<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      const client = this.client();
      await client.query('BEGIN IMMEDIATE');
      try {
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pending;
    this.connection?.close();
    this.connection = undefined;
  }
}

export type QueryableDatabase = Pick<DatabaseService, 'query'> | DatabaseClient;
