export type Gender = 'male' | 'female' | 'unknown';
export type RelationType = 'parent' | 'spouse';

export interface Person {
  id: number;
  family_id: number;
  person_no: string;
  name: string;
  generation: number | null;
  gender: Gender;
  remark: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface Relation {
  id: number;
  family_id: number;
  from_person_id: number;
  to_person_id: number;
  relation_type: RelationType;
  origin: 'manual' | 'single_spouse';
  created_at: string;
}
