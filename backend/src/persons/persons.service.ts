import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreatePersonDto, UpdatePersonDto } from '../common/dto';
import { Gender, Person } from '../common/types';
import { DatabaseService, QueryableDatabase } from '../database/database.service';
import { syncSingleSpouseParents } from '../relations/single-spouse-parents';
import { validateRelation } from '../relations/validate-relation';
import { getPerson } from './person-detail';
import { searchPersons } from './person-search';

const VALID_GENDERS = new Set(['male', 'female', 'unknown']);

function normalizeGender(value: unknown): Gender {
  if (value === 'male' || value === 'female' || value === 'unknown') return value;
  if (value === 'M') return 'male';
  if (value === 'F') return 'female';
  return 'unknown';
}

@Injectable()
export class PersonsService {
  constructor(private readonly db: DatabaseService) {}

  get(id: number) {
    return getPerson(this.db, id);
  }

  search(input: Parameters<typeof searchPersons>[1]) {
    return searchPersons(this.db, input);
  }

  async create(body: CreatePersonDto) {
    const familyId = body.family_id;
    const name = String(body.name ?? '').trim();
    if (!familyId) throw new BadRequestException('family_id is required');
    if (!name) throw new BadRequestException('name is required');
    const gender = normalizeGender(body.gender);
    if (!VALID_GENDERS.has(gender)) throw new BadRequestException('invalid gender');
    return this.db.transaction(async (client) => {
      const allocated = await client.query(
        'UPDATE family SET person_next_number=person_next_number+1 WHERE id=$1 RETURNING person_prefix, person_next_number-1 AS next_number',
        [familyId],
      );
      if (!allocated.rowCount) throw new NotFoundException('family not found');
      const sequence = allocated.rows[0];
      const result = await client.query<Person>(
        'INSERT INTO person (family_id,person_no,name,generation,gender,remark,source) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [
          familyId,
          `${sequence.person_prefix}-${String(sequence.next_number).padStart(8, '0')}`,
          name,
          body.generation ?? null,
          gender,
          body.remark ?? null,
          body.source ?? null,
        ],
      );
      const links = [...(body.links || [])];
      if (body.relative_id || body.relative_role) {
        if (!body.relative_id || !body.relative_role)
          throw new BadRequestException('relative_id and relative_role are required together');
        links.push({
          person_id: body.relative_id,
          role:
            body.relative_role === 'parent'
              ? 'child'
              : body.relative_role === 'child'
                ? 'parent'
                : 'spouse',
        });
      }
      for (const link of links) {
        const id = Number(result.rows[0].id);
        const from = link.role === 'parent' ? link.person_id : id;
        const to = link.role === 'parent' ? id : link.person_id;
        const type = link.role === 'spouse' ? 'spouse' : 'parent';
        await validateRelation(
          { familyId, fromPersonId: from, toPersonId: to, relationType: type },
          client,
        );
        await client.query(
          'INSERT INTO person_relation (family_id, from_person_id, to_person_id, relation_type) VALUES ($1, $2, $3, $4)',
          [familyId, from, to, type],
        );
      }
      if (links.length) await syncSingleSpouseParents(client, familyId);
      return { person: result.rows[0] };
    });
  }

  async update(id: number, body: UpdatePersonDto) {
    return this.db.transaction(async (client) => {
      const found = await client.query('SELECT family_id FROM person WHERE id = $1', [id]);
      if (!found.rowCount) throw new NotFoundException('person not found');

      const current = await client.query<Person>('SELECT * FROM person WHERE id = $1', [id]);
      if (!current.rowCount) throw new NotFoundException('person not found');
      const person = current.rows[0];
      const additions: Array<{ from: number; to: number; type: 'parent' | 'spouse' }> = [];
      if (body.links !== undefined) {
        const existing = await client.query(
          'SELECT * FROM person_relation WHERE family_id=$1 AND (from_person_id=$2 OR to_person_id=$2)',
          [person.family_id, id],
        );
        const retained = new Set<number>();
        const desired = new Set<string>();
        for (const link of body.links) {
          const from = link.role === 'parent' ? link.person_id : id;
          const to = link.role === 'parent' ? id : link.person_id;
          const type = link.role === 'spouse' ? 'spouse' : 'parent';
          const key = `${type}:${from}:${to}`;
          if (desired.has(key)) throw new BadRequestException('不能重复添加同一关系');
          desired.add(key);
          const found = existing.rows.find(
            (r) =>
              r.relation_type === type &&
              ((Number(r.from_person_id) === from && Number(r.to_person_id) === to) ||
                (type === 'spouse' &&
                  Number(r.from_person_id) === to &&
                  Number(r.to_person_id) === from)),
          );
          if (found) retained.add(Number(found.id));
          else additions.push({ from, to, type });
        }
        for (const row of existing.rows)
          if (!retained.has(Number(row.id))) {
            await client.query('DELETE FROM person_relation WHERE id=$1', [row.id]);
            if (row.relation_type === 'parent')
              await client.query(
                'INSERT INTO auto_parent_exclusion(family_id,from_person_id,to_person_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
                [person.family_id, row.from_person_id, row.to_person_id],
              );
          }
      }
      const next = {
        name: body.name !== undefined ? String(body.name).trim() : person.name,
        generation: body.generation !== undefined ? body.generation : person.generation,
        gender: body.gender !== undefined ? normalizeGender(body.gender) : person.gender,
        remark: body.remark !== undefined ? body.remark : person.remark,
        source: body.source !== undefined ? body.source : person.source,
      };
      if (!next.name) throw new BadRequestException('name is required');
      if (next.generation !== person.generation)
        await this.validateGenerationUpdate(id, person.family_id, next.generation, client);
      const result = await client.query<Person>(
        `
        UPDATE person
        SET name = $1, generation = $2, gender = $3, remark = $4, source = $5, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = $6
        RETURNING *
        `,
        [next.name, next.generation, next.gender, next.remark, next.source, id],
      );
      for (const { from, to, type } of additions) {
        await validateRelation(
          {
            familyId: Number(person.family_id),
            fromPersonId: from,
            toPersonId: to,
            relationType: type,
          },
          client,
        );
        await client.query(
          'INSERT INTO person_relation(family_id,from_person_id,to_person_id,relation_type) VALUES($1,$2,$3,$4)',
          [person.family_id, from, to, type],
        );
        if (type === 'parent')
          await client.query(
            'DELETE FROM auto_parent_exclusion WHERE family_id=$1 AND from_person_id=$2 AND to_person_id=$3',
            [person.family_id, from, to],
          );
      }
      await syncSingleSpouseParents(client, person.family_id);
      return { person: result.rows[0] };
    });
  }

  async delete(id: number) {
    return this.db.transaction(async (client) => {
      const found = await client.query('SELECT family_id FROM person WHERE id = $1', [id]);
      if (!found.rowCount) return { ok: true };
      const familyId = Number(found.rows[0].family_id);

      await client.query('DELETE FROM person WHERE id = $1', [id]);
      await syncSingleSpouseParents(client, familyId);
      return { ok: true };
    });
  }

  private async validateGenerationUpdate(
    personId: number,
    familyId: number,
    generation: number | null,
    database: QueryableDatabase = this.db,
  ) {
    if (generation === null) return;
    const rows = await database.query(
      `
      SELECT parent.id AS parent_id, child.id AS child_id, parent.generation AS parent_generation, child.generation AS child_generation
      FROM person_relation r
      JOIN person parent ON parent.id = r.from_person_id
      JOIN person child ON child.id = r.to_person_id
      WHERE r.family_id = $1 AND r.relation_type = 'parent' AND r.origin = 'manual' AND ($2 IN (parent.id, child.id))
      `,
      [familyId, personId],
    );
    for (const row of rows.rows) {
      const parentGeneration = row.parent_id === personId ? generation : row.parent_generation;
      const childGeneration = row.child_id === personId ? generation : row.child_generation;
      if (
        parentGeneration !== null &&
        childGeneration !== null &&
        childGeneration !== parentGeneration + 1
      ) {
        throw new BadRequestException('子女世代必须比父母晚一世');
      }
    }
  }
}
