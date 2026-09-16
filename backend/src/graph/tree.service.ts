import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class TreeService {
  constructor(private readonly db: DatabaseService) {}

  async findPath(familyId: number, rootId: number, targetId: number) {
    const people = await this.db.query(
      'SELECT id FROM person WHERE family_id=$1 AND id IN (SELECT value FROM json_each($2))',
      [familyId, [rootId, targetId]],
    );
    if (new Set(people.rows.map((p) => Number(p.id))).size !== (rootId === targetId ? 1 : 2))
      throw new NotFoundException('person not found in family');
    const relations = await this.db.query(
      'SELECT from_person_id,to_person_id,relation_type FROM person_relation WHERE family_id=$1 ORDER BY id',
      [familyId],
    );
    const children = new Map<number, number[]>(),
      partners = new Set<number>();
    for (const r of relations.rows) {
      const a = Number(r.from_person_id),
        b = Number(r.to_person_id);
      if (r.relation_type === 'parent') {
        const list = children.get(a) || [];
        list.push(b);
        children.set(a, list);
      } else if (r.relation_type === 'spouse') {
        if (a === targetId) partners.add(b);
        if (b === targetId) partners.add(a);
      }
    }
    // Follow descendants only. A spouse may be attached at the end of a path,
    // but must never turn into an intermediate ancestor or change the root.
    const previous = new Map<number, number | null>([[rootId, null]]),
      queue = [rootId];
    for (let i = 0; i < queue.length; i++)
      for (const child of children.get(queue[i]) || []) {
        if (previous.has(child)) continue;
        previous.set(child, queue[i]);
        queue.push(child);
      }
    const owner = previous.has(targetId) ? targetId : queue.find((id) => partners.has(id));
    if (owner === undefined) return { found: false, path: [], spouseId: null };
    const path: number[] = [];
    for (let id: number | null = owner; id !== null; id = previous.get(id) ?? null) path.push(id);
    return { found: true, path: path.reverse(), spouseId: owner === targetId ? null : targetId };
  }

  async branch(familyId: number, personId?: number, offset = 0) {
    const root = await this.db.query(
      `SELECT id,name,gender,generation FROM person p WHERE family_id=$1
       ${personId ? 'AND id=$2' : ''}
       ORDER BY generation NULLS LAST,id LIMIT 1`,
      personId ? [familyId, personId] : [familyId],
    );
    if (!root.rowCount) {
      if (personId) throw new NotFoundException('person not found in family');
      return { person: null, children: [], spouses: [], nextOffset: null };
    }
    const id = root.rows[0].id;
    const children = await this.db.query(
      `SELECT p.id,p.name,p.gender,p.generation,r.origin,
       EXISTS(SELECT 1 FROM person_relation c WHERE c.family_id=$1 AND c.from_person_id=p.id AND c.relation_type='parent') AS has_children,
       (SELECT json_group_array(other.from_person_id ORDER BY other.id) FROM person_relation other
        WHERE other.family_id=$1 AND other.to_person_id=p.id AND other.relation_type='parent' AND other.from_person_id<>$2) AS other_parent_ids
       FROM person_relation r JOIN person p ON p.id=r.to_person_id
       WHERE r.family_id=$1 AND p.family_id=$1 AND r.from_person_id=$2 AND r.relation_type='parent'
       ORDER BY r.id LIMIT 21 OFFSET $3`,
      [familyId, id, offset],
    );
    const spouses = await this.db.query(
      `SELECT p.id,p.name,p.gender,p.generation FROM person_relation r JOIN person p
       ON p.id=CASE WHEN r.from_person_id=$2 THEN r.to_person_id ELSE r.from_person_id END
       WHERE r.family_id=$1 AND p.family_id=$1 AND r.relation_type='spouse' AND ($2 IN (r.from_person_id,r.to_person_id))
       ORDER BY r.id`,
      [familyId, id],
    );
    const page = children.rows.slice(0, 20);
    const childSpouses = page.length
      ? await this.db.query(
          `SELECT owner_id,id,name,gender,generation FROM (
         SELECT r.from_person_id AS owner_id,p.id,p.name,p.gender,p.generation,r.id AS relation_id
         FROM person_relation r JOIN person p ON p.id=r.to_person_id
         WHERE r.family_id=$1 AND p.family_id=$1 AND r.relation_type='spouse'
           AND r.from_person_id IN (SELECT value FROM json_each($2))
         UNION ALL
         SELECT r.to_person_id AS owner_id,p.id,p.name,p.gender,p.generation,r.id AS relation_id
         FROM person_relation r JOIN person p ON p.id=r.from_person_id
         WHERE r.family_id=$1 AND p.family_id=$1 AND r.relation_type='spouse'
           AND r.to_person_id IN (SELECT value FROM json_each($2))
       ) ORDER BY relation_id`,
          [familyId, page.map((p) => p.id)],
        )
      : { rows: [] };
    return {
      person: root.rows[0],
      children: page.map((child) => ({
        ...child,
        has_children: Boolean(child.has_children),
        other_parent_ids: JSON.parse(child.other_parent_ids),
        spouses: childSpouses.rows
          .filter((s) => Number(s.owner_id) === Number(child.id))
          .map(({ owner_id: _owner, ...spouse }) => spouse),
      })),
      spouses: spouses.rows,
      nextOffset: children.rows.length > 20 ? offset + 20 : null,
    };
  }
}
