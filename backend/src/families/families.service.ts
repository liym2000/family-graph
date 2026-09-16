import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomFamilyPrefix } from '../common/family-prefix';
import { DatabaseService } from '../database/database.service';
import { findAnomalies } from '../validation/find-anomalies';
import { reviewIdentity } from '../validation/review-identity';

@Injectable()
export class FamiliesService {
  constructor(private readonly db: DatabaseService) {}

  async delete(id: number) {
    return this.db.transaction(async (client) => {
      const result = await client.query('DELETE FROM family WHERE id = $1 RETURNING id', [id]);
      if (!result.rowCount) throw new NotFoundException('family not found');
      return { ok: true };
    });
  }

  async list() {
    const result = await this.db.query(
      `
      SELECT
        f.*,
        (SELECT COUNT(*) FROM person p WHERE p.family_id = f.id) AS people_count,
        (SELECT COUNT(*) FROM person_relation r WHERE r.family_id = f.id) AS relation_count
      FROM family f
      ORDER BY f.id
      `,
    );
    return { families: result.rows };
  }

  async create(body: { name: string; surname?: string; remark?: string }) {
    const name = body.name?.trim();
    if (!name) throw new BadRequestException('name is required');
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const result = await this.db.query(
        `
        INSERT INTO family (name, surname, person_prefix, person_next_number, remark)
        VALUES ($1, $2, $3, 1, $4)
        ON CONFLICT (person_prefix) DO NOTHING
        RETURNING *
        `,
        [name, body.surname?.trim() || null, randomFamilyPrefix(), body.remark?.trim() || null],
      );
      if (result.rowCount) return { family: result.rows[0] };
    }
    throw new BadRequestException('failed to allocate family prefix');
  }

  async update(id: number, body: { name?: string; surname?: string; remark?: string }) {
    return this.db.transaction(async (client) => {
      const current = await client.query('SELECT * FROM family WHERE id = $1', [id]);
      if (!current.rowCount) throw new NotFoundException('family not found');
      const family = current.rows[0];
      const next = {
        name: body.name !== undefined ? body.name.trim() : family.name,
        surname: body.surname !== undefined ? body.surname?.trim() || null : family.surname,
        remark: body.remark !== undefined ? body.remark?.trim() || null : family.remark,
      };
      if (!next.name) throw new BadRequestException('name is required');
      const result = await client.query(
        `
      UPDATE family
      SET name = $1, surname = $2, remark = $3, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = $4
      RETURNING *
      `,
        [next.name, next.surname, next.remark, id],
      );
      return { family: result.rows[0] };
    });
  }

  async export(id: number) {
    return this.db.transaction(async (client) => {
      const family = await client.query('SELECT * FROM family WHERE id = $1', [id]);
      if (!family.rowCount) throw new NotFoundException('family not found');

      const people = await client.query(
        `
      SELECT *
      FROM person
      WHERE family_id = $1
      ORDER BY COALESCE(generation, 999), id
      `,
        [id],
      );
      const relations = await client.query<{ id: number; from_person_id: number }>(
        `
      SELECT *
      FROM person_relation
      WHERE family_id = $1
      ORDER BY id
      `,
        [id],
      );

      const excluded = await client.query(
        'SELECT from_person_id, to_person_id FROM auto_parent_exclusion WHERE family_id = $1 ORDER BY from_person_id, to_person_id',
        [id],
      );
      const findings = await findAnomalies(client, id, 0);
      return {
        reviewed_issues: findings.anomalies
          .filter((item) => item.confirmed)
          .map((item) => reviewIdentity(item, relations.rows)),
        format: 'family_graph_export',
        version: 1,
        exportedAt: new Date().toISOString(),
        counts: {
          families: 1,
          people: people.rowCount,
          relations: relations.rowCount,
        },
        family: family.rows[0],
        people: people.rows,
        relations: relations.rows,
        excluded_auto_parents: excluded.rows,
      };
    });
  }
}
