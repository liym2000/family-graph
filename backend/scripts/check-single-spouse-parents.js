// Exercises real SQL against temporary tables only. Always rolls back.
const assert = require('node:assert/strict');
const { createTestDatabase } = require('./sqlite-test-database');
const { RelationsService } = require('../dist/relations/relations.service');

async function main() {
  const client = createTestDatabase();
  try {
    await client.query('BEGIN');
    await client.query("INSERT INTO family(id,name,person_prefix) VALUES(999999,'Fixture','test00')");
    for (let id=1; id<=5; id++) await client.query('INSERT INTO person(id,family_id,person_no,name,generation) VALUES($1,999999,$2,$3,$4)',[id,`test00-${String(id).padStart(8,'0')}`,`Fixture ${id}`,id<=3?1:2]);
    const service = new RelationsService({ transaction: (fn) => fn(client) });
    const create = (fromPersonId, toPersonId, relationType) =>
      service.create({
        familyId: 999999,
        fromPersonId,
        toPersonId,
        relationType,
      });
    const parents = async () =>
      (
        await client.query(
          "SELECT * FROM person_relation WHERE relation_type = 'parent' ORDER BY from_person_id, to_person_id",
        )
      ).rows;
    await create(1, 2, 'spouse');
    await create(1, 4, 'parent');
    assert.deepEqual(
      (await parents()).map((r) => [Number(r.from_person_id), r.origin]),
      [
        [1, 'manual'],
        [2, 'single_spouse'],
      ],
    );
    const autoId = (await parents()).find(
      (r) => r.origin === 'single_spouse',
    ).id;
    const secondSpouse = await create(1, 3, 'spouse');
    assert.equal((await parents()).length, 2);
    await service.delete(secondSpouse.relation.id);
    assert.equal((await parents()).length, 2);
    assert.equal(
      (await parents()).find((r) => r.origin === 'single_spouse').id,
      autoId,
    );
    await create(2, 4, 'parent'); // Confirm the automatic mother link.
    await create(1, 3, 'spouse');
    assert.equal(
      (await parents()).filter((r) => r.origin === 'manual').length,
      2,
    );
    await create(1, 5, 'parent'); // Multiple spouses: first recorded spouse is the default.
    assert.equal(
      (await parents()).filter((r) => Number(r.to_person_id) === 5).length,
      2,
    );
    await create(3, 5, 'parent'); // Explicit mother can be chosen.
    assert.equal(
      (await parents()).filter((r) => Number(r.to_person_id) === 5).length,
      2,
    );
    assert.deepEqual((await parents()).filter(r => Number(r.to_person_id) === 5).map(r=>Number(r.from_person_id)), [1,3]);
    const extra = (
      await client.query(
        "SELECT id FROM person_relation WHERE relation_type='spouse' AND to_person_id=3",
      )
    ).rows[0];
    await service.delete(extra.id);
    // Explicit different mother blocks inference to spouse 2.
    assert.equal(
      (await parents()).filter((r) => Number(r.to_person_id) === 5).length,
      2,
    );
    const mother = (await parents()).find(
      (r) => Number(r.from_person_id) === 2,
    );
    await service.delete(mother.id);
    await create(2, 3, 'spouse'); // Triggers reconciliation again; removed link stays excluded.
    assert.equal(
      (await parents()).some(
        (r) => Number(r.from_person_id) === 2 && Number(r.to_person_id) === 4,
      ),
      false,
    );
    console.log(
      'Real SQL workflow passed: unique spouse, multiple spouses, confirmation, explicit mother, exclusions. All temporary changes rolled back.',
    );
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
