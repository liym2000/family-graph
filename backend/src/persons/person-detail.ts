import { NotFoundException } from '@nestjs/common';
import { Person } from '../common/types';
import { QueryableDatabase } from '../database/database.service';
import { preGenealogyAncestors } from './pre-genealogy-ancestors';

export async function getPerson(db: QueryableDatabase, id: number) {
  const person = await db.query<Person>('SELECT * FROM person WHERE id = $1', [id]);
  if (!person.rowCount) throw new NotFoundException('person not found');
  const relations = await db.query(
    `
    SELECT
      r.*,
      fp.name AS from_name,
      fp.person_no AS from_person_no,
      tp.name AS to_name,
      tp.person_no AS to_person_no,
      fp.gender AS from_gender,
      tp.gender AS to_gender,
      EXISTS (
        SELECT 1 FROM person_relation direct_parent
        WHERE direct_parent.family_id = r.family_id
          AND direct_parent.relation_type = 'parent'
          AND direct_parent.origin = 'manual'
          AND direct_parent.to_person_id = r.to_person_id
          AND direct_parent.from_person_id <> r.from_person_id
          AND (
            SELECT COUNT(DISTINCT CASE
              WHEN spouse.from_person_id = direct_parent.from_person_id THEN spouse.to_person_id
              ELSE spouse.from_person_id END)
            FROM person_relation spouse
            WHERE spouse.family_id = r.family_id
              AND spouse.relation_type = 'spouse'
              AND (spouse.from_person_id = direct_parent.from_person_id
                OR spouse.to_person_id = direct_parent.from_person_id)
          ) > 1
      ) AS adjustment_allowed
    FROM person_relation r
    JOIN person fp ON fp.id = r.from_person_id
    JOIN person tp ON tp.id = r.to_person_id
    WHERE r.from_person_id = $1 OR r.to_person_id = $1
    ORDER BY r.relation_type, r.id
    `,
    [id],
  );
  const siblings = await db.query<Person>(
    `SELECT DISTINCT sibling.*
     FROM person_relation own_parent
     JOIN person father ON father.id = own_parent.from_person_id
     JOIN person_relation other_child
       ON other_child.from_person_id = father.id
       AND other_child.relation_type = 'parent'
       AND other_child.family_id = own_parent.family_id
     JOIN person sibling ON sibling.id = other_child.to_person_id
     WHERE own_parent.to_person_id = $1
       AND own_parent.relation_type = 'parent'
       AND father.gender = 'male'
       AND own_parent.family_id = $2
       AND father.family_id = $2
       AND sibling.family_id = $2
       AND sibling.id <> $1
     ORDER BY sibling.id`,
    [id, person.rows[0].family_id],
  );
  const ancestors = await preGenealogyAncestors(db, person.rows[0].family_id);
  return {
    person: { ...person.rows[0], is_pre_genealogy: ancestors.has(Number(id)) },
    relations: relations.rows,
    siblings: siblings.rows,
  };
}
