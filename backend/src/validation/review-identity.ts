export interface ReviewIdentity {
  type: string;
  person_ids: number[];
  parent_id?: number;
}

export function reviewIdentity(
  item: { type: string; personId?: number; personIds?: number[]; relationId?: number },
  relations: Array<{ id: number; from_person_id: number }>,
): ReviewIdentity {
  const parent = item.relationId
    ? relations.find((r) => Number(r.id) === Number(item.relationId))?.from_person_id
    : undefined;
  return {
    type: item.type,
    person_ids: (item.personIds || [item.personId!]).map(Number).sort((a, b) => a - b),
    ...(parent === undefined ? {} : { parent_id: Number(parent) }),
  };
}

export function reviewKey(identity: ReviewIdentity) {
  return JSON.stringify([
    identity.type,
    [...identity.person_ids].sort((a, b) => a - b),
    identity.parent_id ?? null,
  ]);
}
