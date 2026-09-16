// Build first. Dry run is the default; --apply requires a new private backup directory.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { DatabaseClient } = require('../dist/database/database.service');
const { spawnSync } = require('node:child_process');
const { loadAppConfig } = require('../dist/config');
const {
  planSingleSpouseParents,
  syncSingleSpouseParents,
} = require('../dist/relations/single-spouse-parents');

async function main() {
  const apply = process.argv.includes('--apply');
  const backupIndex = process.argv.indexOf('--backup-dir');
  const backupDir =
    backupIndex >= 0 ? path.resolve(process.argv[backupIndex + 1]) : null;
  if (apply && !backupDir) throw new Error('--apply requires --backup-dir');
  if (apply) fs.mkdirSync(backupDir); // Refuse to overwrite a previous backup.
  if (apply) {
    const verified = spawnSync(process.execPath, [path.join(__dirname,'verify-sqlite-backup.js')], {stdio:'inherit',windowsHide:true});
    if (verified.status !== 0) throw new Error('Full SQLite backup verification failed.');
  }
  const databasePath = loadAppConfig().databasePath;
  if (!fs.existsSync(databasePath)) throw new Error('SQLite database missing; refusing to create an empty database.');
  const connection = new DatabaseSync(databasePath);
  connection.exec('PRAGMA foreign_keys=ON');
  const client = new DatabaseClient(connection);
  try {
    await client.query('BEGIN IMMEDIATE');
    const families = (await client.query('SELECT * FROM family ORDER BY id'))
      .rows;
    const table = true;
    const reports = [];
    for (const family of families) {
      const people = (
        await client.query(
          'SELECT * FROM person WHERE family_id = $1 ORDER BY id',
          [family.id],
        )
      ).rows;
      const relations = (
        await client.query(
          'SELECT * FROM person_relation WHERE family_id = $1 ORDER BY id',
          [family.id],
        )
      ).rows;
      const excluded = table
        ? (
            await client.query(
              'SELECT from_person_id, to_person_id FROM auto_parent_exclusion WHERE family_id = $1',
              [family.id],
            )
          ).rows
        : [];
      const plan = planSingleSpouseParents(people, relations, excluded);
      if (apply) {
        const backup = {
          format: 'family_graph_export',
          version: 1,
          exportedAt: new Date().toISOString(),
          family,
          people,
          relations,
          excluded_auto_parents: excluded,
        };
        const file = path.join(backupDir, `family-${family.id}.json`);
        fs.writeFileSync(file, JSON.stringify(backup, null, 2), { flag: 'wx' });
        if (
          JSON.parse(fs.readFileSync(file, 'utf8')).relations.length !==
          relations.length
        )
          throw new Error('Backup verification failed');
        reports.push({
          familyId: family.id,
          ...(await syncSingleSpouseParents(client, Number(family.id))),
        });
      } else {
        const key = (r) => `${r.from_person_id}:${r.to_person_id}`;
        const desired = new Set(plan.relations.map(key));
        const current = new Set(
          relations.filter((r) => r.origin === 'single_spouse').map(key),
        );
        reports.push({
          familyId: family.id,
          plannedAutomaticParents: desired.size,
          pendingAdds: [...desired].filter((k) => !current.has(k)).length,
          pendingRemovals: [...current].filter((k) => !desired.has(k)).length,
          skippedConflicts: plan.skipped,
        });
      }
    }
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    console.log(JSON.stringify({ applied: apply, reports }, null, 2));
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    connection.close();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
