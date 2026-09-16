// Creates synthetic data only; never opens or overwrites the application's database.
const { DatabaseSync } = require('node:sqlite');
const { mkdirSync, openSync, closeSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const { initializeSchema, installTriggers } = require('../dist/database/sqlite-schema');
const file = resolve(__dirname, '../../data/demo/sqlite/family-graph.sqlite');
mkdirSync(dirname(file), { recursive: true });
closeSync(openSync(file, 'wx'));
const db = new DatabaseSync(file);
try {
  db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
  initializeSchema(db);
  installTriggers(db);
  const family = Number(db.prepare('INSERT INTO family(name,surname,person_prefix,remark) VALUES(?,?,?,?)')
    .run('虚构演示家谱', '示', 'demo01', '全部人物与关系均为程序生成，不对应真实家谱。').lastInsertRowid);
  const person = db.prepare('INSERT INTO person(family_id,person_no,name,generation,gender,remark) VALUES(?,?,?,?,?,?)');
  const relation = db.prepare('INSERT INTO person_relation(family_id,from_person_id,to_person_id,relation_type) VALUES(?,?,?,?)');
  let serial = 0;
  function add(generation, gender) {
    serial++;
    return Number(person.run(family, `demo01-${String(serial).padStart(8, '0')}`, `示例人物${serial}`, generation, gender, '仅用于演示的虚构人物。').lastInsertRowid);
  }
  function branch(generation, parent, otherParent) {
    const id = add(generation, 'male');
    const spouse = add(generation, 'female');
    relation.run(family, id, spouse, 'spouse');
    if (parent) {
      relation.run(family, parent, id, 'parent');
      relation.run(family, otherParent, id, 'parent');
    }
    if (generation < 4) for (let i = 0; i < 3; i++) branch(generation + 1, id, spouse);
  }
  branch(1);
  db.prepare('UPDATE family SET person_next_number=? WHERE id=?').run(serial + 1, family);
  if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) throw Error('Demo integrity check failed');
  db.exec('COMMIT');
  console.log(`Created ${serial} synthetic people in data/demo/sqlite/family-graph.sqlite`);
} finally { db.close(); }
