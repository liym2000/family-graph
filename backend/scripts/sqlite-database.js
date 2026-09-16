const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { loadAppConfig } = require('../dist/config');
const { initializeSchema, installTriggers, SCHEMA_VERSION } = require('../dist/database/sqlite-schema');

function main() {
  const action = process.argv[2] || 'status';
  if (!['init','start','stop','status','migrate'].includes(action)) throw Error('Unknown database action.');
  const file = loadAppConfig().databasePath;
  if (action === 'init') {
    if (!process.argv.includes('--new-project')) throw Error('Initialization requires --new-project; existing projects must migrate or restore.');
    fs.mkdirSync(path.dirname(file), {recursive:true});
    fs.closeSync(fs.openSync(file,'wx'));
    const db = new DatabaseSync(file);
    try {
      db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE;');
      initializeSchema(db);
      installTriggers(db);
      db.exec('COMMIT');
    } finally { db.close(); }
    console.log('SQLite initialized for a new project.');
    return;
  }
  if (!fs.existsSync(file)) throw Error('SQLite database missing; migrate or explicitly initialize a new project. No empty database was created.');
  const db = new DatabaseSync(file,{readOnly:true});
  try {
    if (db.prepare('PRAGMA user_version').get().user_version !== SCHEMA_VERSION) throw Error('Unsupported SQLite schema version.');
    if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw Error('SQLite quick_check failed.');
    console.log('SQLite ready; database is managed inside the application (no database server).');
  } finally { db.close(); }
}
try { main(); } catch(error) { console.error(error.message); process.exitCode=1; }
