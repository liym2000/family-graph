<template>
  <PageHeading>
    <div>
      <h1>{{ t('人物档案') }}</h1>
    </div>
    <el-button v-if="!readOnly" type="primary" @click="creating = true">
      {{ t('添加人物') }}
    </el-button>
  </PageHeading>
  <section class="surface">
    <form class="filter-bar people-filters" @submit.prevent="search">
      <el-input
        v-model="filters.q"
        :aria-label="t('搜索人物')"
        :placeholder="t('搜索人物')"
        clearable
      />
      <el-input
        class="generation-filter"
        :model-value="filters.generation == null ? '' : String(filters.generation)"
        :aria-label="t('世代')"
        :placeholder="t('全部世代')"
        inputmode="numeric"
        clearable
        :formatter="(value: string) => value ? t('第 {p0} 世', { p0: value }) : ''"
        :parser="(value: string) => value.replace(/[^0-9]/g, '')"
        @update:model-value="(value: string) => filters.generation = Number(value) > 0 ? Number(value) : undefined"
      />
      <el-radio-group v-model="filters.gender" class="gender-filter" :aria-label="t('性别')">
        <el-radio-button value="">{{ t('全部') }}</el-radio-button>
        <el-radio-button value="male">{{ t('男') }}</el-radio-button>
        <el-radio-button value="female">{{ t('女') }}</el-radio-button>
        <el-radio-button value="unknown">{{ t('未定') }}</el-radio-button>
      </el-radio-group>
      <el-button type="primary" native-type="submit">{{ t('查询') }}</el-button>
      <el-button @click="router.push({ path: base + '/people' })">
        {{ t('重置') }}
      </el-button>
    </form>
    <LoadState :loading="loading" :error="error" @retry="load">
      <el-table
        v-if="people.length"
        class="desktop-people"
        :data="people"
        stripe
      >
        <el-table-column
          type="index"
          :label="t('行号')"
          :index="rowNumber"
          min-width="100"
        />
        <el-table-column :label="t('姓名')" min-width="100">
          <template #default="{ row }">
            <RouterLink
              class="person-link"
              :to="{ path: base + '/person/' + row.id, query: route.query }"
            >
              {{ row.name }}
            </RouterLink>
          </template>
        </el-table-column>
        <el-table-column :label="t('性别')" min-width="100" align="center">
          <template #default="{ row }">
            {{
              row.gender === 'male'
                ? t('男')
                : row.gender === 'female'
                  ? t('女')
                  : t('未定')
            }}
          </template>
        </el-table-column>
        <el-table-column :label="t('世代')" min-width="100" align="center">
          <template #header><el-button link @click="sortBy('generation')">{{ t('世代') }} {{ sortArrow('generation') }}</el-button></template>
          <template #default="{ row }">{{ row.is_pre_genealogy ? t('谱前祖先') : row.generation }}</template>
        </el-table-column>
        <el-table-column :label="t('上溯')" min-width="100" align="center">
          <template #header><el-button link @click="sortBy('ancestor_generations')">{{ t('上溯') }} {{ sortArrow('ancestor_generations') }}</el-button></template>
          <template #default="{ row }">
            <DescendantBadge :person="row" ancestor />
          </template>
        </el-table-column>
        <el-table-column :label="t('后裔')" min-width="100" align="center">
          <template #header><el-button link @click="sortBy('descendant_generations')">{{ t('后裔') }} {{ sortArrow('descendant_generations') }}</el-button></template>

          <template #default="{ row }">
            <DescendantBadge :person="row" />
          </template>
        </el-table-column>
        <el-table-column :label="t('子女')" min-width="100" align="center">
          <template #header><el-button link @click="sortBy('children_count')">{{ t('子女') }} {{ sortArrow('children_count') }}</el-button></template>
          <template #default="{ row }">{{ row.children_count ?? 0 }}</template>
        </el-table-column>
        <el-table-column
          :label="t('备注')"
          min-width="100"
          :show-overflow-tooltip="{ popperClass: 'notes-tooltip', enterable: true }"
          :tooltip-formatter="formatNotesTooltip"
        >
          <template #default="{ row }">
            {{ row.remark?.trim() ? row.remark : '---' }}
          </template>
        </el-table-column>
        <el-table-column :label="t('详情')" min-width="100" align="center">
          <template #default="{ row }">
            <div class="ui-actions person-row-actions">
              <RouterLink
                :to="{ path: base + '/person/' + row.id, query: route.query }"
              >
                {{ t('查看') }}
              </RouterLink>
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="t('图谱')" min-width="100" align="center">
          <template #default="{ row }">
            <RouterLink
              :to="{ path: base + '/graph', query: { person: row.id } }"
            >
              {{ t('查看') }}
            </RouterLink>
          </template>
        </el-table-column>
        <el-table-column v-if="!readOnly" :label="t('删除')" min-width="100" align="center">
          <template #default="{ row }"><el-button v-if="!readOnly" link type="danger" :disabled="deleting !== undefined" @click="removePerson(row)">{{ t('删除') }}</el-button></template>
        </el-table-column>
      </el-table>
      <div v-if="people.length" class="mobile-people">
        <article v-for="(row, index) in people" :key="row.id" class="mobile-person">
          <span class="muted">{{ t('行号') }} {{ rowNumber(index) }}</span>
          <RouterLink
            class="person-link"
            :to="{ path: base + '/person/' + row.id, query: route.query }"
          >
            {{ row.name }}
          </RouterLink>
          <span class="muted">
            {{
              row.is_pre_genealogy ? t("谱前祖先") : row.generation
                ? t('第 {p0} 世', { p0: row.generation })
                : t('世代未定')
            }}
          </span>
          <p>{{ row.remark?.trim() ? row.remark : '---' }}</p>
          <span>{{ t('上溯') }}：<DescendantBadge :person="row" ancestor /></span>
          <DescendantBadge :person="row" />
          <el-button v-if="!readOnly" link type="danger" :disabled="deleting !== undefined" @click="removePerson(row)">{{ t("删除") }}</el-button>
          <span>{{ t('子女') }}：{{ row.children_count ?? 0 }}</span>
          <RouterLink
            :to="{ path: base + '/person/' + row.id, query: route.query }"
          >
            {{ t('查看') }} →
          </RouterLink>
          <RouterLink
            :to="{ path: base + '/graph', query: { person: row.id } }"
          >
            {{ t('查看图谱') }} →
          </RouterLink>
        </article>
      </div>
      <el-empty v-else :description="t('没有符合条件的人物')">
        <el-button v-if="!readOnly" @click="creating = true">{{ t('添加人物') }}</el-button>
      </el-empty>
      <el-pagination
        v-if="total > pageSize"
        class="pagination"
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next"
        @current-change="changePage"
      />
    </LoadState>
  </section>
  <el-dialog
    v-model="creating"
    :title="t('添加人物')"
    width="min(540px, 94vw)"
    destroy-on-close
    :close-on-click-modal="false"
    :before-close="closeEditor"
  >
    <PersonForm :family-id="familyId" :saving="saving" @save="create" @cancel="creating = false" />
  </el-dialog>
