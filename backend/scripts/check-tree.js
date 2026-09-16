const assert=require('node:assert/strict');
const { createTestDatabase } = require('./sqlite-test-database');
const {randomBytes}=require('node:crypto');
const {TreeService}=require('../dist/graph/tree.service');
(async()=>{
 const c=createTestDatabase();await c.query('BEGIN');
 try {
  const f=(await c.query('INSERT INTO family(name,person_prefix) VALUES($1,$2) RETURNING id',['Tree fixture',randomBytes(3).toString('hex')])).rows[0].id;
  const p=(await c.query("WITH RECURSIVE numbers(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM numbers WHERE n<26) INSERT INTO person(family_id,person_no,name,generation) SELECT $1,$2||'-'||printf('%08d',n),'Node '||n,CASE WHEN n=1 THEN 1 ELSE 2 END FROM numbers RETURNING *",[f,randomBytes(3).toString('hex')])).rows;
  for(const child of p.slice(1))await c.query("INSERT INTO person_relation(family_id,from_person_id,to_person_id,relation_type) VALUES($1,$2,$3,'parent')",[f,p[0].id,child.id]);
  await c.query("INSERT INTO person_relation(family_id,from_person_id,to_person_id,relation_type) VALUES($1,$2,$3,'spouse')",[f,p[1].id,p[2].id]);
  const service=new TreeService(c);const first=await service.branch(f,p[0].id);assert.equal(first.children.length,20);assert.equal(first.nextOffset,20);assert.equal(first.children[0].remark,undefined);
  assert.equal(first.children[0].spouses[0].id,p[2].id);
  assert.equal(first.children[0].spouses[0].remark,undefined);
  // Spouses are a complete summary, including for unexpanded child nodes.
  // Use more than a page and both relationship directions to catch truncation.
  const partners=(await c.query("WITH RECURSIVE numbers(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM numbers WHERE n<45) INSERT INTO person(family_id,person_no,name,generation) SELECT $1,$2||'-'||printf('%08d',n),'Partner '||n,1 FROM numbers RETURNING *",[f,randomBytes(3).toString('hex')])).rows;
  for(const [index,partner] of partners.entries()){
   for(const owner of [p[0],p[1]]){
    const pair=index%2 ? [partner.id,owner.id] : [owner.id,partner.id];
    await c.query("INSERT INTO person_relation(family_id,from_person_id,to_person_id,relation_type) VALUES($1,$2,$3,'spouse')",[f,...pair]);
   }
  }
  const complete=await service.branch(f,p[0].id);
  assert.deepEqual(complete.spouses.map(s=>s.id),partners.map(p=>p.id));
  assert.deepEqual(complete.children[0].spouses.map(s=>s.id),[p[2].id,...partners.map(p=>p.id)]);
  assert.deepEqual((await service.branch(f,p[1].id)).spouses,complete.children[0].spouses);
  assert.equal(complete.children.length,20);
  assert.equal(complete.nextOffset,20);
  assert.deepEqual(await service.findPath(f,p[0].id,p[25].id),{found:true,path:[p[0].id,p[25].id].map(Number),spouseId:null});
  assert.deepEqual(await service.findPath(f,p[0].id,partners[44].id),{found:true,path:[Number(p[0].id)],spouseId:Number(partners[44].id)});
  assert.equal((await service.findPath(f,p[1].id,p[25].id)).found,false);
  await assert.rejects(service.findPath(f,p[0].id,-1));
  const second=await service.branch(f,p[0].id,20);assert.equal(second.children.length,5);assert.equal(second.nextOffset,null);
  assert.equal((await service.branch(f,p[1].id)).children.length,0);
  await assert.rejects(service.branch(f,-1));
  assert.equal((await service.branch(f)).person.id,p[0].id);
  console.log('PASS: bounded child pages, complete root/child spouses beyond 20, root choice, leaf, family isolation, summary-only payload');
 }finally{await c.query('ROLLBACK');await c.end();}
})().catch(e=>{console.error(e);process.exitCode=1;});
