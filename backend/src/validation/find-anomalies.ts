import { createHash } from 'node:crypto';
import { QueryableDatabase } from '../database/database.service';

export async function findAnomalies(database: QueryableDatabase, familyId: number, limit: number) {
  const cappedLimit = Math.max(1, Math.min(limit || 100, 500));
  const anomalies: Array<{
    type: string;
    personId?: number;
    personIds?: number[];
    relationId?: number;
    message: string;
    details: Record<string, string | number | null>;
  }> = [];

  const missingSource = await database.query(
    `
    SELECT id, name FROM person
    WHERE family_id = $1 AND NULLIF(TRIM(COALESCE(remark, '')), '') IS NULL
    ORDER BY id
    `,
    [familyId],
  );
  anomalies.push(
    ...missingSource.rows.map((row) => ({
      type: 'missing_source',
      personId: row.id,
      message: `${row.name} 缺失备注`,
      details: { name: row.name },
    })),
  );

  const duplicates = await database.query(
    `
    SELECT name, generation, COUNT(*) AS count, json_group_array(id ORDER BY id) AS ids
    FROM person
    WHERE family_id = $1
    GROUP BY name, generation
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC, name
    `,
    [familyId],
  );
  anomalies.push(
    ...duplicates.rows.map((row) => ({
      type: 'duplicate_person',
      personId: JSON.parse(row.ids)[0],
      personIds: JSON.parse(row.ids),
      details: {
        name: row.name,
        generation: row.generation,
        count: row.count,
      },
      message: `${row.name} 第 ${row.generation ?? '-'} 世疑似重复 ${row.count} 人`,
    })),
  );

  const mismatches = await database.query(
    `
    SELECT
      r.id AS relation_id,
      parent.id AS parent_id,
      child.id AS child_id,
      parent.name AS parent_name,
      child.name AS child_name,
      parent.generation AS parent_generation,
      child.generation AS child_generation
    FROM person_relation r
    JOIN person parent ON parent.id = r.from_person_id
    JOIN person child ON child.id = r.to_person_id
    WHERE r.family_id = $1
      AND r.relation_type = 'parent'
      AND parent.generation IS NOT NULL
      AND child.generation IS NOT NULL
      AND child.generation <> parent.generation + 1
    ORDER BY r.id
    `,
    [familyId],
  );
  anomalies.push(
    ...mismatches.rows.map((row) => ({
      type: 'generation_mismatch',
      personId: row.child_id,
      relationId: row.relation_id,
      details: {
        parent: row.parent_name,
        parentGeneration: row.parent_generation,
        child: row.child_name,
        childGeneration: row.child_generation,
      },
      message: `${row.parent_name}(${row.parent_generation}) -> ${row.child_name}(${row.child_generation}) 世代不连续`,
    })),
  );

  const people = await database.query('SELECT * FROM person WHERE family_id = $1 ORDER BY id', [
    familyId,
  ]);
  const relations = await database.query(
    'SELECT * FROM person_relation WHERE family_id = $1 ORDER BY id',
    [familyId],
  );
  const confirmations = await database.query(
    'SELECT fingerprint FROM review_confirmation WHERE family_id = $1',
    [familyId],
  );
  const confirmed = new Set(confirmations.rows.map((r) => r.fingerprint));
  return {
    anomalies: (limit === 0 ? anomalies : anomalies.slice(0, cappedLimit)).map((item) => {
      const ids = new Set((item.personIds || [item.personId]).map(Number));
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify({
            item,
            people: people.rows.filter((p) => ids.has(Number(p.id))),
            relations: relations.rows.filter(
              (r) => ids.has(Number(r.from_person_id)) || ids.has(Number(r.to_person_id)),
            ),
          }),
        )
        .digest('hex');
      return { ...item, fingerprint, confirmed: confirmed.has(fingerprint) };
    }),
  };
}
