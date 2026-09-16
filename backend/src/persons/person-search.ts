import { Person } from '../common/types';
import { QueryableDatabase } from '../database/database.service';
import { descendantGenerations, descendantSummaries } from './descendant-generations';
import { preGenealogyAncestors } from './pre-genealogy-ancestors';

export async function searchPersons(
  db: QueryableDatabase,
  input: {
    familyId: number;
    q: string;
    generation?: number;
    gender?: string;
    issue?: string;
    limit: number;
    offset?: number;
    sort?: string;
  },
) {
  const clauses = ['p.family_id = $1'];
  const params: unknown[] = [input.familyId];
  let index = params.length + 1;
  const q = input.q?.trim() || '';
  if (q) {
    clauses.push(`p.name LIKE $${index}`);
    params.push(`%${q}%`);
    index += 1;
  }
  if (input.generation) {
    clauses.push(`p.generation = $${index}`);
    params.push(input.generation);
    index += 1;
  }
  if (input.gender) {
    clauses.push(`p.gender = $${index}`);
    params.push(input.gender);
    index++;
  }
  if (input.issue === 'missing_source')
    clauses.push("NULLIF(TRIM(COALESCE(p.remark, '')), '') IS NULL");
  if (input.issue === 'duplicate') {
    clauses.push(
      `EXISTS (
        SELECT 1 FROM person d
        WHERE d.family_id = p.family_id
          AND d.id <> p.id
          AND d.name = p.name
          AND COALESCE(d.generation, -1) = COALESCE(p.generation, -1)
      )`,
    );
  }
  if (input.issue === 'generation_mismatch') {
    clauses.push(
      `EXISTS (
        SELECT 1
        FROM person_relation r
        JOIN person parent ON parent.id = r.from_person_id
        JOIN person child ON child.id = r.to_person_id
        WHERE r.family_id = p.family_id
          AND r.relation_type = 'parent'
          AND (parent.id = p.id OR child.id = p.id)
          AND parent.generation IS NOT NULL
          AND child.generation IS NOT NULL
          AND child.generation <> parent.generation + 1
      )`,
    );
  }
  const sortOrders: Record<string, string> = {
    name: 'p.name, p.generation ASC NULLS LAST, p.id',
    generation: 'p.generation ASC NULLS LAST, p.id',
    number: 'p.person_no, p.id',
    generation_asc: 'p.generation ASC NULLS LAST, p.id',
    generation_desc: 'p.generation DESC NULLS LAST, p.id',
  };
  const computedSort =
    /^(ancestor_generations|descendant_generations|children_count)_(asc|desc)$/.exec(
      input.sort || '',
    );
  const orderSql =
    sortOrders[input.sort || ''] ||
    (q
      ? `
      CASE WHEN p.name = $${params.length + 1} THEN 0 ELSE 1 END,
      p.generation ASC NULLS LAST,
      p.id
    `
      : `
      p.generation ASC NULLS LAST,
      p.id
    `);
  const count = await db.query<{ total: number }>(
    `SELECT COUNT(*) AS total FROM person p WHERE ${clauses.join(' AND ')}`,
    params,
  );
  if (q && !sortOrders[input.sort || '']) params.push(q);
  const limit = Math.max(1, Math.min(input.limit || 80, 500));
  const offset = Math.max(0, input.offset || 0);
  params.push(computedSort ? -1 : limit);
  params.push(computedSort ? 0 : offset);
  const result = await db.query<Person>(
    `
    SELECT p.*
    FROM person p
    WHERE ${clauses.join(' AND ')}
    ORDER BY ${orderSql}
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );
  if (!result.rows.length) return { results: [], total: count.rows[0].total };
  // Use the whole family, not just the filtered page: descendants may be off-page.
  const familyRelations = await db.query<{
    from_person_id: number;
    to_person_id: number;
    relation_type: 'parent' | 'spouse';
    origin: string;
  }>(
    `SELECT from_person_id, to_person_id, relation_type, origin FROM person_relation
     WHERE family_id = $1 AND relation_type IN ('parent', 'spouse')`,
    [input.familyId],
  );
  const summaries = descendantSummaries(familyRelations.rows);
  const upward = descendantGenerations(
    familyRelations.rows
      .filter((r) => r.relation_type === 'parent')
      .map((r) => ({ from_person_id: r.to_person_id, to_person_id: r.from_person_id })),
  );
  const ancestors = await preGenealogyAncestors(db, input.familyId);
  const children = new Map<number, Set<number>>();
  for (const relation of familyRelations.rows) {
    if (relation.relation_type !== 'parent') continue;
    const parent = Number(relation.from_person_id);
    if (!children.has(parent)) children.set(parent, new Set());
    children.get(parent)!.add(Number(relation.to_person_id));
  }
  const enriched = result.rows.map((person) => ({
    ...person,
    ancestor_generations: upward.has(Number(person.id)) ? upward.get(Number(person.id)) : 0,
    is_pre_genealogy: ancestors.has(Number(person.id)),
    children_count: children.get(Number(person.id))?.size || 0,
    ...(summaries.get(Number(person.id)) || {
      descendant_generations: 0,
      descendant_generations_source: 'none',
    }),
  }));
  if (computedSort) {
    const field = computedSort[1] as
      | 'ancestor_generations'
      | 'descendant_generations'
      | 'children_count';
    const direction = computedSort[2] === 'asc' ? 1 : -1;
    enriched.sort((a, b) => {
      const x = a[field],
        y = b[field];
      if (x == null || y == null) return x == null ? (y == null ? a.id - b.id : 1) : -1;
      return (x - y) * direction || a.id - b.id;
    });
  }
  return {
    results: computedSort ? enriched.slice(offset, offset + limit) : enriched,
    total: count.rows[0].total,
  };
}
