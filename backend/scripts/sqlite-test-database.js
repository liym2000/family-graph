// Each integration command gets an isolated in-memory database; no real data is opened.
const { DatabaseSync } = require('node:sqlite');
const { DatabaseClient } = require('../dist/database/database.service');
const { initializeSchema, installTriggers } = require('../dist/database/sqlite-schema');
function createTestDatabase() {
  const connection = new DatabaseSync(':memory:');
  connection.exec('PRAGMA foreign_keys=ON');
  initializeSchema(connection);
  installTriggers(connection);
  const client = new DatabaseClient(connection);
  return { query: (sql,args) => client.query(sql,args), exec: sql=>connection.exec(sql), end: async()=>connection.close() };
}
module.exports = {createTestDatabase};
