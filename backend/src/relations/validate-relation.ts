import { BadRequestException } from '@nestjs/common';
import { RelationType } from '../common/types';
import { QueryableDatabase } from '../database/database.service';

export async function validateRelation(
  input: {
    familyId: number;
    fromPersonId: number;
    toPersonId: number;
    relationType?: RelationType;
  },
  database: QueryableDatabase,
) {
  if (!input.familyId) throw new BadRequestException('familyId is required');
  if (!input.fromPersonId || !input.toPersonId)
    throw new BadRequestException('fromPersonId and toPersonId are required');
  if (input.fromPersonId === input.toPersonId)
    throw new BadRequestException('不能给同一个人绑定关系');
  if (input.relationType !== 'parent' && input.relationType !== 'spouse') {
    throw new BadRequestException('unsupported relationType');
  }

  const people = await database.query(
    'SELECT id, family_id, generation FROM person WHERE id IN (SELECT value FROM json_each($1))',
    [[input.fromPersonId, input.toPersonId]],
  );
  if (people.rowCount !== 2) throw new BadRequestException('person not found');
  const byId = new Map(people.rows.map((row) => [Number(row.id), row]));
  const from = byId.get(input.fromPersonId);
  const to = byId.get(input.toPersonId);
  if (
    !from ||
    !to ||
    Number(from.family_id) !== input.familyId ||
    Number(to.family_id) !== input.familyId
  ) {
    throw new BadRequestException('两个人必须属于当前家谱');
  }

  const duplicate = await database.query(
    input.relationType === 'spouse'
      ? `
        SELECT id FROM person_relation
        WHERE family_id = $1 AND relation_type = 'spouse'
          AND (
            (from_person_id = $2 AND to_person_id = $3)
            OR (from_person_id = $3 AND to_person_id = $2)
          )
        LIMIT 1
      `
      : `
        SELECT id FROM person_relation
        WHERE family_id = $1 AND relation_type = 'parent' AND from_person_id = $2 AND to_person_id = $3
        LIMIT 1
      `,
    [input.familyId, input.fromPersonId, input.toPersonId],
  );
  if (duplicate.rowCount) throw new BadRequestException('关系已存在');

  if (input.relationType === 'parent') {
    const cycle = await database.query(
      `
      WITH RECURSIVE descendants(id) AS (
        SELECT to_person_id
        FROM person_relation
        WHERE family_id = $1 AND relation_type = 'parent' AND from_person_id = $2
        UNION
        SELECT r.to_person_id
        FROM person_relation r
        JOIN descendants d ON d.id = r.from_person_id
        WHERE r.family_id = $1 AND r.relation_type = 'parent'
      )
      SELECT 1 FROM descendants WHERE id = $3 LIMIT 1
      `,
      [input.familyId, input.toPersonId, input.fromPersonId],
    );
    if (cycle.rowCount) throw new BadRequestException('不能建立循环父子关系');

    if (
      from.generation !== null &&
      to.generation !== null &&
      Number(to.generation) !== Number(from.generation) + 1
    ) {
      throw new BadRequestException('子女世代必须比父母晚一世');
    }
  }
}
