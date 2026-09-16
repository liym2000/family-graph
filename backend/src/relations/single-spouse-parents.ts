import { QueryableDatabase } from '../database/database.service';

type Person = { id: number; generation: number | null };
type Edge = {
  id: number;
  from_person_id: number;
  to_person_id: number;
  relation_type: string;
  origin?: string;
};
type Pair = { from_person_id: number; to_person_id: number };
const key = (parent: number, child: number) => `${parent}:${child}`;

export function planSingleSpouseParents(
  people: Person[],
  relations: Edge[],
  exclusions: Pair[] = [],
) {
  const byId = new Map(people.map((p) => [Number(p.id), p]));
  const spouses = new Map<number, Set<number>>();
  const parents = new Map<number, Set<number>>();
  const children = new Map<number, Set<number>>();
  const add = (map: Map<number, Set<number>>, a: number, b: number) => {
    const set = map.get(a) || new Set<number>();
    set.add(b);
    map.set(a, set);
  };
  // The first recorded spouse (lowest relation ID) is the default. No separate
  // marriage-order setting is required; later explicit parentage takes priority.
  // Keep the legacy origin value for compatibility with existing backups.
  const manual = relations
    .filter((r) => r.origin !== 'single_spouse')
    .sort((a, b) => Number(a.id) - Number(b.id));
  for (const r of manual) {
    const a = Number(r.from_person_id),
      b = Number(r.to_person_id);
    if (r.relation_type === 'spouse') {
      add(spouses, a, b);
      add(spouses, b, a);
    }
    if (r.relation_type === 'parent') {
      add(parents, b, a);
      add(children, a, b);
    }
  }
  const excluded = new Set(
    exclusions.map((r) => key(Number(r.from_person_id), Number(r.to_person_id))),
  );
  const planned = new Map<string, Pair>();
  let skipped = 0;
  function reaches(start: number, target: number) {
    const queue = [start],
      seen = new Set(queue);
    for (let i = 0; i < queue.length; i++) {
      if (queue[i] === target) return true;
      for (const child of children.get(queue[i]) || [])
        if (!seen.has(child)) {
          seen.add(child);
          queue.push(child);
        }
    }
    return false;
  }
  for (const r of manual
    .filter((r) => r.relation_type === 'parent')
    .sort((a, b) => Number(a.id) - Number(b.id))) {
    const parent = Number(r.from_person_id),
      child = Number(r.to_person_id);
    const partners = spouses.get(parent);
    if (!partners?.size) continue;
    const partner = [...partners][0];
    if (parents.get(child)?.has(partner) || excluded.has(key(partner, child))) continue;
    const partnerPerson = byId.get(partner),
      childPerson = byId.get(child);
    // Explicit parentage outside this couple takes precedence over the default.
    if (
      !partnerPerson ||
      !childPerson ||
      [...(parents.get(child) || [])].some((p) => p !== parent && p !== partner) ||
      (partnerPerson.generation != null &&
        childPerson.generation != null &&
        Number(childPerson.generation) !== Number(partnerPerson.generation) + 1) ||
      reaches(child, partner)
    ) {
      skipped++;
      continue;
    }
    planned.set(key(partner, child), {
      from_person_id: partner,
      to_person_id: child,
    });
    add(children, partner, child);
  }
  return { relations: [...planned.values()], skipped };
}

/** Must be called in a transaction; writers are serialized by BEGIN IMMEDIATE. */
export async function syncSingleSpouseParents(client: QueryableDatabase, familyId: number) {
  const people = await client.query<Person>(
    'SELECT id, generation FROM person WHERE family_id = $1',
    [familyId],
  );
  const edges = await client.query<Edge>(
    'SELECT * FROM person_relation WHERE family_id = $1 ORDER BY id',
    [familyId],
  );
  const excluded = await client.query<Pair>(
    'SELECT from_person_id, to_person_id FROM auto_parent_exclusion WHERE family_id = $1',
    [familyId],
  );
  const plan = planSingleSpouseParents(people.rows, edges.rows, excluded.rows);
  const desired = new Set(plan.relations.map((r) => key(r.from_person_id, r.to_person_id)));
  const oldAuto = edges.rows.filter((r) => r.origin === 'single_spouse');
  const removedIds = oldAuto
    .filter((r) => !desired.has(key(Number(r.from_person_id), Number(r.to_person_id))))
    .map((r) => r.id);
  if (removedIds.length)
    await client.query(
      "DELETE FROM person_relation WHERE family_id = $1 AND origin = 'single_spouse' AND id IN (SELECT value FROM json_each($2))",
      [familyId, removedIds],
    );
  const existing = new Set(
    oldAuto.map((r) => key(Number(r.from_person_id), Number(r.to_person_id))),
  );
  let added = 0;
  for (const r of plan.relations)
    if (!existing.has(key(r.from_person_id, r.to_person_id))) {
      await client.query(
        `INSERT INTO person_relation (family_id, from_person_id, to_person_id, relation_type, origin)
      VALUES ($1, $2, $3, 'parent', 'single_spouse')`,
        [familyId, r.from_person_id, r.to_person_id],
      );
      added++;
    }
  return { added, removed: removedIds.length, skipped: plan.skipped };
}
