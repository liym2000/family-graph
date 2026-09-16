import { t } from './i18n';
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

async function responsePayload(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const payload = await responsePayload(response);
  if (!response.ok)
    throw new Error(
      payload?.code === 'DEMO_READ_ONLY' ? t('演示模式不支持修改数据') : payload?.message || payload?.error || t('请求失败 ({p0})', { p0: response.status }),
    );
  return payload as T;
}

async function download(path: string, fallbackFilename: string) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    let message = t('下载失败');
    try {
      const payload = await response.json();
      message = payload.message || payload.error || message;
    } catch {
      // Keep the fallback message when the server did not return JSON.
    }
    throw new Error(message);
  }

  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return {
    blob: await response.blob(),
    filename: match?.[1] || fallbackFilename,
  };
}

export interface Family {
  updated_at?: string;
  id: number;
  name: string;
  surname?: string | null;
  person_prefix: string;
  person_next_number: number;
  remark?: string | null;
  people_count?: number;
  relation_count?: number;
}

export interface TreePerson {
  id: number;
  name: string;
  gender: Person['gender'];
  generation: number | null;
  has_children?: boolean;
  origin?: string;
  other_parent_ids?: number[];
  spouses?: TreePerson[];
}
export interface TreeBranch {
  person: TreePerson | null;
  children: TreePerson[];
  spouses: TreePerson[];
  nextOffset: number | null;
}
export interface PersonLink {
  person_id: number;
  role: 'parent' | 'spouse' | 'child';
}
export type PersonInput = Partial<
  Pick<Person, 'family_id' | 'name' | 'generation' | 'gender' | 'remark' | 'source'>
> & { links?: PersonLink[] };
export interface Person {
  is_pre_genealogy?: boolean;
  id: number;
  family_id: number;
  person_no: string;
  name: string;
  generation: number | null;
  gender: 'male' | 'female' | 'unknown';
  remark: string | null;
  source: string | null;
  /** Computed by person search; null indicates a parent-cycle in the recorded data. */
  ancestor_generations?: number | null;
  descendant_generations?: number | null;
  children_count?: number;
  descendant_generations_source?: 'direct' | 'spouse' | 'none';
}

export interface Relation {
  adjustment_allowed?: boolean;
  id: number;
  family_id: number;
  from_person_id: number;
  to_person_id: number;
  relation_type: 'parent' | 'spouse';
  origin?: 'manual' | 'single_spouse';
  from_gender?: Person['gender'];
  to_gender?: Person['gender'];
  from_name?: string;
  to_name?: string;
  from_person_no?: string;
  to_person_no?: string;
}

export interface GraphPayload {
  selectedPersonIds?: number[];
  centerId: number;
  nodes: Array<{
    id: number;
    person_no: string;
    label: string;
    generation: number | null;
    gender: Person['gender'];
    source: string | null;
    isCenter: boolean;
    isRelationEndpoint?: boolean;
    isRelationPath?: boolean;
  }>;
  edges: Array<{
    id: number;
    source: number;
    target: number;
    type: 'parent' | 'spouse';
  }>;
  pathNodeIds?: number[];
  pathEdgeIds?: number[];
  fromId?: number;
  toId?: number;
}

export interface GraphOptions {
  ancestorDepth?: number;
  descendantDepth?: number;
}

export interface RelationshipPathPayload extends GraphPayload {
  fromId: number;
  toId: number;
  found: boolean;
  pathNodeIds: number[];
  pathEdgeIds: number[];
  steps: Array<{
    type: 'parent' | 'spouse';
    label: string;
    fromId: number;
    toId: number;
  }>;
}

export interface FamilyExportV1 {
  reviewed_issues?: Array<{ type: string; person_ids: number[]; parent_id?: number }>;
  format: 'family_graph_export';
  version: 1;
  family: Record<string, unknown> & { name: string; person_prefix: string };
  people: Array<Record<string, unknown>>;
  relations: Array<Record<string, unknown>>;
  counts?: { families?: number; people?: number; relations?: number };
  exportedAt?: string;
}

export interface FamilyImportResult {
  family: Family;
  imported: { people: number; relations: number };
  prefixChanged: boolean;
}

export const api = {
  deleteFamily: (id: number) => request<{ ok: boolean }>(`/families/${id}`, { method: 'DELETE' }),
  adjustParent: (id: number, parentId: number) =>
    request(`/relations/${id}/parent`, { method: 'PATCH', body: JSON.stringify({ parentId }) }),
  families: () => request<{ families: Family[]; demoReadOnly?: boolean }>('/families'),
  updateFamily: (id: number, body: Partial<Family>) =>
    request<{ family: Family }>(`/families/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  createFamily: (body: Partial<Family>) =>
    request<{ family: Family }>('/families', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  importFamily: (body: FamilyExportV1) =>
    request<FamilyImportResult>('/families/import', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  exportFamily: (familyId: number) =>
    download(`/families/${familyId}/export`, `family-${familyId}-export.json`),
  searchPersons: (params: URLSearchParams) =>
    request<{ results: Person[]; total: number }>(`/persons/search?${params.toString()}`),
  getPerson: (id: number) =>
    request<{ person: Person; relations: Relation[]; siblings?: Person[] }>(`/persons/${id}`),
  treeBranch: (familyId: number, personId?: number, offset = 0) =>
    request<TreeBranch>(
      `/graph/tree?${new URLSearchParams({ familyId: String(familyId), ...(personId ? { personId: String(personId) } : {}), offset: String(offset) })}`,
    ),
  treePath: (familyId: number, fromId: number, toId: number) =>
    request<{ found: boolean; path: number[]; spouseId: number | null }>(
      `/graph/tree-path?${new URLSearchParams({ familyId: String(familyId), fromId: String(fromId), toId: String(toId) })}`,
    ),
  createPerson: (
    body: PersonInput & { relative_id?: number; relative_role?: 'parent' | 'spouse' | 'child' },
  ) =>
    request<{ person: Person }>('/persons', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updatePerson: (id: number, body: Omit<PersonInput, 'family_id'>) =>
    request<{ person: Person }>(`/persons/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deletePerson: (id: number) => request<{ ok: boolean }>(`/persons/${id}`, { method: 'DELETE' }),
  createRelation: (body: Record<string, unknown>) =>
    request('/relations', { method: 'POST', body: JSON.stringify(body) }),
  deleteRelation: (id: number) => request(`/relations/${id}`, { method: 'DELETE' }),
  graph: (personId: number, familyId: number, options: GraphOptions = {}) => {
    const params = new URLSearchParams({ familyId: String(familyId) });
    if (options.ancestorDepth !== undefined)
      params.set('ancestorDepth', String(options.ancestorDepth));
    if (options.descendantDepth !== undefined)
      params.set('descendantDepth', String(options.descendantDepth));
    return request<GraphPayload>(`/graph/person/${personId}?${params.toString()}`);
  },
  relationshipPath: (familyId: number, fromId: number, toId: number) => {
    const params = new URLSearchParams({
      familyId: String(familyId),
      fromId: String(fromId),
      toId: String(toId),
    });
    return request<RelationshipPathPayload>(`/graph/relationship-path?${params.toString()}`);
  },
};
