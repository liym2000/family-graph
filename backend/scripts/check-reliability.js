// Run after npm run build. Uses disposable records inside a rolled-back transaction.
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { createTestDatabase } = require('./sqlite-test-database');
const { FamiliesService } = require('../dist/families/families.service');
const { FamilyImportService } = require('../dist/families/family-import.service');
const { PersonsService } = require('../dist/persons/persons.service');
const { ValidationService } = require('../dist/validation/validation.service');

async function main() {
  const client = createTestDatabase();

  await client.query('BEGIN');
  const database = {
    query: (sql, args) => client.query(sql, args),
    transaction: (callback) => callback(database),
  };
  try {
    const prefix = randomBytes(3).toString('hex');
    const families = new FamiliesService(database);
    const family = (await client.query('INSERT INTO family(name,person_prefix,person_next_number) VALUES ($1,$2,126) RETURNING *', ['Review fixture', prefix])).rows[0];
    const another = (await client.query('INSERT INTO family(name,person_prefix) VALUES ($1,$2) RETURNING *', ['Other fixture', randomBytes(3).toString('hex')])).rows[0];
    const persons = (await client.query(`WITH RECURSIVE numbers(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM numbers WHERE n<125) INSERT INTO person(family_id,person_no,name,generation,gender) SELECT $1, $2 || '-' || printf('%08d',n), 'Fixture ' || n, 1, 'male' FROM numbers RETURNING *`, [family.id, prefix])).rows;
    const outsider = (await client.query("INSERT INTO person(family_id,person_no,name) VALUES($1,$2,'Outside') RETURNING *", [another.id, another.person_prefix + '-00000001'])).rows[0];
    for (const table of ['person_relation', 'auto_parent_exclusion']) {
      await client.query('SAVEPOINT invalid_edge');
      let rejected = false;
      try {
        const columns = table === 'person_relation' ? ",relation_type" : '';
        const values = table === 'person_relation' ? ",'parent'" : '';
        await client.query(`INSERT INTO ${table}(family_id,from_person_id,to_person_id${columns}) VALUES($1,$2,$3${values})`, [family.id, persons[0].id, outsider.id]);
      } catch (e) { assert.equal(e.errcode, 787); rejected = true; }
      assert.ok(rejected, 'cross-family endpoint must be rejected');
      await client.query('ROLLBACK TO SAVEPOINT invalid_edge');
    }
    const validation = new ValidationService(database);
    const findings = await validation.anomalies(Number(family.id), 0);
    assert.equal(findings.anomalies.length, 125);
    assert.equal((await validation.anomalies(Number(family.id), 50)).anomalies.length, 50);
    await validation.confirm(Number(family.id), findings.anomalies[124].fingerprint, true);
    const exported = await families.export(Number(family.id));
    assert.equal(exported.reviewed_issues.length, 1);
    const imported = await new FamilyImportService(database).importAsNewFamily(exported);
    assert.notEqual(imported.family.id, family.id);
    const restored = await validation.anomalies(Number(imported.family.id), 0);
    assert.equal(restored.anomalies.filter(item => item.confirmed).length, 1);
    assert.notEqual(restored.anomalies.find(item => item.confirmed).personId, findings.anomalies[124].personId);
    assert.equal(restored.anomalies.find(item => item.confirmed).details.name, findings.anomalies[124].details.name);
    const queries = [];
    const observed = { query: (sql, args) => { queries.push(sql); return database.query(sql, args); }, transaction: fn => fn(observed) };
    await new PersonsService(observed).update(Number(persons[0].id), { remark: 'Edited' });
    assert.ok(queries.some(q => q.includes('UPDATE person')));
    await client.query('UPDATE person SET generation = 3 WHERE id = $1', [persons[1].id]);
    await client.query("INSERT INTO person_relation(family_id,from_person_id,to_person_id,relation_type) VALUES($1,$2,$3,'parent')", [family.id, persons[0].id, persons[1].id]);
    const historical = await new FamilyImportService(database).importAsNewFamily(await families.export(Number(family.id)));
    const roundTrip = await families.export(Number(historical.family.id));
    const parent = roundTrip.people.find(p => p.name === persons[0].name);
    const child = roundTrip.people.find(p => p.name === persons[1].name);
    assert.equal(parent.generation, 1);
    assert.equal(child.generation, 3);
    assert.ok(roundTrip.relations.some(r => Number(r.from_person_id) === Number(parent.id) && Number(r.to_person_id) === Number(child.id)));
    assert.ok((await validation.anomalies(Number(historical.family.id), 0)).anomalies.some(a => a.type === 'generation_mismatch'));
    console.log('PASS: cross-family constraints, 125 review results, confirmation beyond first page, export/import confirmation remapping, historical generations');
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
