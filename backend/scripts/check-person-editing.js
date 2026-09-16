const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { createTestDatabase } = require('./sqlite-test-database');
const { PersonsService } = require('../dist/persons/persons.service');
async function main() {
  const client = createTestDatabase();

  await client.query('BEGIN');
  let sequence = 0;
  const db = { query: (s,a) => client.query(s,a), transaction: async fn => {
    const sp = `editor_${sequence++}`;
    await client.query(`SAVEPOINT ${sp}`);
    try { const result = await fn(db); await client.query(`RELEASE SAVEPOINT ${sp}`); return result; }
    catch(e) { await client.query(`ROLLBACK TO SAVEPOINT ${sp}`); throw e; }
  } };
  try {
    const family = (await client.query('INSERT INTO family(name,person_prefix) VALUES($1,$2) RETURNING id', ['Editor test',randomBytes(3).toString('hex')])).rows[0].id;
    const service = new PersonsService(db);
    const father = (await service.create({family_id:family,name:'Father',gender:'male',generation:2})).person;
    const mother = (await service.create({family_id:family,name:'Mother',gender:'female',generation:2,relative_id:father.id,relative_role:'spouse'})).person;
    const child = (await service.create({family_id:family,name:'Child',generation:3,relative_id:father.id,relative_role:'child'})).person;
    assert.equal((await service.get(child.id)).relations.length,2);
    assert.ok((await service.get(child.id)).relations.some(r=>r.from_person_id===mother.id && r.origin==='single_spouse'));
    const before = (await client.query('SELECT person_next_number FROM family WHERE id=$1',[family])).rows[0].person_next_number;
    await assert.rejects(service.create({family_id:family,name:'Rejected',generation:8,relative_id:father.id,relative_role:'child'}));
    assert.equal((await client.query('SELECT count(*) n FROM person WHERE family_id=$1',[family])).rows[0].n,3);
    assert.equal((await client.query('SELECT person_next_number FROM family WHERE id=$1',[family])).rows[0].person_next_number,before);
    await client.query('UPDATE person SET generation=7 WHERE id=$1',[child.id]);
    assert.equal((await service.update(child.id,{remark:'Preserved historic generation'})).person.remark,'Preserved historic generation');
    await assert.rejects(service.update(child.id,{generation:8}));
    const chosen = (await service.create({ family_id:family, name:'Chosen mother', gender:'female', generation:2 })).person;
    const linked = (await service.create({ family_id:family, name:'Both parents', generation:3, links:[{person_id:father.id,role:'parent'},{person_id:chosen.id,role:'parent'}] })).person;
    const parents = (await service.get(linked.id)).relations;
    assert.equal(parents.length,2);
    assert.ok(parents.every(r=>r.origin==='manual'));
    assert.ok(parents.some(r=>r.from_person_id===chosen.id));
    const fatherEdge = parents.find(r=>r.from_person_id===father.id).id;
    await service.update(linked.id,{links:[{person_id:father.id,role:'parent'},{person_id:mother.id,role:'parent'}]});
    const changed = (await service.get(linked.id)).relations;
    assert.ok(changed.some(r=>r.id===fatherEdge));
    assert.ok(changed.some(r=>r.from_person_id===mother.id));
    assert.ok(!changed.some(r=>r.from_person_id===chosen.id));
    await assert.rejects(service.update(linked.id,{links:[{person_id:linked.id,role:'parent'}]}));
    assert.deepEqual((await service.get(linked.id)).relations.map(r=>r.id),changed.map(r=>r.id));
    await service.update(linked.id,{links:[]});
    assert.equal((await service.get(linked.id)).relations.length,0);
    const oldCount = (await client.query('SELECT count(*) n FROM person WHERE family_id=$1',[family])).rows[0].n;
    await assert.rejects(service.create({ family_id:family, name:'Duplicate links', generation:3, links:[{person_id:father.id,role:'parent'},{person_id:father.id,role:'parent'}] }));
    assert.equal((await client.query('SELECT count(*) n FROM person WHERE family_id=$1',[family])).rows[0].n,oldCount);
    console.log('PASS: standalone creation, new spouse/child, automatic mother, atomic failure, historical notes edit, changed-generation validation');
  } finally { await client.query('ROLLBACK'); await client.end(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
