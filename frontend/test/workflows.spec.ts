import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { elementPlus } from '../src/ui/element-plus';
import App from '../src/App.vue';
import { routes } from '../src/router';
import { api, type Person } from '../src/api';
import { locale, setLocale, t } from '../src/i18n';
import { en } from '../src/locales/en';
import PersonForm from '../src/components/PersonForm.vue';
import DescendantBadge from '../src/components/DescendantBadge.vue';

const family = {
  id: 1,
  name: '示例家谱',
  surname: '陈',
  person_prefix: 'demofm',
  person_next_number: 3,
  people_count: 65,
  relation_count: 1,
};
const person: Person = {
  id: 2,
  family_id: 1,
  name: '陈示例',
  person_no: 'demofm-00000002',
  generation: 2,
  descendant_generations: 3,
  gender: 'female',
  source: null,
  remark: '来源：示例资料第 2 页\n原始备注',
};
let wrapper: VueWrapper | undefined;

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  setLocale('zh-CN');
  vi.spyOn(api, 'families').mockResolvedValue({ families: [{ ...family }] });
  vi.spyOn(api, 'searchPersons').mockResolvedValue({
    results: [{ ...person }],
    total: 65,
  });
  vi.spyOn(api, 'getPerson').mockResolvedValue({
    person: { ...person },
    relations: [],
  });
  vi.spyOn(api, 'updatePerson').mockImplementation(async (_id, body) => ({
    person: { ...person, ...body },
  }));
  vi.spyOn(api, 'graph').mockResolvedValue({
    centerId: 2,
    nodes: [
      {
        id: 2,
        label: person.name,
        person_no: person.person_no,
        generation: 2,
        gender: 'female',
        source: person.source,
        isCenter: true,
      },
    ],
    edges: [],
  });
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

async function open(path: string) {
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push(path);
  await router.isReady();
  wrapper = mount(App, {
    attachTo: document.body,
    global: { plugins: [router, elementPlus] },
  });
  await vi.waitFor(() =>
    expect(wrapper!.find('.page-heading, .start-hero').exists()).toBe(true),
  );
  await flushPromises();
  return router;
}

describe('routed family workflows', () => {
  it('shows recorded descendant depth on desktop and mobile in both languages', async () => {
    await open('/families/1/people');
    for (const layout of ['.desktop-people', '.mobile-people']) {
      const badge = wrapper!.get(`${layout} .descendant-badge[aria-label^="后裔"]`);
      expect(badge.text()).toBe('3');
      expect(badge.attributes('aria-label')).toContain('后裔 3 代');
    }
    setLocale('en');
    await flushPromises();
    for (const layout of ['.desktop-people', '.mobile-people']) {
      const badge = wrapper!.get(`${layout} .descendant-badge[aria-label^="Descendant depth:"]`);
      expect(badge.text()).toBe('3');
      expect(badge.attributes('aria-label')).toContain('Descendant depth: 3');
    }
  });
  it('restores filters and pagination, opens a person, and preserves original data when switching languages', async () => {
    const router = await open(
      '/families/1/people?q=陈&page=2&generation=2&sort=name',
    );
    expect(api.searchPersons).toHaveBeenLastCalledWith(
      expect.any(URLSearchParams),
    );
    const params = vi.mocked(api.searchPersons).mock.calls.at(-1)![0];
    expect(params.get('offset')).toBe('50');
    expect(params.get('generation')).toBe('2');
    expect(params.get('sort')).toBe('name');
    await wrapper!.get('.person-link').trigger('click');
    await vi.waitFor(() =>
      expect(wrapper!.find('.profile-fields').exists()).toBe(true),
    );
    expect(router.currentRoute.value.query.page).toBe('2');
    await wrapper!.get('.language-switcher button[lang="en"]').trigger('click');
    expect(wrapper!.text()).toContain('About this person');
    expect(wrapper!.text()).toContain('Settings & backup');
    expect(wrapper!.text()).toContain(person.name);
    expect(wrapper!.text()).toContain(person.remark);
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('familyGraph.locale')).toBe('en');
    const editButton = wrapper!
      .findAll('button')
      .find((button) => button.text() === 'Edit details')!;
    await editButton.trigger('click');
    const form = wrapper!.getComponent(PersonForm);
    await form.findAll('input')[0].setValue('陈示例更新');
    await wrapper!
      .get('.language-switcher button[lang="zh-CN"]')
      .trigger('click');
    expect((form.findAll('input')[0].element as HTMLInputElement).value).toBe(
      '陈示例更新',
    );
    await form.get('form').trigger('submit');
    await flushPromises();
    expect(api.updatePerson).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ name: '陈示例更新', remark: person.remark }),
    );
    await router.push({
      path: '/families/1/people',
      query: router.currentRoute.value.query,
    });
    await flushPromises();
    expect(
      vi.mocked(api.searchPersons).mock.calls.at(-1)![0].get('offset'),
    ).toBe('50');
  });

  it('shows an API failure with retry rather than an empty list', async () => {
    vi.mocked(api.searchPersons).mockRejectedValueOnce(
      new Error('Connection unavailable'),
    );
    await open('/families/1/people');
    expect(wrapper!.get('[role="alert"]').text()).toContain(
      'Connection unavailable',
    );
    await wrapper!.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(wrapper!.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper!.text()).toContain(person.name);
  });

  it('opens a graph directly and uses depths from the URL', async () => {
    const router = await open(
      '/families/1/graph?person=2&ancestors=4&descendants=1',
    );
    await vi.waitFor(() =>
      expect(api.graph).toHaveBeenCalledWith(2, 1, {
        ancestorDepth: 4,
        descendantDepth: 1,
      }),
    );
    await router.push('/families/1/graph?person=2&ancestors=1&descendants=0');
    await flushPromises();
    expect(api.graph).toHaveBeenLastCalledWith(2, 1, {
      ancestorDepth: 1,
      descendantDepth: 0,
    });
    expect(wrapper!.get('.graph-node').attributes('tabindex')).toBe('0');
  });
});

describe('translation catalog', () => {
  it('distinguishes manual, automatic, and unrecorded descendants with text and color', async () => {
    wrapper = mount(DescendantBadge, {
      props: { person: { ...person, descendant_generations_source: 'spouse' } },
      global: { plugins: [elementPlus] },
    });
    expect(wrapper.get('.descendant-badge--spouse').attributes('aria-label')).toContain(
      '自动关联',
    );
    setLocale('en');
    await flushPromises();
    expect(wrapper.get('.descendant-badge').attributes('aria-label')).toContain('Auto-linked');
    await wrapper.setProps({
      person: { ...person, descendant_generations_source: 'direct' },
    });
    expect(wrapper.get('.descendant-badge--direct').attributes('aria-label')).toContain(
      'Manual link',
    );
    await wrapper.setProps({
      person: {
        ...person,
        descendant_generations: 0,
        descendant_generations_source: 'none',
      },
    });
    expect(wrapper.get('.descendant-badge--none').attributes('aria-label')).toContain(
      'None recorded',
    );
  });
  it('has complete English messages with the same interpolation parameters', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value.trim()).not.toBe('');
      expect(value.match(/\{\w+\}/g)?.sort() || []).toEqual(
        key.match(/\{\w+\}/g)?.sort() || [],
      );
    }
    setLocale('en');
    expect(t('第 {p0} 世', { p0: 4 })).toBe('Generation 4');
    expect(locale.value).toBe('en');
  });
});