</template>
<script setup lang="ts">
import { useDemoMode } from '../composables/useDemoMode';
const { readOnly } = useDemoMode();
import PageHeading from '../components/PageHeading.vue';
import { t } from '../i18n';

import { computed, h, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api, type Person, type PersonInput } from '../api';
import { useFamily } from '../composables/useFamily';
import { useFamilies } from '../composables/useFamilies';
import LoadState from '../components/LoadState.vue';
import DescendantBadge from '../components/DescendantBadge.vue';
import PersonForm from '../components/PersonForm.vue';
const { familyId, base } = useFamily();
const route = useRoute();
const router = useRouter();
const filters = reactive({
  q: '',
  generation: undefined as number | undefined,
  issue: '',
  sort: 'relevance',
  gender: '',
});
const people = ref<Person[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref('');
const creating = ref(false);
const deleting = ref<number>();
async function removePerson(person: Person) {
  try {
    await ElMessageBox.confirm(t('删除「{p0}」及其全部亲属关系？', { p0: person.name }), t('删除人物'), {
      confirmButtonText: t('删除'), cancelButtonText: t('取消'), type: 'warning', confirmButtonClass: 'destructive-confirm',
    });
    deleting.value = person.id;
    await api.deletePerson(person.id);
    if (people.value.length === 1 && page.value > 1) await router.replace({ query: { ...route.query, page: page.value - 1 } });
    else await load();
    void useFamilies().load(true);
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e instanceof Error ? e.message : t('删除失败'));
  } finally { deleting.value = undefined; }
}
function closeEditor(done: () => void) { if (!saving.value) done(); }
const saving = ref(false);
const pageSize = 50;
const page = computed(() =>
  Math.max(1, Math.min(1000000, Math.floor(Number(route.query.page)) || 1)),
);
let requestId = 0;
function formatNotesTooltip({ row }: { row: Person }) {
  return h('div', { class: 'notes-tooltip-content' }, row.remark?.trim() ? row.remark : '---');
}
function rowNumber(index: number) {
  return (page.value - 1) * pageSize + index + 1;
}
async function load() {
  const id = ++requestId;
  loading.value = true;
  error.value = '';
  filters.q = String(route.query.q || '');
  filters.generation =
    Number(route.query.generation) > 0
      ? Number(route.query.generation)
      : undefined;
  filters.issue = [
    'missing_source',
    'duplicate',
    'generation_mismatch',
  ].includes(String(route.query.issue))
    ? String(route.query.issue)
    : '';
  filters.gender = ['male','female','unknown'].includes(String(route.query.gender)) ? String(route.query.gender) : '';
  filters.sort = ['name', 'generation', 'number', ...sortFields.flatMap(field => [field+'_asc', field+'_desc'])].includes(
    String(route.query.sort),
  )
    ? String(route.query.sort)
    : 'relevance';
  const params = new URLSearchParams({
    familyId: String(familyId.value),
    q: filters.q,
    limit: String(pageSize),
    offset: String((page.value - 1) * pageSize),
    sort: filters.sort,
  });
  if (filters.gender) params.set('gender', filters.gender);
  if (filters.generation) params.set('generation', String(filters.generation));
  if (filters.issue) params.set('issue', filters.issue);
  try {
    const result = await api.searchPersons(params);
    if (id === requestId) {
      people.value = result.results;
      total.value = result.total;
    }
  } catch (e) {
    if (id === requestId)
      error.value = e instanceof Error ? e.message : t('无法加载人物');
  } finally {
    if (id === requestId) loading.value = false;
  }
}
const sortFields = ['generation','ancestor_generations','descendant_generations','children_count'];
function sortArrow(field: string) {
  return filters.sort === field+'_asc' || (field === 'generation' && filters.sort === 'generation') ? '↑' : filters.sort === field+'_desc' ? '↓' : '↕';
}
function sortBy(field: string) {
  const current = sortArrow(field);
  const sort = current === '↕' ? field+'_asc' : current === '↑' ? field+'_desc' : undefined;
  void router.push({ query: { ...route.query, sort, page: undefined } });
}
function search() {
  router.push({
    path: base.value + '/people',
    query: {
      q: filters.q || undefined,
      generation: filters.generation,
      gender: filters.gender || undefined,
      issue: filters.issue || undefined,
      sort: filters.sort === 'relevance' ? undefined : filters.sort,
    },
  });
}
function changePage(value: number) {
  router.push({ query: { ...route.query, page: value } });
}
async function create(data: PersonInput) {
  saving.value = true;
  try {
    const { person } = await api.createPerson({
      ...data,
      family_id: familyId.value,
    });
    creating.value = false;
    void useFamilies().load(true);
    await router.push(base.value + '/person/' + person.id);
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : t('添加失败'));
  } finally {
    saving.value = false;
  }
}
watch(() => [route.query, familyId.value], load, { immediate: true });
</script>
<style scoped>
.person-row-actions { justify-content: center; margin-left: 0; flex-wrap: nowrap; }
</style>
