import { QueryableDatabase } from '../database/database.service';

export async function preGenealogyAncestors(db: QueryableDatabase, familyId: number) {
  const result = await db.query<{ id: number }>(
    `
    WITH RECURSIVE ancestors(id) AS (
      SELECT id FROM person WHERE family_id = $1 AND generation = 1
      UNION
      SELECT parent.id FROM ancestors a
      JOIN person_relation r ON r.to_person_id = a.id AND r.family_id = $1 AND r.relation_type = 'parent'
      JOIN person parent ON parent.id = r.from_person_id AND parent.family_id = $1
      WHERE parent.generation IS NULL
    )
    SELECT p.id FROM ancestors a JOIN person p ON p.id = a.id WHERE p.generation IS NULL
  `,
    [familyId],
  );
  return new Set(result.rows.map((row) => Number(row.id)));
}
