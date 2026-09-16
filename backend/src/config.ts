import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface AppConfig {
  demoReadOnly: boolean;
  host: string;
  port: number;
  databasePath: string;
  corsOrigins: string[];
}

function loadLocalEnv() {
  const candidates = [resolve(process.cwd(), '.env'), resolve(__dirname, '..', '.env')];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const lines = readFileSync(file, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      const value = rawValue.replace(/^['"]|['"]$/g, '');
      if (process.env[key] === undefined) process.env[key] = value;
    }
    return;
  }
}

function parsePort(value: string | undefined) {
  const port = Number(value || 9058);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

export function loadAppConfig(): AppConfig {
  loadLocalEnv();
  const databasePath = resolve(
    __dirname,
    '../..',
    process.env.SQLITE_PATH?.trim() || 'data/sqlite/family-graph.sqlite',
  );

  return {
    demoReadOnly: parseDemoReadOnly(process.env.DEMO_READ_ONLY),
    host: process.env.HOST?.trim() || '127.0.0.1',
    port: parsePort(process.env.PORT),
    databasePath,
    corsOrigins: (process.env.CORS_ORIGINS || 'http://127.0.0.1:9056')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}

export function parseDemoReadOnly(value: string | undefined): boolean {
  if (value === undefined || value.trim() === '' || value.trim().toLowerCase() === 'false')
    return false;
  if (value.trim().toLowerCase() === 'true') return true;
  throw new Error('DEMO_READ_ONLY must be true or false');
}
