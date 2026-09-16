import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type FamilyExportV1 } from '../src/api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('family import API', () => {
  it('posts a versioned export to the same-origin API', async () => {
    const payload: FamilyExportV1 = {
      format: 'family_graph_export',
      version: 1,
      family: { name: '示例家谱', person_prefix: 'demofm' },
      people: [],
      relations: [],
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        family: { id: 1, name: '示例家谱', person_prefix: 'demofm', person_next_number: 1 },
        imported: { people: 0, relations: 0 },
        prefixChanged: false,
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.importFamily(payload);

    expect(result.prefixChanged).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith('/api/families/import', expect.objectContaining({ method: 'POST' }));
  });

  it('preserves a useful message for non-JSON errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 502,
      text: async () => 'Bad Gateway',
    })));

    await expect(api.families()).rejects.toThrow('Bad Gateway');
  });
});

