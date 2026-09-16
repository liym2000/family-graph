import { DatabaseSync } from 'node:sqlite';

export const SCHEMA_VERSION = 1;
const timestamp = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

// PostgreSQL migrations remain immutable rollback history. SQLite starts at this baseline.
export function initializeSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE family (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, surname TEXT,
      person_prefix TEXT NOT NULL UNIQUE CHECK(length(person_prefix)=6 AND person_prefix NOT GLOB '*[^a-z0-9]*'),
      person_next_number INTEGER NOT NULL DEFAULT 1 CHECK(person_next_number>0), remark TEXT,
      created_at TEXT NOT NULL DEFAULT (${timestamp}), updated_at TEXT NOT NULL DEFAULT (${timestamp})
    );
    CREATE TABLE person (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL REFERENCES family(id) ON DELETE CASCADE,
      person_no TEXT NOT NULL UNIQUE CHECK(length(person_no)=15 AND substr(person_no,7,1)='-' AND
        substr(person_no,1,6) NOT GLOB '*[^a-z0-9]*' AND substr(person_no,8) NOT GLOB '*[^0-9]*'),
      name TEXT NOT NULL, generation INTEGER CHECK(generation IS NULL OR generation>0),
      gender TEXT NOT NULL DEFAULT 'unknown' CHECK(gender IN ('male','female','unknown')),
      remark TEXT, source TEXT,
      created_at TEXT NOT NULL DEFAULT (${timestamp}), updated_at TEXT NOT NULL DEFAULT (${timestamp}),
      UNIQUE(family_id,id)
    );
    CREATE TABLE person_relation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL REFERENCES family(id) ON DELETE CASCADE,
      from_person_id INTEGER NOT NULL, to_person_id INTEGER NOT NULL,
      relation_type TEXT NOT NULL CHECK(relation_type IN ('parent','spouse')),
      created_at TEXT NOT NULL DEFAULT (${timestamp}),
      origin TEXT NOT NULL DEFAULT 'manual' CHECK(origin IN ('manual','single_spouse') AND (origin='manual' OR relation_type='parent')),
      CHECK(from_person_id<>to_person_id),
      FOREIGN KEY(family_id,from_person_id) REFERENCES person(family_id,id) ON DELETE CASCADE,
      FOREIGN KEY(family_id,to_person_id) REFERENCES person(family_id,id) ON DELETE CASCADE
    );
    CREATE TABLE auto_parent_exclusion (
      family_id INTEGER NOT NULL REFERENCES family(id) ON DELETE CASCADE,
      from_person_id INTEGER NOT NULL, to_person_id INTEGER NOT NULL,
      PRIMARY KEY(family_id,from_person_id,to_person_id),
      FOREIGN KEY(family_id,from_person_id) REFERENCES person(family_id,id) ON DELETE CASCADE,
      FOREIGN KEY(family_id,to_person_id) REFERENCES person(family_id,id) ON DELETE CASCADE
    );
    CREATE TABLE review_confirmation (
      family_id INTEGER NOT NULL REFERENCES family(id) ON DELETE CASCADE, fingerprint TEXT NOT NULL,
      confirmed_at TEXT NOT NULL DEFAULT (${timestamp}), PRIMARY KEY(family_id,fingerprint)
    );
    CREATE TABLE archive_person_notes_before_merge (id INTEGER, source TEXT, remark TEXT);
    CREATE TABLE archive_postgres_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, run_on TEXT NOT NULL);
    CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO app_metadata VALUES ('person_column_order', '["id","family_id","person_no","name","generation","gender","remark","source","created_at","updated_at"]');
    CREATE INDEX idx_person_family_name ON person(family_id,name);
    CREATE INDEX idx_person_family_no ON person(family_id,person_no);
    CREATE INDEX idx_person_family_generation ON person(family_id,generation);
    CREATE INDEX idx_relation_family_from ON person_relation(family_id,from_person_id,relation_type);
    CREATE INDEX idx_relation_family_to ON person_relation(family_id,to_person_id,relation_type);
    CREATE UNIQUE INDEX uq_parent_relation ON person_relation(family_id,from_person_id,to_person_id) WHERE relation_type='parent';
    CREATE UNIQUE INDEX uq_spouse_relation ON person_relation(family_id,min(from_person_id,to_person_id),max(from_person_id,to_person_id)) WHERE relation_type='spouse';
    PRAGMA user_version = ${SCHEMA_VERSION};
  `);
}

// Installed after migration data is copied so historical timestamps remain exact.
export function installTriggers(db: DatabaseSync) {
  for (const table of ['family', 'person']) {
    db.exec(`CREATE TRIGGER ${table}_updated AFTER UPDATE ON ${table}
      WHEN NEW.updated_at = OLD.updated_at
      BEGIN UPDATE ${table} SET updated_at=(${timestamp}) WHERE id=NEW.id; END;`);
  }
  for (const action of ['INSERT', 'UPDATE']) {
    db.exec(`CREATE TRIGGER person_notes_${action.toLowerCase()} AFTER ${action} ON person
      WHEN NEW.source IS NOT NULL
      BEGIN UPDATE person SET remark=CASE WHEN trim(NEW.source)<>''
        THEN '来源：' || NEW.source || CASE WHEN coalesce(NEW.remark,'')<>'' THEN char(10)||NEW.remark ELSE '' END
        ELSE NEW.remark END, source=NULL WHERE id=NEW.id; END;`);
  }
  for (const table of ['person', 'person_relation']) {
    for (const action of ['INSERT', 'UPDATE', 'DELETE']) {
      const ids =
        action === 'INSERT'
          ? 'NEW.family_id'
          : action === 'DELETE'
            ? 'OLD.family_id'
            : 'OLD.family_id,NEW.family_id';
      db.exec(`CREATE TRIGGER ${table}_activity_${action.toLowerCase()} AFTER ${action} ON ${table}
        BEGIN UPDATE family SET updated_at=(${timestamp}) WHERE id IN (${ids}); END;`);
    }
  }
}
