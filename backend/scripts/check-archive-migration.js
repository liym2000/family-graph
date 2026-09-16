const assert = require('node:assert/strict');
const { createTestDatabase } = require('./sqlite-test-database');
(async()=>{
  const db=createTestDatabase();
  await db.query('BEGIN');
  try {
    await db.query("INSERT INTO archive_person_notes_before_merge VALUES(1,'Synthetic source','Synthetic note')");
    const before=(await db.query('SELECT * FROM archive_person_notes_before_merge')).rows;
    const family=(await db.query("INSERT INTO family(name,person_prefix) VALUES('Fixture','arch00') RETURNING id")).rows[0].id;
    await db.query('DELETE FROM family WHERE id=$1',[family]);
    assert.deepEqual((await db.query('SELECT * FROM archive_person_notes_before_merge')).rows,before);
    await db.query('ROLLBACK');
    assert.equal((await db.query('SELECT * FROM archive_person_notes_before_merge')).rowCount,0);
    console.log('PASS: historical snapshots survive family deletion; archive writes roll back.');
  } finally { await db.end(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
