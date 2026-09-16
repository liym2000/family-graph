const { DatabaseSync, backup } = require('node:sqlite');
const { mkdirSync, copyFileSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { createHash } = require('node:crypto');
const { loadAppConfig } = require('../dist/config');

function manifest(db) {
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all();
  return Object.fromEntries(tables.map(({name})=> {
    const rows = db.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all();
    return [name,{rows:rows.length,sha256:createHash('sha256').update(rows.map(r=>JSON.stringify(r)).sort().join('\n')).digest('hex')}];
  }));
}
async function main() {
  const folder=resolve(__dirname,'../../data/backups',`sqlite-${new Date().toISOString().replace(/[:.]/g,'-')}`);
  const source=new DatabaseSync(loadAppConfig().databasePath,{readOnly:true});
  mkdirSync(folder,{recursive:true});
  try {
    const before=manifest(source);
    await backup(source,join(folder,'database.sqlite'));
    copyFileSync(join(folder,'database.sqlite'),join(folder,'restore-check.sqlite'));
    const restored=new DatabaseSync(join(folder,'restore-check.sqlite'),{readOnly:true});
    try {
      const after=manifest(restored);
      if (JSON.stringify(before)!==JSON.stringify(manifest(source))) throw Error('Source changed; retry backup while editing is stopped.');
      if (JSON.stringify(before)!==JSON.stringify(after)) throw Error('Restored content hashes differ.');
      if (restored.prepare('PRAGMA integrity_check').get().integrity_check!=='ok' || restored.prepare('PRAGMA foreign_key_check').all().length) throw Error('Restored integrity check failed.');
      writeFileSync(join(folder,'verification.json'),JSON.stringify({verifiedAt:new Date().toISOString(),tables:after,integrity:'ok'},null,2));
      console.log('PASS: SQLite backup restored with matching table hashes and sequences; integrity and foreign keys valid. '+folder);
    } finally { restored.close(); }
  } finally { source.close(); }
}
if (require.main===module) main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={manifest};
