import { Injectable } from '@nestjs/common';
import { ImportFamilyDto } from '../common/dto';
import { randomFamilyPrefix } from '../common/family-prefix';
import { DatabaseClient, DatabaseService } from '../database/database.service';
import { syncSingleSpouseParents } from '../relations/single-spouse-parents';
import { fail, normalizeFamilyImport, positiveInteger } from './import-format';
import { restoreImportReviews } from './import-reviews';

@Injectable()
export class FamilyImportService {
  constructor(private readonly database: DatabaseService) {}

  async importAsNewFamily(payload: ImportFamilyDto) {
    const normalized = normalizeFamilyImport(payload);

    return this.database.transaction(async (client) => {
      const prefix = await this.allocatePrefix(client, normalized.family.prefix);
      const prefixChanged = prefix !== normalized.family.prefix;
      const nextNumber = normalized.people.reduce(
        (max, person) => Math.max(max, Number(person.suffix) + 1),
        1,
      );

      const familyResult = await client.query(
        `
        INSERT INTO family (name, surname, person_prefix, person_next_number, remark)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        `,
        [
          normalized.family.name,
          normalized.family.surname,
          prefix,
          nextNumber,
          normalized.family.remark,
        ],
      );
      const family = familyResult.rows[0];
      const familyId = Number(family.id);
      const personIdMap = new Map<number, number>();

      for (const person of normalized.people) {
        const personNo = `${prefix}-${person.suffix}`;
        const result = await client.query(
          `
          INSERT INTO person (family_id, person_no, name, generation, gender, remark, source)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
          `,
          [
            familyId,
            personNo,
            person.name,
            person.generation,
            person.gender,
            person.remark,
            person.source,
          ],
        );
        personIdMap.set(person.oldId, Number(result.rows[0].id));
      }

      for (const relation of normalized.relations) {
        if (relation.origin === 'single_spouse') continue;
        await client.query(
          `
          INSERT INTO person_relation (family_id, from_person_id, to_person_id, relation_type)
          VALUES ($1, $2, $3, $4)
          `,
          [
            familyId,
            personIdMap.get(relation.fromId),
            personIdMap.get(relation.toId),
            relation.type,
          ],
        );
      }

      for (const [index, excluded] of (payload.excluded_auto_parents || []).entries()) {
        const fromId = positiveInteger(
          excluded.from_person_id,
          `excluded_auto_parents[${index}].from_person_id`,
        );
        const toId = positiveInteger(
          excluded.to_person_id,
          `excluded_auto_parents[${index}].to_person_id`,
        );
        if (!personIdMap.has(fromId) || !personIdMap.has(toId) || fromId === toId)
          fail('invalid excluded parent endpoints');
        await client.query(
          'INSERT INTO auto_parent_exclusion (family_id, from_person_id, to_person_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [familyId, personIdMap.get(fromId), personIdMap.get(toId)],
        );
      }
      const automaticParents = await syncSingleSpouseParents(client, familyId);
      await restoreImportReviews(client, familyId, personIdMap, payload.reviewed_issues);

      return {
        family,
        imported: {
          people: normalized.people.length,
          relations:
            normalized.relations.filter((r) => r.origin === 'manual').length +
            automaticParents.added,
        },
        prefixChanged,
        automaticParents,
      };
    });
  }

  private async allocatePrefix(client: DatabaseClient, preferred: string) {
    if (!(await this.prefixExists(client, preferred))) return preferred;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = randomFamilyPrefix();
      if (!(await this.prefixExists(client, candidate))) return candidate;
    }
    fail('failed to allocate a unique family prefix');
  }

  private async prefixExists(client: DatabaseClient, prefix: string) {
    const result = await client.query(
      `
      SELECT EXISTS (
        SELECT 1 FROM family WHERE person_prefix = $1
        UNION ALL
        SELECT 1 FROM person WHERE person_no LIKE $1 || '-%'
      ) AS "exists"
      `,
      [prefix],
    );
    return Boolean(result.rows[0].exists);
  }
}
