import { BadRequestException } from '@nestjs/common';
import { ImportFamilyDto } from '../common/dto';

type Gender = 'male' | 'female' | 'unknown';
type RelationType = 'parent' | 'spouse';

interface ImportPerson {
  oldId: number;
  personNo: string;
  suffix: string;
  name: string;
  generation: number | null;
  gender: Gender;
  remark: string | null;
  source: string | null;
}

interface ImportRelation {
  fromId: number;
  toId: number;
  type: RelationType;
  origin: 'manual' | 'single_spouse';
}

interface NormalizedImport {
  family: {
    name: string;
    surname: string | null;
    remark: string | null;
    prefix: string;
  };
  people: ImportPerson[];
  relations: ImportRelation[];
}

export function fail(message: string): never {
  throw new BadRequestException(message);
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} is required`);
  return value.trim();
}

function optionalString(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') fail(`${field} must be a string or null`);
  return value.trim() || null;
}

export function positiveInteger(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) fail(`${field} must be a positive integer`);
  return number;
}

function nullableGeneration(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') return null;
  return positiveInteger(value, field);
}

export function normalizeFamilyImport(payload: ImportFamilyDto): NormalizedImport {
  const familyName = requiredString(payload.family.name, 'family.name');
  const prefix = requiredString(payload.family.person_prefix, 'family.person_prefix').toLowerCase();
  if (!/^[a-z0-9]{6}$/.test(prefix))
    fail('family.person_prefix must contain exactly 6 lowercase letters or digits');

  const people: ImportPerson[] = [];
  const personIds = new Set<number>();
  const personNumbers = new Set<string>();

  payload.people.forEach((raw, index) => {
    const field = `people[${index}]`;
    const oldId = positiveInteger(raw.id, `${field}.id`);
    if (personIds.has(oldId)) fail(`${field}.id is duplicated`);
    personIds.add(oldId);

    const personNo = requiredString(raw.person_no, `${field}.person_no`).toLowerCase();
    const match = personNo.match(/^([a-z0-9]{6})-([0-9]{8})$/);
    if (!match || match[1] !== prefix) fail(`${field}.person_no does not match the family prefix`);
    if (personNumbers.has(personNo)) fail(`${field}.person_no is duplicated`);
    personNumbers.add(personNo);

    const gender = raw.gender ?? 'unknown';
    if (gender !== 'male' && gender !== 'female' && gender !== 'unknown')
      fail(`${field}.gender is invalid`);

    people.push({
      oldId,
      personNo,
      suffix: match[2],
      name: requiredString(raw.name, `${field}.name`),
      generation: nullableGeneration(raw.generation, `${field}.generation`),
      gender,
      remark: optionalString(raw.remark, `${field}.remark`),
      source: optionalString(raw.source, `${field}.source`),
    });
  });

  const peopleById = new Map(people.map((person) => [person.oldId, person]));
  const relations: ImportRelation[] = [];
  const relationKeys = new Set<string>();

  payload.relations.forEach((raw, index) => {
    const field = `relations[${index}]`;
    const fromId = positiveInteger(raw.from_person_id, `${field}.from_person_id`);
    const toId = positiveInteger(raw.to_person_id, `${field}.to_person_id`);
    if (fromId === toId) fail(`${field} cannot reference the same person twice`);
    if (!peopleById.has(fromId) || !peopleById.has(toId))
      fail(`${field} references a person that is not in this export`);

    const type = raw.relation_type;
    if (type !== 'parent' && type !== 'spouse') fail(`${field}.relation_type is invalid`);
    const key =
      type === 'spouse'
        ? `spouse:${Math.min(fromId, toId)}:${Math.max(fromId, toId)}`
        : `parent:${fromId}:${toId}`;
    if (relationKeys.has(key)) fail(`${field} duplicates another relation`);
    relationKeys.add(key);

    // Backups preserve historical generation anomalies for review. Interactive
    // relationship writes still enforce consecutive generations.
    const origin = raw.origin ?? 'manual';
    if (origin !== 'manual' && origin !== 'single_spouse') fail(`${field}.origin is invalid`);
    if (origin === 'single_spouse' && type !== 'parent')
      fail(`${field}.origin is only valid for parent relations`);
    relations.push({ fromId, toId, type, origin });
  });

  assertNoParentCycle(people, relations);

  return {
    family: {
      name: familyName,
      surname: optionalString(payload.family.surname, 'family.surname'),
      remark: optionalString(payload.family.remark, 'family.remark'),
      prefix,
    },
    people,
    relations,
  };
}

function assertNoParentCycle(people: ImportPerson[], relations: ImportRelation[]) {
  const children = new Map<number, number[]>();
  const incoming = new Map(people.map((person) => [person.oldId, 0]));
  for (const relation of relations) {
    if (relation.type !== 'parent') continue;
    const list = children.get(relation.fromId) || [];
    list.push(relation.toId);
    children.set(relation.fromId, list);
    incoming.set(relation.toId, incoming.get(relation.toId)! + 1);
  }

  // Iterative topological traversal also handles deep valid backups without
  // consuming one JavaScript stack frame per generation.
  const queue = [...incoming].filter(([, count]) => count === 0).map(([id]) => id);
  for (let i = 0; i < queue.length; i++) {
    for (const child of children.get(queue[i]) || []) {
      const count = incoming.get(child)! - 1;
      incoming.set(child, count);
      if (count === 0) queue.push(child);
    }
  }
  if (queue.length !== people.length) fail('parent relations contain a cycle');
}
