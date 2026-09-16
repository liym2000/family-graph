import { BadRequestException, Injectable } from '@nestjs/common';
import { RelationType } from '../common/types';
import { DatabaseService, QueryableDatabase } from '../database/database.service';
import { syncSingleSpouseParents } from './single-spouse-parents';
import { validateRelation } from './validate-relation';

@Injectable()
export class RelationsService {
  constructor(private readonly db: DatabaseService) {}

  async create(input: {
    familyId: number;
    fromPersonId: number;
    toPersonId: number;
    relationType?: RelationType;
  }) {
    return this.db.transaction(async (client) => {
      if (input.relationType === 'parent') {
        const automatic = await client.query(
          "SELECT * FROM person_relation WHERE family_id = $1 AND from_person_id = $2 AND to_person_id = $3 AND relation_type = 'parent' AND origin = 'single_spouse'",
          [input.familyId, input.fromPersonId, input.toPersonId],
        );
        if (automatic.rowCount) {
          const promoted = await client.query(
            "UPDATE person_relation SET origin = 'manual' WHERE id = $1 RETURNING *",
            [automatic.rows[0].id],
          );
          const automaticParents = await syncSingleSpouseParents(client, input.familyId);
          return { relation: promoted.rows[0], automaticParents };
        }
      }
      await this.validate(input, client);
      const result = await client.query(
        `
        INSERT INTO person_relation (family_id, from_person_id, to_person_id, relation_type)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        `,
        [input.familyId, input.fromPersonId, input.toPersonId, input.relationType],
      );
      if (input.relationType === 'parent')
        await client.query(
          'DELETE FROM auto_parent_exclusion WHERE family_id = $1 AND from_person_id = $2 AND to_person_id = $3',
          [input.familyId, input.fromPersonId, input.toPersonId],
        );
      const automaticParents = await syncSingleSpouseParents(client, input.familyId);
      return { relation: result.rows[0], automaticParents };
    });
  }

  async delete(id: number) {
    return this.db.transaction(async (client) => {
      const found = await client.query('SELECT family_id FROM person_relation WHERE id = $1', [id]);
      if (!found.rowCount) return { ok: true };
      const familyId = Number(found.rows[0].family_id);

      const deleted = await client.query('DELETE FROM person_relation WHERE id = $1 RETURNING *', [
        id,
      ]);
      const relation = deleted.rows[0];
      if (relation?.relation_type === 'parent')
        await client.query(
          'INSERT INTO auto_parent_exclusion (family_id, from_person_id, to_person_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [familyId, relation.from_person_id, relation.to_person_id],
        );
      const automaticParents = await syncSingleSpouseParents(client, familyId);
      return { ok: true, automaticParents };
    });
  }

  async adjustParent(id: number, parentId: number) {
    return this.db.transaction(async (client) => {
      const found = await client.query('SELECT * FROM person_relation WHERE id = $1', [id]);
      if (!found.rowCount) throw new BadRequestException('关系已变化，请刷新');
      const familyId = Number(found.rows[0].family_id);

      const current = await client.query('SELECT * FROM person_relation WHERE id = $1', [id]);
      const old = current.rows[0];
      if (!old || old.relation_type !== 'parent') throw new BadRequestException('只能调整亲子关系');
      await client.query('DELETE FROM person_relation WHERE id = $1', [id]);
      await this.validate(
        {
          familyId,
          fromPersonId: parentId,
          toPersonId: Number(old.to_person_id),
          relationType: 'parent',
        },
        client,
      );
      await client.query(
        'INSERT INTO auto_parent_exclusion (family_id, from_person_id, to_person_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [familyId, old.from_person_id, old.to_person_id],
      );
      await client.query(
        'DELETE FROM auto_parent_exclusion WHERE family_id = $1 AND from_person_id = $2 AND to_person_id = $3',
        [familyId, parentId, old.to_person_id],
      );
      const result = await client.query(
        "INSERT INTO person_relation (family_id, from_person_id, to_person_id, relation_type, origin) VALUES ($1, $2, $3, 'parent', 'manual') RETURNING *",
        [familyId, parentId, old.to_person_id],
      );
      await syncSingleSpouseParents(client, familyId);
      return { relation: result.rows[0] };
    });
  }

  validate(input: Parameters<typeof validateRelation>[0], database: QueryableDatabase = this.db) {
    return validateRelation(input, database);
  }
}
