const assert = require('node:assert/strict');
const { createTestDatabase } = require('./sqlite-test-database');
const { searchPersons } = require('../dist/persons/person-search');
(async () => {
  const db = createTestDatabase();
  try {
    const family = (
      await db.query(
        "INSERT INTO family(name,person_prefix) VALUES('Search fixture','search') RETURNING id",
      )
    ).rows[0].id;
    const ids = [];
    for (const [i, [name, generation, remark]] of [
      ['Alex', 8, null],
      ['Alex', 2, null],
      ['Alex', null, null],
      ['Other', 1, 'Alex'],
      ['Alexander', 1, null],
    ].entries()) {
      ids.push(
        (
          await db.query(
            'INSERT INTO person(family_id,person_no,name,generation,remark) VALUES($1,$2,$3,$4,$5) RETURNING id',
            [family, `search-${String(i + 1).padStart(8, '0')}`, name, generation, remark],
          )
        ).rows[0].id,
      );
    }
    await db.query(
      "INSERT INTO person_relation(family_id,from_person_id,to_person_id,relation_type) VALUES($1,$2,$3,'spouse')",
      [family, ids[0], ids[3]],
    );
    const search = (extra = {}) =>
      searchPersons(db, { familyId: family, q: 'Alex', limit: 50, ...extra });
    const result = await search();
    assert.equal(result.total, 4);
    assert.deepEqual(
      result.results.map((p) => p.id),
      [ids[1], ids[0], ids[2], ids[4]],
    );
    assert.deepEqual(
      (await search({ sort: 'name' })).results.map((p) => p.id),
      [ids[1], ids[0], ids[2], ids[4]],
    );
    assert.deepEqual(
      (await search({ generation: 2 })).results.map((p) => p.id),
      [ids[1]],
    );
    assert.equal((await search({ q: 'search-00000001' })).total, 0);
    assert.equal((await search({ q: String(ids[0]) })).total, 0);
    assert.equal((await search({ limit: 1, offset: 1 })).results[0].id, ids[0]);
    for (const [parent, child] of [
      [ids[1], ids[0]],
      [ids[0], ids[4]],
    ]) {
      await db.query(
        "INSERT INTO person_relation(family_id,from_person_id,to_person_id,relation_type) VALUES($1,$2,$3,'parent')",
        [family, parent, child],
      );
    }
    assert.equal((await search({ q: 'Alexander', limit: 1 })).results[0].ancestor_generations, 2);
    assert.equal((await search({ generation: 2 })).results[0].ancestor_generations, 0);
    await db.query(
      "INSERT INTO person_relation(family_id,from_person_id,to_person_id,relation_type) VALUES($1,$2,$3,'parent')",
      [family, ids[0], ids[1]],
    );
    assert.equal((await search({ q: 'Alexander' })).results[0].ancestor_generations, null);
    assert.equal((await search({ sort: 'ancestor_generations_desc', limit: 1, offset: 0 })).total, 4);
    assert.equal((await search({ sort: 'ancestor_generations_desc', limit: 1 })).results[0].id, ids[2]);
    assert.equal((await search({ sort: 'children_count_desc', limit: 1 })).results[0].id, ids[0]);
    assert.equal((await search({ sort: 'generation_desc', limit: 1 })).results[0].id, ids[0]);
    assert.equal((await search({ gender: 'female' })).total, 0);
    assert.equal((await search({ gender: 'unknown', sort: 'descendant_generations_desc', limit: 1, offset: 1 })).results.length, 1);
    console.log('Person name search, filters, sorting and ancestry depth passed');
  } finally {
    await db.end();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
